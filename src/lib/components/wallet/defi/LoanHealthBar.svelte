<script lang="ts">
	interface Props {
		totalCollateralUsd: number;
		totalDebtUsd: number;
		availableBorrowsUsd: number;
	}

	let { totalCollateralUsd, totalDebtUsd, availableBorrowsUsd }: Props = $props();

	// Current utilization LTV (debt / collateral), not protocol max LTV
	let currentLtv = $derived(totalCollateralUsd > 0 ? (totalDebtUsd / totalCollateralUsd) * 100 : 0);

	// Max borrow capacity (debt + available) as % of collateral — where the vertical marker goes
	let maxCapacityPct = $derived(
		totalCollateralUsd > 0
			? Math.min(((totalDebtUsd + availableBorrowsUsd) / totalCollateralUsd) * 100, 100)
			: 0
	);

	let debtPct = $derived(
		totalCollateralUsd > 0 ? Math.min((totalDebtUsd / totalCollateralUsd) * 100, 100) : 0
	);

	type RiskLevel = 'safe' | 'warning' | 'critical';
	let riskLevel = $derived<RiskLevel>(
		currentLtv >= 65 ? 'critical' : currentLtv >= 50 ? 'warning' : 'safe'
	);

	const RISK: Record<RiskLevel, { bar: string; label: string }> = {
		safe: { bar: 'bg-success', label: 'Safe' },
		warning: { bar: 'bg-warning', label: 'Caution' },
		critical: { bar: 'bg-error', label: 'At Risk' }
	};

	let risk = $derived(RISK[riskLevel]);
</script>

<div class="flex flex-col gap-1.5">
	<!-- Labels row above bar -->
	<div class="relative h-4 text-xs">
		<span class="text-base-content/50 absolute top-0 left-0">Debt</span>
		<span
			class="text-base-content/50 absolute top-0"
			style="left: {maxCapacityPct}%; transform: translateX(-50%)">Available</span
		>
		<span class="text-base-content/50 absolute top-0 right-0">Collateral</span>
	</div>

	<!-- Bar -->
	<div class="bg-base-200 relative h-3 w-full overflow-hidden rounded-full">
		{#if debtPct > 0}
			<div
				class="{risk.bar} absolute top-0 left-0 h-full rounded-l-full transition-all duration-500 ease-out"
				style="width: {debtPct}%"
			></div>
		{/if}
		{#if maxCapacityPct > debtPct}
			<div
				class="bg-primary/25 absolute top-0 h-full {debtPct <= 0 ? 'rounded-l-full' : ''}"
				style="left: {debtPct}%; width: {maxCapacityPct - debtPct}%"
			></div>
		{/if}
		{#if maxCapacityPct > 0 && maxCapacityPct < 100}
			<div
				class="bg-base-content/40 absolute top-0 h-full w-px"
				style="left: {maxCapacityPct}%"
			></div>
		{/if}
	</div>

	<!-- Amounts row below bar -->
	<div class="relative h-4 text-xs">
		<span class="absolute top-0 left-0 font-medium tabular-nums">${totalDebtUsd.toFixed(2)}</span>
		<span
			class="absolute top-0 font-medium tabular-nums"
			style="left: {maxCapacityPct}%; transform: translateX(-50%)"
			>${availableBorrowsUsd.toFixed(2)}</span
		>
		<span class="absolute top-0 right-0 font-medium tabular-nums"
			>${totalCollateralUsd.toFixed(2)}</span
		>
	</div>
</div>
