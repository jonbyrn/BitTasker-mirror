<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import { ethers, Interface } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { walletStore, sendArbitrumTransaction } from '$lib/stores/wallet.store';
	import { connectedWalletsStore, getEvmSigner } from '$lib/stores/connected-wallets.store';
	import { USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
		calculateProjectedHealthFactor,
		calculateBtcLiquidationPrice,
		deriveHealthStatus
	} from '$lib/services/defi/aave.service';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import HealthFactorGauge from '../HealthFactorGauge.svelte';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';
	import LoanHealthBar from '../LoanHealthBar.svelte';
	import LoanHealthBadge from '../LoanHealthBadge.svelte';

	const AAVE_POOL = '0x794a61358D6845594F94dc1DB02A252b5b4814aD';
	const POOL_ABI = [
		'function repay(address asset, uint256 amount, uint256 interestRateMode, address onBehalfOf) external returns (uint256)'
	];

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

	let amount = $state('');
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
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentHf = $derived(position?.healthFactor ?? 999);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let usdt0BalanceNum = $derived.by(() => {
		if (walletId === 'builtin') {
			const raw = $walletStore.arb?.usdt0Balance;
			if (raw && raw !== '0') return Number(raw) / 1_000_000;
			return parseFloat($walletStore.arb?.formattedUsdt0Balance ?? '0') || 0;
		}
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['usdt0-arb']?.raw ?? 0) / 1_000_000;
	});

	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let projectedHf = $derived.by(() => {
		if (amountNum <= 0) return currentHf;
		return calculateProjectedHealthFactor(
			currentCollateralUsd,
			currentDebtUsd,
			liqThreshold,
			0,
			-amountNum
		);
	});

	let healthStatus = $derived(deriveHealthStatus(projectedHf));
	let maxRepayUsd = $derived(Math.min(currentDebtUsd, usdt0BalanceNum));
	// Rounded max for display/slider — allows the toFixed(2) max amount to pass canRepay
	let maxRepayDisplay = $derived(Math.round(maxRepayUsd * 100) / 100);
	// Exact raw max for the transaction — uses raw balance directly, no floating point
	let maxRepayRaw = $derived.by(() => {
		const rawBalance =
			walletId === 'builtin'
				? BigInt($walletStore.arb?.usdt0Balance ?? '0')
				: BigInt(
						$connectedWalletsStore.wallets.find((w) => w.id === walletId)?.balances?.['usdt0-arb']
							?.raw ?? 0
					);
		const rawDebt = BigInt(Math.round(currentDebtUsd * 1_000_000));
		return rawBalance < rawDebt ? rawBalance : rawDebt;
	});
	let canRepay = $derived(amountNum > 0 && isOnline && amountNum <= maxRepayDisplay);
	let exceedsDebt = $derived(amountNum > 0 && amountNum > maxRepayDisplay + 0.009);

	let projectedDebtUsd = $derived(Math.max(0, currentDebtUsd - amountNum));
	let projectedLtvPct = $derived(
		currentCollateralUsd > 0 ? (projectedDebtUsd / currentCollateralUsd) * 100 : 0
	);
	let projectedAvailable = $derived.by(() => {
		if (currentCollateralUsd <= 0) return 0;
		const maxBorrow = currentCollateralUsd * (7300 / 10_000);
		return Math.max(0, maxBorrow - projectedDebtUsd);
	});
	let projectedLiqPrice = $derived.by(() => {
		if (projectedDebtUsd <= 0 || currentCollateralUsd <= 0) return 0;
		const collateralBtc = btcPrice.price > 0 ? currentCollateralUsd / btcPrice.price : 0;
		const result = calculateBtcLiquidationPrice(
			projectedDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
		return result?.liquidationBtcPrice ?? 0;
	});

	$effect(() => {
		if (minimal && onProjectedValues) {
			onProjectedValues({
				debt: projectedDebtUsd,
				available: projectedAvailable,
				liqPrice: projectedLiqPrice
			});
		}
	});

	onDestroy(() => {
		if (successTimeoutId) clearTimeout(successTimeoutId);
	});

	function setMax() {
		sliderPercent = 100;
		amount = maxRepayUsd.toFixed(2);
	}

	function handleAmountChange(v: string) {
		amount = v;
		confirmError = null;
		const n = parseFloat(v || '0');
		sliderPercent =
			isFinite(n) && n > 0 && maxRepayUsd > 0 ? Math.min(100, (n / maxRepayUsd) * 100) : 0;
	}

	function applyPercent(pct: number) {
		sliderPercent = pct;
		if (pct <= 0 || maxRepayUsd <= 0) {
			amount = '';
			return;
		}
		amount = ((maxRepayUsd * pct) / 100).toFixed(2);
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
		void handleRepay();
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

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	function sanitizeErrorForLog(error: unknown): Record<string, unknown> {
		if (!(error instanceof Error)) {
			return { type: typeof error, message: 'Unknown error' };
		}

		const safeMessage = error.message
			.replace(/0x[0-9a-fA-F]{64,}/g, '[hex-redacted]')
			.replace(/transaction="[^"]*"/g, 'transaction="[redacted]"')
			.replace(/info=\{[^}]*\}/g, 'info=[redacted]');

		const result: Record<string, unknown> = {
			name: error.name,
			message: safeMessage.length > 300 ? safeMessage.slice(0, 300) + '...' : safeMessage
		};

		if ('code' in error && typeof (error as Record<string, unknown>).code === 'string') {
			result.code = (error as Record<string, unknown>).code;
		}

		return result;
	}

	async function handleRepay() {
		if (!canRepay || isProcessing) return;
		isProcessing = true;
		confirmError = null;

		Sentry.addBreadcrumb({
			category: 'defi.repay',
			message: 'sending repay',
			data: { amountUsd: amountNum.toString() }
		});

		const rawAmount = BigInt(Math.round(amountNum * 1_000_000));
		const finalAmount = rawAmount >= maxRepayRaw ? maxRepayRaw : rawAmount;
		const normalizedAddr = ethers.getAddress(address.toLowerCase());

		try {
			const repayIface = new Interface(POOL_ABI);
			const repayData = repayIface.encodeFunctionData('repay', [
				USDT0_ARBITRUM,
				finalAmount,
				2,
				normalizedAddr
			]);

			if (walletId === 'builtin') {
				const { data: txHash, error: txErr } = await tryCatch(
					sendArbitrumTransaction({ to: AAVE_POOL, data: repayData, value: '0' })
				);

				if (txErr || !txHash) {
					const contractErr = extractContractError(txErr);
					console.warn('[RepayAction] Repay tx failed (builtin):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				const arbProvider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
				const { data: receipt, error: receiptErr } = await tryCatch(
					arbProvider.waitForTransaction(txHash, 60_000)
				);
				if (receiptErr || !receipt) {
					console.warn('[RepayAction] Receipt error:', sanitizeErrorForLog(receiptErr));
					throw new Error(receiptErr instanceof Error ? receiptErr.message : 'Transaction failed');
				}

				Sentry.addBreadcrumb({
					category: 'defi.repay',
					message: 'repay confirmed',
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
			} else {
				const evmSigner = getEvmSigner(walletId);
				if (!evmSigner) {
					throw new Error('No signer available');
				}

				const { data: result, error: txErr } = await tryCatch(
					evmSigner.sendTransaction({
						to: AAVE_POOL,
						data: repayData,
						value: 0n,
						chainId: 42161
					})
				);

				if (txErr || !result) {
					const contractErr = extractContractError(txErr);
					console.warn('[RepayAction] Repay tx failed (connected):', sanitizeErrorForLog(txErr));
					throw new Error(contractErr.userMessage);
				}

				Sentry.addBreadcrumb({
					category: 'defi.repay',
					message: 'repay confirmed',
					data: { txHash: result.txHash }
				});
				defiPositions.invalidate(walletId);
				isProcessing = false;
				successTxHash = result.txHash;
				successTimeoutId = setTimeout(() => {
					if (successTxHash) {
						showConfirmModal = false;
						onSuccess();
						successTxHash = null;
					}
				}, 5000);
			}
		} catch (err) {
			const contractErr = extractContractError(err);
			console.warn('[RepayAction] Repay flow error:', sanitizeErrorForLog(err));
			Sentry.addBreadcrumb({
				category: 'defi.repay',
				message: 'repay flow error',
				data: { walletId, errorCode: contractErr.errorCode ?? 'UNKNOWN' }
			});
			confirmError = contractErr.userMessage;
			isProcessing = false;
		}
	}
</script>

<div class="flex flex-col gap-4">
	<p class="text-base-content/70 text-xs">{$t('wallet.defi.position.action_desc_repay')}</p>

	{#if !minimal}
		<div class="bg-base-200 rounded-box space-y-1 p-3 text-sm">
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.position.repay_current_debt')}</span>
				<span class="font-medium tabular-nums">${currentDebtUsd.toFixed(2)}</span>
			</div>
		</div>
	{/if}

	<AmountInputSection
		variant="direct"
		tokenPrefix="$"
		{amount}
		onAmountChange={handleAmountChange}
		onUnitChange={() => {}}
		unit="usd"
		showPercentSlider={true}
		sliderDisabled={maxRepayUsd <= 0}
		percent={sliderPercent}
		onPercentChange={applyPercent}
		onMaxAmount={async () => setMax()}
		maxDisabled={maxRepayUsd <= 0}
		disabled={!isOnline}
		hasInsufficientBalance={exceedsDebt || (amountNum > 0 && amountNum > usdt0BalanceNum)}
	/>

	{#if exceedsDebt}
		<div class="alert alert-soft alert-error py-2 text-xs">
			Amount exceeds your current debt of ${currentDebtUsd.toFixed(2)}.
		</div>
	{/if}

	{#if amountNum > usdt0BalanceNum && amountNum > 0 && !exceedsDebt}
		<div class="alert alert-soft alert-error py-2 text-xs">
			Exceeds your USDT0 balance of ${usdt0BalanceNum.toFixed(2)}.
		</div>
	{/if}

	{#if !minimal}
		<div class="bg-base-200 rounded-box space-y-1.5 p-3 text-sm">
			<p class="text-base-content/60 text-xs font-medium">
				{$t('wallet.defi.position.repay_preview_title')}
			</p>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.position.repay_remaining')}</span>
				<span class="font-medium tabular-nums"
					>${Math.max(0, currentDebtUsd - amountNum).toLocaleString()}</span
				>
			</div>
			<div class="flex items-center justify-between">
				<span class="text-base-content/60">{$t('wallet.defi.wizard.resulting_hf')}</span>
				<span class="font-medium tabular-nums">{projectedHf.toFixed(2)}x</span>
			</div>
			<HealthFactorGauge healthFactor={projectedHf} status={healthStatus} />
		</div>
	{/if}

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canRepay || isProcessing}
		onclick={openConfirm}
		aria-busy={isProcessing}
	>
		{isProcessing ? $t('wallet.defi.shared.pending_tx') : `Repay $${amountNum.toFixed(2)}`}
	</button>
</div>

{#if showConfirmModal}
	<div class="modal modal-open">
		<div class="modal-box max-w-md">
			<h3 class="text-lg font-bold">{$t('wallet.defi.borrow.button_repay')}</h3>

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
						{$t('wallet.defi.position.confirm_repay_desc', {
							values: { amount: `$${amountNum.toFixed(2)}` }
						})}
					</p>

					<LoanHealthBar
						totalCollateralUsd={currentCollateralUsd}
						totalDebtUsd={projectedDebtUsd}
						availableBorrowsUsd={projectedAvailable}
					/>

					<div class="flex items-center justify-between text-xs">
						<span class="text-base-content/60">{$t('wallet.defi.position.projected_ltv')}</span>
						<LoanHealthBadge ltvPct={projectedLtvPct} showLtv />
					</div>

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
					<button class="btn btn-primary" onclick={handleRepay} disabled={isProcessing}>
						{#if isProcessing}
							<span class="loading loading-spinner loading-xs"></span>
						{/if}
						{$t('wallet.defi.borrow.button_repay')}
					</button>
				</div>
			{/if}
		</div>
		<button class="modal-backdrop" onclick={closeModal} aria-label="Close"></button>
	</div>
{/if}
