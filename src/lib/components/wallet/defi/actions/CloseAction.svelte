<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { USDT0_ARBITRUM, WBTC_ARBITRUM } from '$lib/services/defi/aave.service';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import LoanHealthBadge from '../LoanHealthBadge.svelte';

	const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const POOL_ABI = [
		'function multicall(bytes[] calldata data) external returns (bytes[] memory)',
		'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)',
		'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
	];
	const ERC20_ABI = [
		'function allowance(address owner, address spender) view returns (uint256)',
		'function approve(address spender, uint256 amount) returns (bool)'
	];
	const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

	interface Props {
		walletId: string;
		address: string;
		onSuccess: () => void;
		onSwitchAction: (action: string) => void;
	}

	let { walletId, address, onSuccess, onSwitchAction }: Props = $props();

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let totalDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let totalCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentLtvPct = $derived(
		totalCollateralUsd > 0 ? (totalDebtUsd / totalCollateralUsd) * 100 : 0
	);
	let hasDebt = $derived(totalDebtUsd > 0);

	// USDT0 balance check
	let usdt0BalanceNum = $derived.by(() => {
		if (walletId === 'builtin') {
			return parseFloat($walletStore.arb?.formattedUsdt0Balance ?? '0') || 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1_000_000;
	});
	let hasEnoughUsdt0 = $derived(usdt0BalanceNum >= totalDebtUsd);

	let showConfirmModal = $state(false);
	let isProcessing = $state(false);
	let _txPhase: 'idle' | 'closing' | 'done' = $state('idle');
	let error = $state<string | null>(null);
	let successTxHash = $state<string | null>(null);
	let successTimeoutId: ReturnType<typeof setTimeout> | null = $state(null);

	onDestroy(() => {
		if (successTimeoutId) clearTimeout(successTimeoutId);
	});

	function openConfirm() {
		error = null;
		successTxHash = null;
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = true;
	}

	function confirmSuccess() {
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = false;
		onSuccess();
		successTxHash = null;
	}

	function handleRetry() {
		error = null;
		void handleRepayAndClose();
	}

	function closeModal() {
		if (isProcessing) return;
		if (successTimeoutId) {
			clearTimeout(successTimeoutId);
			successTimeoutId = null;
		}
		showConfirmModal = false;
		successTxHash = null;
	}

	function sanitizeErrorForLog(err: unknown): Record<string, unknown> {
		if (!(err instanceof Error)) return { type: typeof err, message: 'Unknown error' };
		const safeMessage = err.message
			.replace(/0x[0-9a-fA-F]{64,}/g, '[hex-redacted]')
			.replace(/transaction="[^"]*"/g, 'transaction="[redacted]"')
			.replace(/info=\{[^}]*\}/g, 'info=[redacted]');
		return {
			name: err.name,
			message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '...' : safeMessage
		};
	}

	async function handleRepayAndClose() {
		if (isProcessing) return;
		isProcessing = true;
		error = null;
		successTxHash = null;

		try {
			_txPhase = 'closing';
			const arbProvider = new ethers.JsonRpcProvider(ARB_RPC);
			const normalizedAddr = ethers.getAddress(address.toLowerCase());

			// Step 1: Check USDT0 allowance — Aave pool needs approval to spend USDT0 for repay
			if (totalDebtUsd > 0) {
				console.log('[CloseAction] Checking USDT0 allowance...');
				const usdt0Contract = new ethers.Contract(USDT0_ARBITRUM, ERC20_ABI, arbProvider);
				const { data: currentAllowance, error: allowanceErr } = await tryCatch(
					usdt0Contract.allowance(normalizedAddr, AAVE_POOL)
				);
				if (allowanceErr) {
					console.warn('[CloseAction] Allowance check failed:', allowanceErr);
					throw new Error('Could not check USDT0 allowance. Please try again.');
				}

				const needed = BigInt(Math.ceil(totalDebtUsd * 1_000_000));
				console.log(
					'[CloseAction] Current allowance:',
					currentAllowance?.toString(),
					'Needed:',
					needed.toString()
				);

				if ((currentAllowance ?? 0n) < needed) {
					console.log('[CloseAction] Approving USDT0...');
					const erc20Iface = new Interface(ERC20_ABI);
					const approveData = erc20Iface.encodeFunctionData('approve', [
						AAVE_POOL,
						ethers.MaxUint256
					]);

					if (walletId === 'builtin') {
						const { data: approveHash, error: approveErr } = await tryCatch(
							sendArbitrumTransaction({ to: USDT0_ARBITRUM, data: approveData, value: '0' })
						);
						if (approveErr || !approveHash) {
							console.warn('[CloseAction] Approve tx failed:', approveErr);
							throw new Error('USDT0 approval failed.');
						}
						console.log('[CloseAction] Approve tx sent:', approveHash);
						const { data: approveReceipt, error: approveReceiptErr } = await tryCatch(
							arbProvider.waitForTransaction(approveHash, 60000)
						);
						if (approveReceiptErr || !approveReceipt) {
							console.warn('[CloseAction] Approve receipt failed:', approveReceiptErr);
							throw new Error('USDT0 approval transaction could not be confirmed.');
						}
						if (approveReceipt.status === 0) {
							throw new Error('USDT0 approval transaction reverted.');
						}
						console.log('[CloseAction] Approve confirmed');
					} else {
						const evmSigner = getEvmSigner(walletId);
						if (!evmSigner) throw new Error('No signer available');
						const { data: approveResult, error: approveErr } = await tryCatch(
							evmSigner.sendTransaction({
								to: USDT0_ARBITRUM,
								data: approveData as `0x${string}`,
								value: 0n,
								chainId: 42161
							})
						);
						if (approveErr || !approveResult) throw new Error('USDT0 approval failed.');
					}
				} else {
					console.log('[CloseAction] USDT0 allowance sufficient, skipping approve');
				}
			}

			// Step 2: Encode repay + withdraw multicall
			const poolIface = new Interface(POOL_ABI);
			const repayCallData = poolIface.encodeFunctionData('repay', [
				USDT0_ARBITRUM,
				ethers.MaxUint256,
				2,
				normalizedAddr
			]);
			const withdrawCallData = poolIface.encodeFunctionData('withdraw', [
				WBTC_ARBITRUM,
				ethers.MaxUint256,
				normalizedAddr
			]);
			const multicallData = poolIface.encodeFunctionData('multicall', [
				[repayCallData, withdrawCallData]
			]);

			// Step 3: Send multicall and wait for receipt
			console.log('[CloseAction] Sending multicall...');
			let txHash: string;

			if (walletId === 'builtin') {
				const { data: hash, error: txErr } = await tryCatch(
					sendArbitrumTransaction({ to: AAVE_POOL, data: multicallData, value: '0' })
				);
				if (txErr || !hash) {
					console.warn('[CloseAction] Multicall send failed:', txErr);
					throw new Error(extractContractError(txErr).userMessage);
				}
				console.log('[CloseAction] Multicall tx sent:', hash);

				const { data: receipt, error: receiptErr } = await tryCatch(
					arbProvider.waitForTransaction(hash, 60000)
				);
				if (receiptErr || !receipt) {
					console.warn('[CloseAction] Multicall receipt failed:', receiptErr);
					throw new Error(
						'Transaction was sent but could not be confirmed. Check your wallet for the status.'
					);
				}
				console.log('[CloseAction] Multicall receipt status:', receipt.status);
				if (receipt.status === 0) {
					throw new Error('Transaction reverted on-chain. No changes were made to your position.');
				}
				txHash = hash;
			} else {
				const evmSigner = getEvmSigner(walletId);
				if (!evmSigner) throw new Error('No signer available');
				const { data: result, error: txErr } = await tryCatch(
					evmSigner.sendTransaction({
						to: AAVE_POOL,
						data: multicallData as `0x${string}`,
						value: 0n,
						chainId: 42161
					})
				);
				if (txErr || !result) {
					throw new Error(extractContractError(txErr).userMessage);
				}
				txHash = result.txHash;
			}

			console.log('[CloseAction] Position closed successfully');
			_txPhase = 'done';
			isProcessing = false;
			defiPositions.invalidate(walletId);
			successTxHash = txHash;
			successTimeoutId = setTimeout(() => {
				if (successTxHash) {
					showConfirmModal = false;
					onSuccess();
					successTxHash = null;
				}
			}, 5000);
		} catch (err) {
			const contractErr = extractContractError(err);
			console.warn('[CloseAction] Close failed:', sanitizeErrorForLog(err));
			error = contractErr.userMessage;
			_txPhase = 'idle';
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content/70 text-xs">{$t('wallet.defi.position.action_desc_close')}</p>

	{#if hasDebt}
		<div class="border-primary bg-base-100 rounded-lg border p-3 text-sm">
			<p>
				{$t('wallet.defi.position.close_desc_has_debt', {
					values: { amount: `$${totalDebtUsd.toFixed(2)}` }
				})}
			</p>
		</div>

		{#if !hasEnoughUsdt0}
			<div class="alert alert-soft alert-warning py-2 text-xs">
				{$t('wallet.defi.position.close_insufficient_usdt0', {
					values: { amount: `$${totalDebtUsd.toFixed(2)}` }
				})}
			</div>
		{/if}

		<button
			type="button"
			class="btn btn-primary min-h-[48px] w-full"
			disabled={!hasEnoughUsdt0 || isProcessing}
			onclick={openConfirm}
		>
			{$t('wallet.defi.position.close_repay_and_close')}
		</button>
	{:else}
		<div class="border-primary bg-base-100 rounded-lg border p-3 text-sm">
			<p class="text-base-content/70">{$t('wallet.defi.position.close_no_debt')}</p>
		</div>

		<button
			type="button"
			class="btn btn-primary min-h-[48px] w-full"
			onclick={() => onSwitchAction('withdraw')}
		>
			{$t('wallet.defi.position.close_withdraw_all')}
		</button>
	{/if}
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.position.close_position')}</h3>

			{#if successTxHash}
				<!-- Success state -->
				<div class="flex flex-col items-center gap-3 py-6">
					<div class="bg-success/10 flex h-12 w-12 items-center justify-center rounded-full">
						<svg class="text-success h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M5 13l4 4L19 7"
							/>
						</svg>
					</div>
					<p class="text-sm font-medium">{$t('wallet.defi.shared.tx_confirmed')}</p>
					<p class="text-base-content/60 text-xs">{$t('wallet.defi.shared.closing_shortly')}</p>
				</div>
				<div class="modal-action">
					<button class="btn btn-primary w-full" onclick={confirmSuccess}>
						{$t('wallet.defi.wizard.done')}
					</button>
				</div>
			{:else}
				<div class="space-y-4 py-4">
					<p class="text-sm">
						{$t('wallet.defi.position.confirm_close_desc')}
					</p>

					<LoanHealthBar {totalCollateralUsd} {totalDebtUsd} availableBorrowsUsd={0} />

					{#if currentLtvPct > 0}
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">{$t('wallet.defi.position.projected_ltv')}</span>
							<LoanHealthBadge ltvPct={currentLtvPct} showLtv />
						</div>
					{/if}

					{#if error}
						<div class="alert alert-error py-2">
							<div class="flex flex-col gap-2">
								<span class="text-sm">{error}</span>
								<button class="btn btn-error btn-sm btn-soft self-end" onclick={handleRetry}>
									{$t('wallet.defi.shared.retry')}
								</button>
							</div>
						</div>
					{/if}

					{#if isProcessing}
						<div class="flex items-center gap-2 text-sm">
							<span class="loading loading-spinner loading-sm"></span>
							<span>{$t('wallet.defi.position.close_closing')}</span>
						</div>
					{/if}
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" onclick={closeModal} disabled={isProcessing}>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleRepayAndClose} disabled={isProcessing}>
						{#if isProcessing}
							<span class="loading loading-spinner loading-sm"></span>
						{/if}
						{$t('wallet.defi.position.close_confirm_button')}
					</button>
				</div>
			{/if}
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close"></button>
	</div>
{/if}
