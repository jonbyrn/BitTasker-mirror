<script lang="ts">
	/**
	 * BalanceHistory Component
	 *
	 * Displays historical balance changes for 24h, 7d, and 30d periods.
	 * Uses the BalanceHistoryService for data fetching and caching.
	 */
	import { t } from 'svelte-i18n';
	import { walletStore, totalBalances, formatSats } from '$lib/stores/wallet.store';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import BalanceChartModal from './BalanceChartModal.svelte';
	import { triggerHaptic, ImpactStyle } from '$lib/utils/helpers/haptics';

	let { balancesHidden } = $props<{ balancesHidden: boolean }>();

	let showChartModal = $state(false);

	/**
	 * Create a reactive promise that updates when totalBalances changes
	 */
	let balanceChangesPromise = $derived.by(() => {
		// Return promise (not awaited) - {#await} in template handles it
		return balanceHistoryService.getBalanceChanges(
			$totalBalances.sats,
			$totalBalances.usd,
			$walletStore.rsk.provider,
			$walletStore.rsk.address
		);
	});

	/**
	 * Format balance change for display
	 */
	function formatBalanceChange(satsChange: number | null, usdChange: number | null) {
		if (satsChange === null || usdChange === null) {
			return null;
		}

		const sats = satsChange;
		const usd = usdChange;
		
		// Check if sats is neutral (zero or effectively zero)
		const satsIsZero = sats === 0;
		const satsIsNeutral = satsIsZero;
		
		// Check if USD is neutral (zero or below threshold)
		const usdIsZero = usd === 0;
		const usdIsBelowThreshold = Math.abs(usd) < 0.01;
		const usdIsNeutral = usdIsZero || usdIsBelowThreshold;

		const formattedUsd = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(Math.abs(usd));

		const satsDisplay = satsIsNeutral
			? `${formatSats(Math.abs(sats))}`
			: sats > 0
				? `+${formatSats(Math.abs(sats))}`
				: `-${formatSats(Math.abs(sats))}`;

		const usdDisplay = usdIsNeutral ? `$${formattedUsd}` : usd > 0 ? `+$${formattedUsd}` : `-$${formattedUsd}`;

		// Determine color for sats independently
		const satsColorClass = satsIsNeutral 
			? 'text-base-content/70'  // Match label color for neutral
			: sats > 0 
				? 'text-success' 
				: 'text-error';

		// Determine color for USD independently
		const usdColorClass = usdIsNeutral 
			? 'text-base-content/70'  // Match label color for neutral
			: usd > 0 
				? 'text-success/80' 
				: 'text-error/80';

		return {
			satsDisplay,
			usdDisplay,
			satsIsNeutral,
			usdIsNeutral,
			satsColorClass,
			usdColorClass
		};
	}
</script>

<!-- Historical Balance Indicators Card -->
<div 
	class="border-2 border-primary rounded-lg bg-base-100 cursor-pointer hover:bg-base-200 transition-colors"
	onclick={() => {
		triggerHaptic(ImpactStyle.Light);
		showChartModal = true;
	}}
	role="button"
	tabindex="0"
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			triggerHaptic(ImpactStyle.Light);
			showChartModal = true;
		}
	}}
	aria-label={$t('wallet.balance_chart.open_chart')}
>
	<div class="py-3 px-4">
		<div class="grid grid-cols-3 gap-2 text-sm">
			{#await balanceChangesPromise}
				<!-- Loading state - matching loaded state dimensions to prevent layout shift -->
				{#each ['24h', '7d', '30d'] as label}
					<div class="flex flex-col items-center gap-1">
						<div class="text-base-content/70 font-medium">{label}</div>
						<!-- Sats amount placeholder with spinner - matching loaded state dimensions -->
						<div class="font-semibold text-base-content inline-flex items-center gap-1 min-w-[5rem] justify-center">
							<span class="loading loading-spinner loading-xs text-primary"></span>
						</div>
						<!-- USD amount placeholder with spinner - matching loaded state dimensions -->
						<div class="text-base-content/70 inline-flex items-center gap-1 min-w-[4rem] justify-center">
							<span class="loading loading-spinner loading-xs text-primary"></span>
						</div>
					</div>
				{/each}
			{:then balanceChanges}
				<!-- Success state -->
				{#each balanceChanges as change}
					<div class="flex flex-col items-center gap-1">
						<div class="text-base-content/70 font-medium">{change.label}</div>
						{#if balancesHidden}
							<div class="text-base-content/50">••••</div>
							<div class="text-base-content/50">••••</div>
						{:else if change.satsChange === null}
							<!-- Loading indicator - matching loaded state dimensions -->
							<div class="font-semibold text-base-content inline-flex items-center gap-1 min-w-[5rem] justify-center">
								<span class="loading loading-spinner loading-xs text-primary"></span>
							</div>
							<div class="text-base-content/70 inline-flex items-center gap-1 min-w-[4rem] justify-center">
								<span class="loading loading-spinner loading-xs text-primary"></span>
							</div>
						{:else}
							{@const formatted = formatBalanceChange(change.satsChange, change.usdChange)}
							{#if formatted}
								<div class="font-semibold {formatted.satsColorClass}">
									{formatted.satsDisplay}
								</div>
								<div class="{formatted.usdColorClass}">
									{formatted.usdDisplay}
								</div>
							{/if}
						{/if}
					</div>
				{/each}
			{:catch error}
				<!-- Error state -->
				<div class="col-span-3 text-center">
					<span class="text-error text-xs">{$t('wallet.balance_history.error')}</span>
				</div>
			{/await}
		</div>
	</div>
</div>

<!-- Balance Chart Modal -->
<BalanceChartModal isOpen={showChartModal} onClose={() => showChartModal = false} />
