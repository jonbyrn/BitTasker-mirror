<script lang="ts">
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { ethers } from 'ethers';
	import { tryCatch } from '$lib/utils/tryCatch';
	import { walletStore } from '$lib/stores/wallet.store';
	import { formatSats } from '$lib/utils/wallet/format';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import HealthFactorGauge from './HealthFactorGauge.svelte';
	import { AaveService, USDT0_ARBITRUM } from '$lib/services/defi/aave.service';
	import { browserNetworkStatus } from '$lib/utils/network-status';

	// -----------------------------------------------------------------------
	// Props — lightweight for v1; will be extended when DeFiFlowDrawer is built
	// -----------------------------------------------------------------------

	interface Props {
		onGetWbtc?: () => void;
		onApproveBorrow?: (amount: number) => void;
	}

	let { onGetWbtc, onApproveBorrow }: Props = $props();

	// -----------------------------------------------------------------------
	// Reactive state
	// -----------------------------------------------------------------------

	let amount = $state('');

	// Live Aave data (fetched on mount; falls back to conservative defaults on error)
	let ltv = $state(0.7);
	let borrowAPR = $state(3.3);
	let gasEstimate = $state(0.15);

	let isLoadingRates = $state(true);
	let ratesError = $state<string | null>(null);

	let isProcessing = $state(false); // for future tx; drives Drawer isSubmitting
	let isOnline = $derived($browserNetworkStatus.online);

	let feeExpanded = $state(false);

	let sourceExpanded = $state(false);

	const ARB_PUBLIC_RPC = 'https://arb1.arbitrum.io/rpc';

	async function loadLiveAaveData() {
		isLoadingRates = true;
		ratesError = null;

		const provider = new ethers.JsonRpcProvider(ARB_PUBLIC_RPC);
		const aave = new AaveService(provider);

		const { data: apr, error: aprErr } = await tryCatch(aave.getVariableBorrowAPR(USDT0_ARBITRUM));

		if (aprErr || apr === undefined) {
			ratesError = 'wallet.defi.borrow.rates_error';
			// keep conservative defaults
		} else {
			borrowAPR = apr;
		}

		isLoadingRates = false;
	}

	onMount(() => {
		void loadLiveAaveData();
	});

	// -----------------------------------------------------------------------
	// Derived values
	// -----------------------------------------------------------------------

	let wbtcBalance = $derived($walletStore.arb?.formattedWbtcBalance ?? '0');
	let wbtcBalanceNum = $derived(parseFloat(wbtcBalance) || 0);
	let wbtcBalanceSats = $derived(Math.round(wbtcBalanceNum * 100_000_000));
	let wbtcUsdValue = $derived(wbtcBalanceNum * btcPrice.price);

	let amountNum = $derived.by(() => {
		const n = parseFloat(amount);
		return isFinite(n) && n > 0 ? n : 0;
	});

	let collateralNeeded = $derived.by(() => {
		if (!isFinite(amountNum) || amountNum <= 0 || !isFinite(ltv) || ltv <= 0) return 0;
		return amountNum / ltv;
	});

	let collateralWbtc = $derived.by(() => {
		if (btcPrice.price <= 0 || collateralNeeded <= 0) return 0;
		const v = collateralNeeded / btcPrice.price;
		return isFinite(v) ? v : 0;
	});

	let annualCost = $derived.by(() => {
		if (!isFinite(amountNum) || !isFinite(borrowAPR)) return 0;
		return amountNum * (borrowAPR / 100);
	});

	let healthFactor = $derived.by(() => {
		if (amountNum <= 0 || collateralNeeded <= 0 || wbtcUsdValue <= 0) return 5;
		const hf = wbtcUsdValue / collateralNeeded;
		return isFinite(hf) ? hf : 5;
	});

	let hasWbtc = $derived(wbtcBalanceNum > 0);
	let canBorrow = $derived.by(() => {
		return amountNum > 0 && hasWbtc && isOnline && !ratesError;
	});

	let healthStatus = $derived(
		healthFactor > 2
			? ('safe' as const)
			: healthFactor > 1.5
				? ('monitor' as const)
				: ('risk' as const)
	);

	let gasTooHigh = $derived(gasEstimate > 5);

	// -----------------------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------------------

	function setMaxAmount() {
		const maxUsdt = wbtcUsdValue * ltv;
		amount = maxUsdt.toFixed(2);
	}

	function handleApproveBorrow() {
		if (!canBorrow) return;
		onApproveBorrow?.(amountNum);
	}
</script>

<!-- ===================================================================== -->
<!-- Pre-check card — shown when user has no WBTC                           -->
<!-- ===================================================================== -->

