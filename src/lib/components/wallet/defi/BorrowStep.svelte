<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import WalletSelector from '$lib/components/wallet/WalletSelector.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';

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

	/** Simulated Aave data — replace with real aave.service.ts calls later. */
	let ltv = $state(0.7); // 70 %
	let borrowAPR = $state(3.3); // 3.30 %
	let gasEstimate = $state(0.15); // $0.15

	let feeExpanded = $state(false);

	let sourceExpanded = $state(false);

	// -----------------------------------------------------------------------
	// Derived values
	// -----------------------------------------------------------------------

	let wbtcBalance = $derived($walletStore.arb?.formattedWbtcBalance ?? '0');
	let wbtcBalanceNum = $derived(parseFloat(wbtcBalance) || 0);
	let wbtcUsdValue = $derived(wbtcBalanceNum * btcPrice.price);

	let amountNum = $derived(parseFloat(amount) || 0);
	let collateralNeeded = $derived(amountNum / ltv);
	let collateralWbtc = $derived(btcPrice.price > 0 ? collateralNeeded / btcPrice.price : 0);
	let annualCost = $derived(amountNum * (borrowAPR / 100));

	let healthFactor = $derived(
		amountNum > 0 && collateralNeeded > 0 ? wbtcUsdValue / collateralNeeded : 5
	);

	let hasWbtc = $derived(wbtcBalanceNum > 0);
	let canBorrow = $derived(amountNum > 0 && hasWbtc);

	let healthStatus = $derived(
		healthFactor > 2
			? ('safe' as const)
			: healthFactor > 1.5
				? ('monitor' as const)
				: ('risk' as const)
	);

	let healthProgressColor = $derived(
		healthStatus === 'safe'
			? 'progress-success'
			: healthStatus === 'monitor'
				? 'progress-warning'
				: 'progress-error'
	);

	let healthBadgeColor = $derived(
		healthStatus === 'safe'
			? 'badge-success'
			: healthStatus === 'monitor'
				? 'badge-warning'
				: 'badge-error'
	);

	let healthTextKey = $derived(
		healthStatus === 'safe'
			? 'wallet.defi.borrow.health_safe'
			: healthStatus === 'monitor'
				? 'wallet.defi.borrow.health_monitor'
				: 'wallet.defi.borrow.health_risk'
	);

	let gasTooHigh = $derived(gasEstimate > 5);

	// -----------------------------------------------------------------------
	// Handlers
	// -----------------------------------------------------------------------

	function setMaxAmount() {
		const maxUsdt = wbtcUsdValue * ltv;
		amount = maxUsdt.toFixed(2);
	}

	function handleGetWbtc() {
		onGetWbtc?.();
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
	<div class="alert alert-soft alert-warning mb-4" role="alert">
		<div class="flex flex-col gap-2">
			<p class="text-sm">{$t('wallet.defi.needs_wbtc')}</p>
			<button type="button" class="btn btn-outline btn-sm self-start" onclick={handleGetWbtc}>
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
		label={$t('wallet.swap.source_wallet')}
		selectedId="builtin"
		onSelect={() => {}}
		builtinBalance={`${wbtcBalanceNum.toFixed(6)} WBTC`}
		connectedWallets={$connectedWalletsStore.wallets}
		walletBalanceFor={(id: string) => {
			const w = $connectedWalletsStore.wallets.find((c) => c.id === id);
			if (!w) return '$0';
			const wbtc = w.balances['wbtc-arb'];
			return wbtc ? `${wbtc.formatted} WBTC` : '$0';
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
				class="btn join-item no-animation bg-base-200 text-base-content/70 pointer-events-none min-h-[48px] border-r-0 text-lg"
			>
				$
			</span>
			<input
				id="borrow-amount"
				type="number"
				class="input input-bordered join-item min-h-[48px] flex-1 text-lg"
				placeholder="0.00"
				bind:value={amount}
				min="0"
				step="0.01"
				inputmode="decimal"
			/>
			<button
				type="button"
				class="btn btn-primary join-item min-h-[48px] rounded-l-none active:scale-95"
				onclick={setMaxAmount}
				disabled={!hasWbtc}
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
				{collateralWbtc.toFixed(6)} WBTC
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

	<!-- Health Factor Gauge (Accessible — WCAG 1.4.1 compliant) -->
	<div
		role="meter"
		aria-valuenow={healthFactor}
		aria-valuemin="0"
		aria-valuemax="5"
		aria-label="Health factor: {healthFactor.toFixed(1)} out of 5. {$t(healthTextKey)}"
	>
		<div class="flex items-center gap-2">
			<progress class="progress flex-1 {healthProgressColor}" value={healthFactor} max="5"
			></progress>
			<span class="badge {healthBadgeColor} shrink-0 tabular-nums">
				{$t(healthTextKey)}
				{healthFactor.toFixed(1)}x
			</span>
			<span class="text-base-content/60 shrink-0 text-xs">{$t(healthTextKey)}</span>
		</div>
	</div>

	<!-- Fee Breakdown (collapsed by default) -->
	<div class="collapse-arrow bg-base-200 rounded-box collapse" class:collapse-open={feeExpanded}>
		<button
			type="button"
			class="collapse-title text-sm font-medium"
			onclick={() => (feeExpanded = !feeExpanded)}
		>
			{$t('wallet.defi.fee_breakdown')}
		</button>
		<div class="collapse-content space-y-1.5 text-sm">
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
		</div>
	</div>

	<!-- CTA Button -->
	<button
		type="button"
		class="btn btn-primary min-h-[48px] w-full text-base"
		disabled={!canBorrow}
		onclick={handleApproveBorrow}
	>
		{$t('wallet.defi.borrow.button_approve_borrow')}
	</button>
</div>
