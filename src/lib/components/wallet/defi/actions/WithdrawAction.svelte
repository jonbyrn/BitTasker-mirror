<script lang="ts">
	import { t } from 'svelte-i18n';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { formatSats } from '$lib/stores/wallet.store';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import { AaveService, WBTC_ARBITRUM } from '$lib/services/defi/aave.service';
	import {
		calculateProjectedHealthFactor,
		calculateBtcLiquidationPrice
	} from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';
	import { extractContractError } from '$lib/utils/wallet/contractErrorHandler';
	import * as Sentry from '@sentry/sveltekit';
	import AmountInputSection from '$lib/components/wallet/AmountInputSection.svelte';

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

	let {
		walletId,
		address: _address,
		onSuccess,
		minimal = false,
		onProjectedValues
	}: Props = $props();

	let amountSats = $state('');
	let sliderPercent = $state(0);
	let isProcessing = $state(false);
	let isOnline = $derived($browserNetworkStatus.online);

	let position = $derived(
		walletId === 'builtin' ? defiPositions.aavePositions.get('builtin') : null
	);
	let currentCollateralUsd = $derived(position?.totalCollateralUsd ?? 0);
	let currentDebtUsd = $derived(position?.totalDebtUsd ?? 0);
	let _currentHf = $derived(position?.healthFactor ?? 999);
	let liqThreshold = $derived(position?.liquidationThreshold ?? 7800);

	let ethBalance = $derived(parseFloat($walletStore.arb?.formattedEthBalance ?? '0') || 0);
	let paymasterConnected = $derived($walletStore.arb?.paymasterConnected ?? false);
	let connectedEthBalance = $derived.by(() => {
		if (walletId === 'builtin') return ethBalance;
		const w = $connectedWalletsStore.wallets.find((w) => w.id === walletId);
		if (!w?.balances) return 0;
		return Number(w.balances['eth-arb']?.raw ?? 0) / 1e18;
	});
	let _hasEnoughEthForGas = $derived(paymasterConnected || connectedEthBalance >= 0.001);

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
	let _projectedHf = $derived(
		calculateProjectedHealthFactor(
			currentCollateralUsd,
			currentDebtUsd,
			liqThreshold,
			-amountUsd,
			0
		)
	);

	let projectedLtv = $derived(
		projectedCollateral > 0 ? (currentDebtUsd / projectedCollateral) * 100 : 0
	);

	let _liqPriceResult = $derived.by(() => {
		if (projectedCollateral <= 0 || currentDebtUsd <= 0) return null;
		const collateralBtc = btcPrice.price > 0 ? projectedCollateral / btcPrice.price : 0;
		return calculateBtcLiquidationPrice(
			currentDebtUsd,
			collateralBtc,
			liqThreshold,
			btcPrice.price
		);
	});

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

	function setMaxSafe() {
		if (maxSafeDisplay > 0) {
			amountSats = maxSafeDisplay.toString();
			sliderPercent =
				maxContractSats > 0 ? Math.min(100, (maxSafeDisplay / maxContractSats) * 100) : 0;
		}
	}

	function handleAmountChange(v: string) {
		amountSats = v.replace(/[^0-9]/g, '');
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

	async function handleWithdraw() {
		if (!canWithdraw || isProcessing) return;
		isProcessing = true;

		Sentry.addBreadcrumb({
			category: 'defi.withdraw',
			message: 'sending withdraw',
			data: { amountBtc: amountNum.toString() }
		});

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);
		const rawAmount = BigInt(amountNum);
		const maxRaw = BigInt(maxContractSats);
		const finalAmount = rawAmount > maxRaw ? maxRaw : rawAmount;
		const signer = new ethers.Wallet('0x' + '00'.repeat(32), provider);

		const { data: tx, error } = await tryCatch(aave.withdraw(WBTC_ARBITRUM, finalAmount, signer));
		if (error || !tx) {
			const contractErr = extractContractError(error);
			console.warn('[WithdrawAction] Withdraw failed:', sanitizeErrorForLog(error));
			Sentry.addBreadcrumb({
				category: 'defi.withdraw',
				message: 'withdraw failed',
				data: { errorCode: contractErr.errorCode ?? 'UNKNOWN' }
			});
			isProcessing = false;
			return;
		}

		const { data: receipt, error: receiptErr } = await tryCatch(tx.wait());
		isProcessing = false;
		if (receipt) {
			Sentry.addBreadcrumb({
				category: 'defi.withdraw',
				message: 'withdraw confirmed',
				data: {}
			});
			defiPositions.invalidate(walletId);
			onSuccess();
		} else if (receiptErr) {
			console.warn('[WithdrawAction] Receipt error:', sanitizeErrorForLog(receiptErr));
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
				<span class="text-base-content/60">Max Safe Withdraw</span>
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
			Exceeds your total collateral of ${currentCollateralUsd.toFixed(2)}.
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

	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full"
		disabled={!canWithdraw || isProcessing}
		onclick={handleWithdraw}
		aria-busy={isProcessing}
	>
		{isProcessing ? $t('wallet.defi.shared.pending_tx') : `Withdraw ${formatSats(amountNum)} Sats`}
	</button>
</div>