{#if !hasWbtc}
	<div class="alert alert-outline alert-warning rounded-box mb-4" role="alert">
		<div class="flex items-center justify-between gap-2">
			<p class="text-sm">{$t('wallet.defi.needs_wbtc')}</p>
			<button type="button" class="btn btn-outline btn-sm shrink-0" onclick={() => onGetWbtc?.()}>
				{$t('wallet.defi.get_wbtc')}
			</button>
		</div>
	</div>
{/if}

<!-- ===================================================================== -->
<!-- Main form                                                              -->
<!-- ===================================================================== -->

<div class="space-y-4">
	<!-- Source Wallet -->
	<WalletSelector
		label={$t('wallet.from') + ':'}
		selectedId="builtin"
		onSelect={() => {}}
		builtinBalance={`${formatSats(wbtcBalanceSats)} Sats`}
		connectedWallets={$connectedWalletsStore.wallets}
		walletBalanceFor={(id: string) => {
			const w = $connectedWalletsStore.wallets.find((c) => c.id === id);
			if (!w) return '$0';
			const wbtc = w.balances['wbtc-arb'];
			if (!wbtc) return '0 Sats';
			const raw = Number(wbtc.raw ?? '0');
			const sats = Math.round(raw / 10_000_000_000);
			return sats > 0 ? `${formatSats(sats)} Sats` : '0 Sats';
		}}
		expanded={sourceExpanded}
		onToggle={() => (sourceExpanded = !sourceExpanded)}
	/>

	<!-- Amount Input -->
	<div>
		<label class="label" for="borrow-amount">
			<span class="label-text text-sm font-medium">
				{$t('wallet.defi.borrow.amount_label')}
			</span>
		</label>
		<div class="join w-full">
			<span
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg sm:min-h-[52px]"
			>
				$
			</span>
			<input
				id="borrow-amount"
				type="text"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg sm:min-h-[52px] sm:text-base"
				placeholder="0.00"
				bind:value={amount}
				inputmode="decimal"
				oninput={(e) => {
					const target = e.currentTarget as HTMLInputElement;
					// Normalize comma to dot for locale robustness (iOS/Safari number quirks)
					if (target.value.includes(',')) {
						target.value = target.value.replace(/,/g, '.');
					}
				}}
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] touch-manipulation rounded-r-lg active:scale-95 sm:min-h-[52px]"
				onclick={setMaxAmount}
				disabled={!hasWbtc || !isOnline}
			>
				<span class="text-xs sm:text-sm">{$t('wallet.max')}</span>
			</button>
		</div>
	</div>

	<!-- Collateral + LTV -->
	<div class="bg-base-200 rounded-box space-y-1.5 p-3 text-sm">
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.borrow.collateral_label')}</span>
			<span class="font-medium tabular-nums">
				{formatSats(Math.round(collateralWbtc * 100_000_000))} Sats
				<span class="text-base-content/50">
					(${collateralNeeded.toFixed(2)})
				</span>
			</span>
		</div>
		<div class="flex items-center justify-between">
			<span class="text-base-content/60">{$t('wallet.defi.borrow.ltv_label')}</span>
			<span class="font-medium tabular-nums">{(ltv * 100).toFixed(0)}%</span>
		</div>
	</div>

	<!-- Gas Too High Warning -->
	{#if gasTooHigh}
		<div class="alert alert-soft alert-warning" role="alert">
			<p class="text-xs">
				{$t('wallet.defi.shared.gas_too_high', {
					values: { amount: `$${gasEstimate.toFixed(2)}` }
				})}
			</p>
		</div>
	{/if}

	<!-- Health Factor Gauge (reused, fully i18n'd + accessible) -->
	<HealthFactorGauge {healthFactor} status={healthStatus} />

	<!-- Fee Breakdown (collapsed by default) -->
	<div
		class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
		class:collapse-open={feeExpanded}
	>
		<button
			type="button"
			class="collapse-title flex min-h-[44px] items-center gap-2 px-3 py-2.5 pr-10 pl-3 text-sm font-medium"
			onclick={() => (feeExpanded = !feeExpanded)}
		>
			{$t('wallet.defi.fee_breakdown')}
		</button>
		<div class="collapse-content space-y-1.5 px-2 text-sm">
			{#if isLoadingRates}
				<div class="skeleton h-4 w-3/4"></div>
				<div class="skeleton h-4 w-2/3"></div>
			{:else}
				{#if ratesError}
					<div class="alert alert-soft alert-warning py-1 text-xs">
						{$t(ratesError)}
					</div>
				{/if}
				<div class="flex justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.borrow.gas_fee')}</span>
					<span class="tabular-nums">${gasEstimate.toFixed(2)}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-base-content/60">{$t('wallet.defi.borrow.interest_rate')}</span>
					<span class="tabular-nums">{borrowAPR.toFixed(2)}% APR</span>
				</div>
				<div class="flex justify-between font-medium">
					<span>{$t('wallet.defi.borrow.annual_cost')}</span>
					<span class="tabular-nums">${annualCost.toFixed(2)}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- CTA Button -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canBorrow || isProcessing}
		onclick={handleApproveBorrow}
		aria-busy={isProcessing}
	>
		{isProcessing
			? $t('wallet.defi.shared.pending_tx')
			: $t('wallet.defi.borrow.button_approve_borrow')}
	</button>
</div>
