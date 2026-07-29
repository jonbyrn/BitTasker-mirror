<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { formatSats, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { WBTC_ARBITRUM, calculateBtcLiquidationPrice } from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import LoanHealthBadge from '../LoanHealthBadge.svelte';

	interface Props {
		walletId: string;
		address: string;
		onSuccess: () => void;
		minimal?: boolean;
		onProjectedValues?: (vals: {
			debt?: number;
			collateral?: number;
			available?: number;
			liqPrice?: number;
		}) => void;
	}

	let { walletId, address, onSuccess, minimal = false, onProjectedValues }: Props = $props();

	let amountSats = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let showConfirmModal = $state(false);
	let confirmError = $state<string | null>(null);
	let successTxHash = $state<string | null>(null);
	let successTimeoutId: ReturnType<typeof setTimeout> | null = $state(null);
	let isOnline = $derived($browserNetworkStatus.online);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	// Max safe withdraw: keep LTV at or below 50%
	let maxSafeSats = $derived.by(() => {
		if (currentDebtUsd <= 0) {
			if (currentCollateralUsd <= 0 || btcPrice.price <= 0) return 0;
			return Math.floor((currentCollateralUsd / btcPrice.price) * 100_000_000);
		}
		const minCollateralUsd = currentDebtUsd * 2;
		const maxWithdrawUsd = Math.max(0, currentCollateralUsd - minCollateralUsd);
		if (maxWithdrawUsd <= 0 || btcPrice.price <= 0) return 0;
		return Math.floor((maxWithdrawUsd / btcPrice.price) * 100_000_000);
	});

	// Max contract withdraw: what Aave actually allows (HF must stay ≥ 1.0)
	// collateral - (debt / liquidation_threshold) = max you can pull out
	let maxContractSats = $derived.by(() => {
		if (currentDebtUsd <= 0) {
			if (currentCollateralUsd <= 0 || btcPrice.price <= 0) return 0;
			return Math.floor((currentCollateralUsd / btcPrice.price) * 100_000_000);
		}
		const liqThresholdPct = liqThreshold / 10_000;
		const minCollateralUsd = currentDebtUsd / liqThresholdPct;
		const maxWithdrawUsd = Math.max(0, currentCollateralUsd - minCollateralUsd);
		if (maxWithdrawUsd <= 0 || btcPrice.price <= 0) return 0;
		return Math.floor((maxWithdrawUsd / btcPrice.price) * 100_000_000);
	});

	let maxSafeDisplay = $derived(Math.floor(maxSafeSats));

	let amountNum = $derived.by(() => {
		const n = parseInt(amountSats, 10);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let amountUsd = $derived((amountNum / 100_000_000) * btcPrice.price);
	let projectedCollateral = $derived(Math.max(0, currentCollateralUsd - amountUsd));

	let projectedLtv = $derived(
		projectedCollateral > 0 ? (currentDebtUsd / projectedCollateral) * 100 : 0
	);

	let exceedsSafe = $derived(amountNum > maxSafeDisplay);
	let exceedsMax = $derived(amountNum > maxContractSats);
	let canWithdraw = $derived(amountNum > 0 && isOnline && !exceedsMax);

	let projectedLiqPrice = $derived.by(() => {
		if (projectedCollateral <= 0 || currentDebtUsd <= 0) return 0;
		const collateralBtc = btcPrice.price > 0 ? projectedCollateral / btcPrice.price : 0;
		const result = calculateBtcLiquidationPrice(
			currentDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
		return result?.liquidationBtcPrice ?? 0;
	});

	let projectedAvailableBorrow = $derived.by(() => {
		if (projectedCollateral <= 0) return 0;
		const maxBorrow = projectedCollateral * (7300 / 10_000);
		return Math.max(0, maxBorrow - currentDebtUsd);
	});

	$effect(() => {
		if (minimal && onProjectedValues) {
			onProjectedValues({
				collateral: projectedCollateral,
				available: projectedAvailableBorrow,
				liqPrice: projectedLiqPrice
			});
		}
	});

	onDestroy(() => {
		if (successTimeoutId) clearTimeout(successTimeoutId);
	});

	function setMaxSafe() {
		if (maxSafeDisplay > 0) {
			amountSats = maxSafeDisplay.toString();
			sliderPercent =
				maxContractSats > 0 ? Math.min(100, (maxSafeDisplay / maxContractSats) * 100) : 0;
		}
	}

	function handleAmountChange(v: string) {
		amountSats = v.replace(/[^0-9]/g, '');
		confirmError = null;
		const n = parseInt(amountSats || '0', 10);
		sliderPercent =
			isFinite(n) && n > 0 && maxContractSats > 0 ? Math.min(100, (n / maxContractSats) * 100) : 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = pct;
		if (pct <= 0 || maxContractSats <= 0) {
			amountSats = '';
			return;
		}
		amountSats = Math.round((maxContractSats * pct) / 100).toString();
	}

	function openConfirm() {
		confirmError = null;
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
		confirmError = null;
		void handleWithdraw();
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

	const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const POOL_ABI = [
		'function withdraw(address asset, uint256 amount, address to) external returns (uint256)'
	];
	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	function sanitizeErrorForLog(error: unknown): Record<string, unknown> {
		if (!(error instanceof Error)) return { type: typeof error, message: 'Unknown error' };
		const safeMessage = error.message
			.replace(/0x[0-9a-fA-F]{64,}/g, '[hex-redacted]')
			.replace(/transaction="[^"]*"/g, 'transaction="[redacted]"')
			.replace(/info=\{[^}]*\}/g, 'info=[redacted]');
		return {
			name: error.name,
			message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '...' : safeMessage
		};
	}

	async function handleWithdraw() {
		if (!canWithdraw || isProcessing) return;
		isProcessing = true;
		confirmError = null;
		successTxHash = null;

		Sentry.addBreadcrumb({
			category: 'defi.withdraw',
			message: 'sending withdraw',
			data: { amountSats: amountNum.toString() }
		});

		try {
			const rawAmount = BigInt(amountNum);
			const maxRaw = BigInt(maxContractSats);
			const finalAmount = rawAmount > maxRaw ? maxRaw : rawAmount;
			const normalizedAddr = ethers.getAddress(address.toLowerCase());

			const poolIface = new Interface(POOL_ABI);
			const withdrawData = poolIface.encodeFunctionData('withdraw', [
				WBTC_ARBITRUM,
				finalAmount,
				normalizedAddr
			]);

			let txHash: string;

			if (walletId === 'builtin') {
				const { data: hash, error: txErr } = await tryCatch(
					sendArbitrumTransaction({ to: AAVE_POOL, data: withdrawData, value: '0' })
				);
				if (txErr || !hash) {
					throw new Error(extractContractError(txErr).userMessage);
				}

				const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
				const { data: receipt, error: receiptErr } = await tryCatch(
					arbProvider.waitForTransaction(hash, 60_000)
				);
				if (receiptErr || !receipt || receipt.status === 0) {
					throw new Error('Transaction reverted on-chain.');
				}
				txHash = hash;
			} else {
				const evmSigner = getEvmSigner(walletId);
				if (!evmSigner) throw new Error('No signer available');
				const { data: result, error: txErr } = await tryCatch(
					evmSigner.sendTransaction({
						to: AAVE_POOL,
						data: withdrawData as `0x${string}`,
						value: 0n,
						chainId: 42161
					})
				);
				if (txErr || !result) {
					throw new Error(extractContractError(txErr).userMessage);
				}
				txHash = result.txHash;
			}

			Sentry.addBreadcrumb({
				category: 'defi.withdraw',
				message: 'withdraw confirmed',
				data: { txHash }
			});
			defiPositions.invalidate(walletId);
			isProcessing = false;
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
			console.warn('[WithdrawAction] Withdraw failed:', sanitizeErrorForLog(err));
			Sentry.addBreadcrumb({
				category: 'defi.withdraw',
				message: 'withdraw failed',
				data: { errorCode: contractErr.errorCode ?? 'UNKNOWN' }
			});
			confirmError = contractErr.userMessage;
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content/70 text-xs">{$t('wallet.defi.position.action_desc_withdraw')}</p>

	{#if !minimal}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.position.withdraw_warning')}
		</div>

		<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.wizard.max_safe')}</span>
				<span class="font-medium tabular-nums">
					{maxSafeDisplay > 0 ? formatSats(maxSafeDisplay) : '0'} Sats
				</span>
			</div>
		</div>
	{/if}

	<AmountInputSection
		variant="direct"
		tokenPrefix="Sats"
		amount={amountSats}
		onAmountChange={handleAmountChange}
		onUnitChange={() => {}}
		unit="sats"
		showPercentSlider={true}
		sliderDisabled={maxContractSats <= 0}
		percent={sliderPercent}
		onPercentChange={applyPercent}
		onMaxAmount={async () => setMaxSafe()}
		maxLabel={$t('wallet.defi.wizard.max_safe')}
		maxDisabled={maxSafeDisplay <= 0}
		disabled={!isOnline}
		hasInsufficientBalance={exceedsMax}
	/>

	{#if exceedsMax}
		<div class="alert alert-soft alert-error py-2 text-xs">
			{$t('wallet.defi.position.withdraw_exceeds_max', {
				values: { amount: `$${currentCollateralUsd.toFixed(2)}` }
			})}
		</div>
	{:else if exceedsSafe}
		<div class="alert alert-soft alert-warning py-2 text-xs">
			{$t('wallet.defi.position.withdraw_exceeds', {
				values: {
					ltv: projectedLtv.toFixed(1),
					liqPrice: Math.round(projectedLiqPrice).toLocaleString()
				}
			})}
		</div>
	{/if}

	{#if !minimal && (position || amountNum > 0)}
		<LoanHealthBar
			totalCollateralUsd={currentCollateralUsd}
			totalDebtUsd={currentDebtUsd}
			availableBorrowsUsd={Math.max(0, currentCollateralUsd * (7300 / 10_000) - currentDebtUsd)}
		/>
	{/if}

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canWithdraw || isProcessing}
		onclick={openConfirm}
		aria-busy={isProcessing}
	>
		{isProcessing ? $t('wallet.defi.shared.pending_tx') : `Withdraw ${formatSats(amountNum)} Sats`}
	</button>
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.borrow.button_withdraw')}</h3>

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
						{$t('wallet.defi.position.confirm_withdraw_desc', {
							values: { amount: `${formatSats(amountNum)} Sats` }
						})}
					</p>

					<LoanHealthBar
						totalCollateralUsd={projectedCollateral}
						totalDebtUsd={currentDebtUsd}
						availableBorrowsUsd={projectedAvailableBorrow}
					/>

					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60">{$t('wallet.defi.position.projected_ltv')}</span>
						<LoanHealthBadge ltvPct={projectedLtv} showLtv />
					</div>

					{#if projectedLiqPrice > 0}
						<div class="flex items-center justify-between text-xs">
							<span class="text-base-content/60">{$t('wallet.defi.wizard.new_liq_price')}</span>
							<span class="font-medium tabular-nums"
								>${Math.round(projectedLiqPrice).toLocaleString()}</span
							>
						</div>
					{/if}

					{#if confirmError}
						<div class="alert alert-error py-2">
							<div class="flex flex-col gap-2">
								<span class="text-sm">{confirmError}</span>
								<button class="btn btn-error btn-sm btn-soft self-end" onclick={handleRetry}>
									{$t('wallet.defi.shared.retry')}
								</button>
							</div>
						</div>
					{/if}

					{#if isProcessing}
						<div class="flex items-center gap-2 text-sm">
							<span class="loading loading-spinner loading-xs"></span>
							<span>{$t('wallet.defi.shared.pending_tx')}</span>
						</div>
					{/if}
				</div>

				<div class="modal-action">
					<button class="btn btn-ghost" onclick={closeModal} disabled={isProcessing}>
						{$t('common.cancel')}
					</button>
					<button class="btn btn-primary" onclick={handleWithdraw} disabled={isProcessing}>
						{#if isProcessing}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('wallet.defi.borrow.button_withdraw')}
					</button>
				</div>
			{/if}
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close"></button>
	</div>
{/if}
