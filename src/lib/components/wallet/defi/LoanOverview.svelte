<script lang="ts">
	import { t } from 'svelte-i18n';
	import { walletStore } from '$lib/stores/wallet.store';
	import { connectedWalletsStore } from '$lib/stores/connected-wallets.store';
	import { defiPositions } from '$lib/stores/defi-positions.store.svelte';
	import { btcPrice } from '$lib/runes/btcPrice.svelte';
	import IconHelpCircle from '~icons/mdi/help-circle';
	import LoanHelpModal from './LoanHelpModal.svelte';

	let helpOpen = $state(false);

	let allPositions = $derived(Array.from(defiPositions.aavePositions.values()));

	let lockedCollateralUsd = $derived(
		allPositions.reduce((sum, p) => sum + p.totalCollateralUsd, 0)
	);
	let totalDebtUsd = $derived(allPositions.reduce((sum, p) => sum + p.totalDebtUsd, 0));
	let totalLtvPct = $derived(
		lockedCollateralUsd > 0 ? (totalDebtUsd / lockedCollateralUsd) * 100 : 0
	);

	// Non-supplied BTC
	let rbtcBalance = $derived($walletStore.totalBalances?.rbtc ?? 0);
	let rbtcUsd = $derived(rbtcBalance * btcPrice.price);
	let builtinWbtcUsd = $derived($walletStore.arb?.wbtcUsdValue ?? 0);
	let connectedWbtcUsd = $derived.by(() => {
		let total = 0;
		for (const w of $connectedWalletsStore.wallets) {
			if (!w.balances) continue;
			const wbtc = w.balances['wbtc-arb'];
			if (wbtc?.formatted) total += (parseFloat(wbtc.formatted) || 0) * btcPrice.price;
		}
		return total;
	});

	let totalCollateralUsd = $derived(
		lockedCollateralUsd + rbtcUsd + builtinWbtcUsd + connectedWbtcUsd
	);

	// Loan power = max borrow capacity across ALL collateral (locked + loose rBTC + loose wBTC)
	// Aave V3 max LTV for WBTC is 73%
	let availableLoanPowerUsd = $derived(Math.max(0, totalCollateralUsd * 0.73 - totalDebtUsd));
	// Bar: full width = total collateral. Debt segment fills from left.
	// Capacity marker at 73% of total collateral (Aave max LTV)
	let debtPct = $derived(
		totalCollateralUsd > 0 ? Math.min((totalDebtUsd / totalCollateralUsd) * 100, 100) : 0
	);
	let capacityPct = $derived(totalCollateralUsd > 0 ? Math.min(73, 100) : 0);

	type RiskLevel = 'safe' | 'warning' | 'critical';
	let riskLevel = $derived<RiskLevel>(
		totalLtvPct >= 65 ? 'critical' : totalLtvPct >= 50 ? 'warning' : 'safe'
	);
	const RISK: Record<RiskLevel, { bar: string; badge: string; labelKey: string }> = {
		safe: { bar: 'bg-success', badge: 'badge-success', labelKey: 'wallet.defi.risk_safe' },
		warning: { bar: 'bg-warning', badge: 'badge-warning', labelKey: 'wallet.defi.risk_caution' },
		critical: { bar: 'bg-error', badge: 'badge-error', labelKey: 'wallet.defi.risk_at_risk' }
	};
	let risk = $derived(RISK[riskLevel]);
	let hasAnyCollateral = $derived(allPositions.length > 0 || totalCollateralUsd > 0);
</script>

{#if hasAnyCollateral}
	<div class="border-primary bg-base-100 rounded-lg border p-4">
		<!-- Header: title + help button + risk badge -->
		<div class="mb-2 flex items-center justify-between">
			<div class="flex items-center gap-1.5">
				<span class="text-sm font-semibold">{$t('wallet.defi.position.overview_title')}</span>
				<button
					type="button"
					class="text-base-content/40 hover:text-base-content/70 transition-colors"
					onclick={() => (helpOpen = true)}
					aria-label={$t('common.accessibility.help')}
				>
					<IconHelpCircle class="h-5 w-5" />
				</button>
			</div>
			<span class="badge {risk.badge} badge-sm px-2 py-1 text-xs font-medium">
				{$t(risk.labelKey)}
			</span>
		</div>

		<!-- Hero row: total collateral (left) + loan power (right) -->
		<div class="mb-2.5 flex items-end justify-between">
			<div>
				<div class="text-base-content/50 text-[10px] tracking-wider uppercase">
					{$t('wallet.defi.position.overview_total_collateral')}
				</div>
				<div class="text-2xl font-bold tabular-nums">${totalCollateralUsd.toFixed(2)}</div>
			</div>
			<div class="text-right">
				<div class="text-base-content/50 text-[10px] tracking-wider uppercase">
					{$t('wallet.defi.position.overview_loan_power')}
				</div>
				<div class="text-primary text-2xl font-bold tabular-nums">
					${availableLoanPowerUsd.toFixed(2)}
				</div>
			</div>
		</div>

		<!-- Health bar -->
		<div class="mb-2.5">
			<div class="bg-base-200 relative h-2 w-full overflow-hidden rounded-full">
				{#if debtPct > 0}
					<div
						class="{risk.bar} absolute top-0 left-0 h-full rounded-l-full transition-all duration-500 ease-out"
						style="width: {debtPct}%"
					></div>
				{/if}
				{#if capacityPct > debtPct}
					<div
						class="bg-primary/20 absolute top-0 h-full {debtPct <= 0 ? 'rounded-l-full' : ''}"
						style="left: {debtPct}%; width: {capacityPct - debtPct}%"
					></div>
				{/if}
				{#if capacityPct > 0 && capacityPct < 100}
					<div
						class="bg-base-content/30 absolute top-0 h-full w-px"
						style="left: {capacityPct}%"
					></div>
				{/if}
			</div>
		</div>

		<!-- Metric chips: Debt | Locked | LTV -->
		<div class="grid grid-cols-3 gap-2">
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.position.overview_debt')}</span
				>
				<span class="text-sm font-bold tabular-nums">${totalDebtUsd.toFixed(2)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.position.overview_locked')}</span
				>
				<span class="text-sm font-bold tabular-nums">${lockedCollateralUsd.toFixed(2)}</span>
			</div>
			<div class="bg-base-200 flex flex-col items-center rounded-lg px-2 py-1.5">
				<span class="text-base-content/50 text-[10px] tracking-wide uppercase"
					>{$t('wallet.defi.lending.ltv')}</span
				>
				<span class="text-sm font-bold tabular-nums">{totalLtvPct.toFixed(1)}%</span>
			</div>
		</div>
	</div>
{/if}

<LoanHelpModal isOpen={helpOpen} onClose={() => (helpOpen = false)} />
