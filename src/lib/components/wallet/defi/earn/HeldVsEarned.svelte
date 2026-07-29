<script lang="ts">
	import { t } from 'svelte-i18n';

	interface Props {
		positionValueUsd: number;
		holdValueUsd: number;
		daysInPosition: number;
	}

	let { positionValueUsd, holdValueUsd, daysInPosition }: Props = $props();

	let diff = $derived(
		isFinite(positionValueUsd) && isFinite(holdValueUsd) ? positionValueUsd - holdValueUsd : 0
	);

	let pct = $derived(holdValueUsd > 0 && isFinite(diff) ? (diff / holdValueUsd) * 100 : 0);

	let winning = $derived(diff >= 0);

	function formatUsd(val: number): string {
		if (!isFinite(val)) return '$0.00';
		const abs = Math.abs(val);
		const formatted = `$${abs.toFixed(2)}`;
		return val < 0 ? `-${formatted}` : formatted;
	}
</script>

<div class="bg-base-200 rounded-lg p-3">
	<!-- Title -->
	<h3 class="text-base-content/70 mb-2.5 text-xs font-semibold tracking-wide uppercase">
		{$t('wallet.defi.earn.held_vs_earned')}
	</h3>

	<!-- Comparison rows -->
	<div class="space-y-1.5">
		<!-- LP Position value -->
		<div class="flex items-center justify-between text-sm">
			<span class="text-base-content/60">{$t('wallet.defi.earn.lp_position_value')}</span>
			<span class="font-medium tabular-nums">{formatUsd(positionValueUsd)}</span>
		</div>

		<!-- Hold value -->
		<div class="flex items-center justify-between text-sm">
			<span class="text-base-content/60">{$t('wallet.defi.earn.if_you_held')}</span>
			<span class="font-medium tabular-nums">{formatUsd(holdValueUsd)}</span>
		</div>

		<!-- Divider -->
		<div class="border-base-content/10 border-t"></div>

		<!-- Difference -->
		<div class="flex items-center justify-between text-sm font-bold">
			<span class={winning ? 'text-success' : 'text-error'}>
				{winning ? $t('wallet.defi.earn.lp_wins_by') : $t('wallet.defi.earn.lp_trails_by')}
			</span>
			<span class="tabular-nums {winning ? 'text-success' : 'text-error'}">
				{diff >= 0 ? '+' : ''}{formatUsd(diff)}
				<span class="text-xs font-medium">
					({pct >= 0 ? '+' : ''}{pct.toFixed(1)}%)
				</span>
				{#if winning}
					<span aria-hidden="true"> ✓</span><span class="sr-only"> positive</span>
				{:else}
					<span aria-hidden="true"> ✗</span><span class="sr-only"> negative</span>
				{/if}
			</span>
		</div>
	</div>

	<!-- Trailing note -->
	{#if !winning && daysInPosition > 0}
		<p class="text-base-content/50 mt-2 text-[11px]">
			{$t('wallet.defi.earn.lp_trailing_note', {
				values: { days: daysInPosition }
			})}
		</p>
	{/if}
</div>
