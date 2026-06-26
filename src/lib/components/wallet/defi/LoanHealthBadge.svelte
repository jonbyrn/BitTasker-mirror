<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		ltvPct: number;
		/** If true, show the numeric LTV value in the badge */
		showLtv?: boolean;
	}

	let { ltvPct, showLtv = false }: Props = $props();

	type RiskLevel = 'safe' | 'caution' | 'at_risk';

	let riskLevel = $derived<RiskLevel>(ltvPct >= 65 ? 'at_risk' : ltvPct >= 50 ? 'caution' : 'safe');

	let badgeClass = $derived(
		riskLevel === 'at_risk'
			? 'badge-error'
			: riskLevel === 'caution'
				? 'badge-warning'
				: 'badge-success'
	);

	let iconPath = $derived(
		riskLevel === 'at_risk'
			? 'M12 9v2m0 4h.01M10.29 3.86l-8.6 14.86A1 1 0 002.56 20h16.88a1 1 0 00.86-1.28l-8.6-14.86a1 1 0 00-1.72 0z'
			: riskLevel === 'caution'
				? 'M12 8v4m0 4h.01'
				: 'M5 13l4 4L19 7'
	);

	let label = $derived(
		riskLevel === 'at_risk'
			? $t('wallet.defi.risk_at_risk')
			: riskLevel === 'caution'
				? $t('wallet.defi.risk_caution')
				: $t('wallet.defi.risk_safe')
	);
</script>

<span
	class="badge {badgeClass} badge-sm inline-flex items-center gap-1 font-medium"
	role="status"
	aria-label={label}
>
	<svg class="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={iconPath} />
	</svg>
	{label}
	{#if showLtv}
		<span class="opacity-75">{ltvPct.toFixed(1)}%</span>
	{/if}
</span>
