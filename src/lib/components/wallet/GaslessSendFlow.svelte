<script lang="ts">
	import { t } from 'svelte-i18n';
	import { estimateFee, sendToken, checkSufficientBalance } from '$lib/wallet/gasless-store';
	import { TOKENS, USDT0_ADDRESS } from '$lib/wallet/gasless.config';
	import type { FeeEstimate } from '$lib/types/gasless.types';
	import GaslessConfirmDialog from './GaslessConfirmDialog.svelte';
	import GaslessErrorDisplay from './GaslessErrorDisplay.svelte';
	import PendingTransactionScreen from './PendingTransactionScreen.svelte';
	import TransactionSuccessScreen from './TransactionSuccessScreen.svelte';
	import IconSend from '~icons/mdi/send';
	import IconClose from '~icons/mdi/close';

	// -----------------------------------------------------------------------
	// Props
	// -----------------------------------------------------------------------

	let {
		onCancel
	}: {
		onCancel: () => void;
	} = $props();

	// -----------------------------------------------------------------------
	// State
	// -----------------------------------------------------------------------

	type FlowStep = 'input' | 'confirm' | 'pending' | 'success' | 'error';

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

	// Balance check state
	let balanceCheck = $state<{
		sufficient: boolean;
		balance: bigint;
		required: bigint;
	} | null>(null);
	let isCheckingBalance = $state(false);

	// -----------------------------------------------------------------------
	// Derived
	// -----------------------------------------------------------------------

	const selectedTokenInfo = $derived(
		TOKENS.find(t => t.address.toLowerCase() === selectedToken.toLowerCase())
	);

	const amountBigInt = $derived.by(() => {
		if (!amount || !selectedTokenInfo) return 0n;
		try {
			const parts = amount.split('.');
			const whole = parts[0] || '0';
			const frac = (parts[1] || '').padEnd(selectedTokenInfo.decimals, '0').slice(0, selectedTokenInfo.decimals);
			return BigInt(whole) * (10n ** BigInt(selectedTokenInfo.decimals)) + BigInt(frac);
		} catch {
			return 0n;
		}
	});

	const isValidForm = $derived(
		recipient.length > 0 && amountBigInt > 0n && selectedTokenInfo !== undefined
	);

	const hasInsufficientBalance = $derived(
		balanceCheck !== null && !balanceCheck.sufficient
	);

	// -----------------------------------------------------------------------
	// Fee estimation
	// -----------------------------------------------------------------------

	async function handleEstimate() {
		if (!isValidForm || isEstimating) return;
		isEstimating = true;
		estimationError = null;
		feeEstimate = null;
		
		try {
			// Get JWT from localStorage or session
			const jwt = localStorage.getItem('auth_token') || '';
			
			// Run balance check and fee estimation in parallel
			const [estimate, balance] = await Promise.all([
				estimateFee(selectedToken, amountBigInt, recipient, jwt),
				checkSufficientBalance(selectedToken, recipient, amountBigInt, BigInt(feeEstimate?.feeBuffer || '0')),
			]);
			
			feeEstimate = estimate;
			balanceCheck = balance;
			
			// Re-run balance check with actual fee buffer
			if (estimate.feeBuffer) {
				balanceCheck = await checkSufficientBalance(
					selectedToken,
					recipient,
					amountBigInt,
					BigInt(estimate.feeBuffer)
				);
			}
			
			step = 'confirm';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Fee estimation failed';
			estimationError = msg;
		} finally {
			isEstimating = false;
		}
	}

	// -----------------------------------------------------------------------
	// Send transaction
	// -----------------------------------------------------------------------

	async function handleConfirmSend() {
		if (isSending || !feeEstimate) return;
		isSending = true;
		sendError = null;
		
		try {
			const jwt = localStorage.getItem('auth_token') || '';
			const smartAccount = null; // Would be from gaslessWallet store in production
			
			const txHash = await sendToken(
				selectedToken,
				recipient,
				amountBigInt,
				BigInt(feeEstimate.feeBuffer),
				{
					callGasLimit: 200_000n,
					verificationGasLimit: 50_000n,
					preVerificationGas: 20_000n,
				},
				jwt,
				smartAccount
			);
			
			pendingTxHash = txHash;
			step = 'pending';
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Transaction failed';
			sendError = msg;
			step = 'error';
		} finally {
			isSending = false;
		}
	}

	// -----------------------------------------------------------------------
	// Reset / navigation
	// -----------------------------------------------------------------------

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

	function handlePendingComplete(txHash: string) {
		successTxHash = txHash;
		step = 'success';
	}
</script>

<div class="flex min-h-0 flex-1 flex-col">
	<!-- Step: Pending Transaction -->
	{#if step === 'pending'}
		<PendingTransactionScreen
			amountSats={0}
			amountUSD={0}
			address={recipient}
			network="usdt-arbitrum"
			txHash={pendingTxHash}
			onClose={onCancel}
		/>

	<!-- Step: Success -->
	{:else if step === 'success'}
		<TransactionSuccessScreen
			txHash={successTxHash}
			network="usdt-arbitrum"
			amount={0}
			recipient={recipient}
			onClose={onCancel}
		/>

	<!-- Step: Confirm Dialog -->
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

	<!-- Step: Error -->
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

	<!-- Step: Input Form -->
	{:else}
		<div class="space-y-4 p-4">
			<!-- Header -->
			<div class="flex items-center justify-between">
				<h3 class="text-lg font-bold">{$t('wallet.gasless_send.title')}</h3>
				<button class="btn btn-ghost btn-sm btn-circle" onclick={onCancel}>
					<IconClose class="h-5 w-5" />
				</button>
			</div>
			
			<!-- Token Selector -->
			<div class="form-control">
				<label class="label" for="gasless-token">
					<span class="label-text text-sm font-medium">{$t('wallet.gasless_send.token')}</span>
				</label>
				<select
					id="gasless-token"
					class="select select-bordered w-full"
					bind:value={selectedToken}
				>
					{#each TOKENS as token (token.address)}
						<option value={token.address}>{token.symbol}</option>
					{/each}
				</select>
			</div>
			
			<!-- Recipient Input -->
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
			
			<!-- Amount Input -->
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
			
			<!-- Balance warning -->
			{#if hasInsufficientBalance}
				<div class="alert alert-warning py-2 text-sm">
					<span>{$t('wallet.gasless_send.insufficient_balance')}</span>
				</div>
			{/if}
			
			<!-- Estimation Error -->
			{#if estimationError}
				<GaslessErrorDisplay
					error={estimationError}
					onRetry={handleEstimate}
				/>
			{/if}
			
			<!-- Action Buttons -->
			<div class="flex gap-3">
				<button class="btn btn-error flex-1" onclick={onCancel}>
					{$t('common.cancel')}
				</button>
				<button
					class="btn btn-primary flex-1"
					onclick={handleEstimate}
					disabled={!isValidForm || isEstimating}
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