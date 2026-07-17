<script lang="ts">
	import { t } from 'svelte-i18n';
	import {
		estimateFee,
		sendToken,
		sendTokenDirect,
		checkSufficientBalance,
		checkETHBalance,
		walletAddress,
		walletReady,
		walletLoading,
		walletError
	} from '$lib/wallet/gasless-store';
	import { TOKENS, USDT0_ADDRESS, ALTO_URLS } from '$lib/wallet/gasless.config';
	import type { FeeEstimate } from '$lib/types/gasless.types';
	import GaslessConfirmDialog from './GaslessConfirmDialog.svelte';
	import GaslessErrorDisplay from './GaslessErrorDisplay.svelte';
	import PendingTransactionScreen from './PendingTransactionScreen.svelte';
	import TransactionSuccessScreen from './TransactionSuccessScreen.svelte';
	import IconSend from '~icons/mdi/send';
	import IconClose from '~icons/mdi/close';

	let {
		onCancel
	}: {
		onCancel: () => void;
	} = $props();

	type FlowStep = 'input' | 'confirm' | 'pending' | 'success' | 'error' | 'fallback-confirm';

	let step = $state<FlowStep>('input');
	let recipient = $state('');
	let amount = $state('');
	let selectedToken = $state(USDT0_ADDRESS);
	let feeEstimate = $state<FeeEstimate | null>(null);
	let estimationError = $state<string | null>(null);
	let sendError = $state<string | null>(null);
	let isEstimating = $state(false);
	let isSending = $state(false);
	let pendingTxHash = $state('');
	let successTxHash = $state('');
	let _isDirectFallback = $state(false);
	let ethBalance = $state<bigint | null>(null);

	let balanceCheck = $state<{
		sufficient: boolean;
		balance: bigint;
		required: bigint;
	} | null>(null);

	const selectedTokenInfo = $derived(
		TOKENS.find((tk) => tk.address.toLowerCase() === selectedToken.toLowerCase())
	);

	const amountBigInt = $derived.by(() => {
		if (!amount || !selectedTokenInfo) return 0n;
		try {
			const parts = amount.split('.');
			const whole = parts[0] || '0';
			const frac = (parts[1] || '')
				.padEnd(selectedTokenInfo.decimals, '0')
				.slice(0, selectedTokenInfo.decimals);
			return BigInt(whole) * 10n ** BigInt(selectedTokenInfo.decimals) + BigInt(frac);
		} catch {
			return 0n;
		}
	});

	const isValidForm = $derived(
		recipient.length > 0 && amountBigInt > 0n && selectedTokenInfo !== undefined
	);

	const hasInsufficientBalance = $derived(balanceCheck !== null && !balanceCheck.sufficient);

	async function handleEstimate() {
		if (!isValidForm || isEstimating) return;

		if (!$walletReady || !$walletAddress) {
			estimationError = 'Wallet not connected. Please connect your wallet first.';
			return;
		}

		isEstimating = true;
		estimationError = null;
		feeEstimate = null;

		try {
			const initialBalance = await checkSufficientBalance(
				selectedToken,
				$walletAddress,
				amountBigInt,
				0n
			);
			balanceCheck = initialBalance;

			if (!initialBalance.sufficient) {
				estimationError = 'Insufficient balance for transfer amount.';
				return;
			}

			const estimate = await estimateFee(selectedToken, amountBigInt, recipient);
			feeEstimate = estimate;

			balanceCheck = await checkSufficientBalance(
				selectedToken,
				$walletAddress,
				amountBigInt,
				BigInt(estimate.feeBuffer)
			);

			if (!balanceCheck.sufficient) {
				estimationError = 'Insufficient balance to cover transfer + network fee.';
				return;
			}

			step = 'confirm';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Fee estimation failed';
			estimationError = msg;
		} finally {
			isEstimating = false;
		}
	}

	async function handleConfirmSend() {
		if (isSending || !feeEstimate) return;
		isSending = true;
		sendError = null;

		try {
			const txHash = await sendToken(
				selectedToken,
				recipient,
				amountBigInt,
				BigInt(feeEstimate.feeBuffer),
				feeEstimate.estimatedGas
			);

			pendingTxHash = txHash;
			step = 'pending';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Transaction failed';

			// Detect relay failure (not a validation error) — offer direct fallback
			const isRelayError =
				msg.includes('relay') ||
				msg.includes('fetch') ||
				msg.includes('network') ||
				msg.includes('timeout') ||
				msg.includes('temporarily unavailable') ||
				msg.includes('ECONNREFUSED');

			if (isRelayError && $walletAddress) {
				try {
					const bal = await checkETHBalance($walletAddress);
					ethBalance = bal;
					if (bal > 0n) {
						sendError = msg;
						_isDirectFallback = true;
						step = 'fallback-confirm';
						isSending = false;
						return;
					}
				} catch {
					// ETH balance check failed — fall through to error state
				}
			}

			sendError = msg;
			step = 'error';
		} finally {
			isSending = false;
		}
	}

	/**
	 * Execute the direct ERC-20 transfer fallback (user pays gas in ETH).
	 */
	async function handleDirectFallback() {
		if (isSending) return;
		isSending = true;
		sendError = null;

		try {
			const txHash = await sendTokenDirect(selectedToken, recipient, amountBigInt);
			successTxHash = txHash;
			step = 'success';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Direct transaction failed';
			sendError = msg;
			step = 'error';
		} finally {
			isSending = false;
		}
	}

	function handleRetry() {
		sendError = null;
		step = 'input';
	}

	function handleCancel() {
		step = 'input';
		feeEstimate = null;
		estimationError = null;
		sendError = null;
	}

	/**
	 * Poll the Alto bundler for the UserOp receipt after submission.
	 * When the UserOp is confirmed on-chain, transitions to 'success' step.
	 * If the UserOp reverted, transitions to 'error' step.
	 * Cleanup stops polling when component unmounts or step changes.
	 */
	$effect(() => {
		if (step !== 'pending' || !pendingTxHash) return;

		let cancelled = false;
		const maxAttempts = 30;
		const intervalMs = 3000;

		async function poll() {
			for (let i = 0; i < maxAttempts; i++) {
				if (cancelled) return;
				await new Promise((r) => setTimeout(r, intervalMs));
				if (cancelled) return;

				const altoUrl = ALTO_URLS[0];
				if (!altoUrl) continue;

				try {
					const response = await fetch(altoUrl, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							jsonrpc: '2.0',
							method: 'eth_getUserOperationReceipt',
							params: [pendingTxHash],
							id: 1
						})
					});

					if (!response.ok) continue;
					const data = await response.json();

					if (data.result) {
						if (data.result.success) {
							successTxHash = pendingTxHash;
							step = 'success';
						} else {
							sendError = 'Transaction reverted on-chain';
							step = 'error';
						}
						return;
					}
				} catch {
					// Network error — retry on next interval
				}
			}
		}

		poll();

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="flex min-h-0 flex-1 flex-col">
	{#if step === 'pending'}
		<PendingTransactionScreen
			amountSats={0}
			amountUSD={parseFloat(amount) || 0}
			address={recipient}
			network="usdt-arbitrum"
			networkOptions={{}}
			txHash={pendingTxHash}
			onClose={onCancel}
		/>
	{:else if step === 'success'}
		<TransactionSuccessScreen
			txHash={successTxHash}
			network="usdt-arbitrum"
			amount={parseFloat(amount) || 0}
			{recipient}
			onClose={onCancel}
		/>
	{:else if step === 'confirm'}
		<GaslessConfirmDialog
			amount={amountBigInt}
			{recipient}
			tokenAddress={selectedToken}
			{feeEstimate}
			onConfirm={handleConfirmSend}
			onCancel={handleCancel}
			isLoading={isSending}
			error={sendError}
		/>
	{:else if step === 'error'}
		<div class="space-y-4 p-4">
			<h3 class="text-lg font-bold">{$t('wallet.gasless_send.error')}</h3>
			<GaslessErrorDisplay error={sendError} onRetry={handleRetry} />
			<div class="flex gap-3">
				<button class="btn btn-error flex-1" onclick={onCancel}>
					{$t('common.cancel')}
				</button>
				<button class="btn btn-primary flex-1" onclick={handleRetry}>
					{$t('common.retry')}
				</button>
			</div>
		</div>
	{:else if step === 'fallback-confirm'}
		<div class="space-y-4 p-4" role="alert" aria-live="polite">
			<h3 class="text-lg font-bold">{$t('wallet.gasless_send.fallback_title')}</h3>
			<div class="alert alert-warning text-sm">
				<span>{$t('wallet.gasless_send.fallback_description')}</span>
			</div>
			{#if ethBalance !== null}
				<div class="text-sm opacity-70">
					{$t('wallet.gasless_send.fallback_eth_balance', {
						values: { balance: (Number(ethBalance) / 1e18).toFixed(6) }
					})}
				</div>
			{/if}
			<div class="flex gap-3">
				<button class="btn btn-ghost flex-1" onclick={handleRetry}>
					{$t('wallet.gasless_send.fallback_cancel')}
				</button>
				<button class="btn btn-warning flex-1" onclick={handleDirectFallback} disabled={isSending}>
					{#if isSending}
						<span
							class="loading loading-spinner loading-sm"
							role="status"
							aria-label={$t('common.loading')}
						></span>
					{/if}
					{$t('wallet.gasless_send.fallback_send_with_eth')}
				</button>
			</div>
		</div>
	{:else}
		<div class="space-y-4 p-4">
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-bold">{$t('wallet.gasless_send.title')}</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={onCancel}>
					<IconClose class="h-5 w-5" />
				</button>
			</div>

			{#if $walletLoading}
				<div class="flex items-center justify-center gap-3 py-4" role="status">
					<span class="loading loading-spinner loading-md"></span>
					<span class="text-sm opacity-70">{$t('wallet.gasless_send.initializing_wallet')}</span>
				</div>
			{:else if $walletError}
				<div class="alert alert-error py-2 text-sm" role="alert" aria-live="assertive">
					<span>{$walletError}</span>
				</div>
			{:else if !$walletReady}
				<div class="alert alert-warning py-2 text-sm" role="alert">
					<span>{$t('wallet.gasless_send.wallet_not_connected')}</span>
				</div>
			{/if}

			<div class="form-control">
				<label class="label" for="gasless-token">
					<span class="label-text text-sm font-medium">{$t('wallet.gasless_send.token')}</span>
				</label>
				<select id="gasless-token" class="select select-bordered w-full" bind:value={selectedToken}>
					{#each TOKENS as token (token.address)}
						<option value={token.address}>{token.symbol}</option>
					{/each}
				</select>
			</div>

			<div class="form-control">
				<label class="label" for="gasless-recipient">
					<span class="label-text text-sm font-medium">{$t('wallet.gasless_send.recipient')}</span>
				</label>
				<input
					id="gasless-recipient"
					type="text"
					class="input input-bordered w-full"
					placeholder={$t('wallet.gasless_send.recipient_placeholder')}
					bind:value={recipient}
				/>
			</div>

			<div class="form-control">
				<label class="label" for="gasless-amount">
					<span class="label-text text-sm font-medium">{$t('wallet.gasless_send.amount')}</span>
					<span class="label-text-alt text-xs opacity-60">
						{selectedTokenInfo?.symbol || ''}
					</span>
				</label>
				<input
					id="gasless-amount"
					type="number"
					class="input input-bordered w-full"
					placeholder="0.00"
					min="0"
					step="0.01"
					bind:value={amount}
				/>
			</div>

			{#if hasInsufficientBalance}
				<div class="alert alert-warning py-2 text-sm">
					<span>{$t('wallet.gasless_send.insufficient_balance')}</span>
				</div>
			{/if}

			{#if estimationError}
				<GaslessErrorDisplay error={estimationError} onRetry={handleEstimate} />
			{/if}

			<div class="flex gap-3">
				<button class="btn btn-error flex-1" onclick={onCancel}>
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary flex-1"
					onclick={handleEstimate}
					disabled={!isValidForm || isEstimating || !$walletReady}
				>
					{#if isEstimating}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<IconSend class="h-4 w-4" />
					{/if}
					{$t('wallet.gasless_send.estimate_fee')}
				</button>
			</div>
		</div>
	{/if}
</div>
