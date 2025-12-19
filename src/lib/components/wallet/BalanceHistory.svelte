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

	let { balancesHidden } = $props<{ balancesHidden: boolean }>();

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
		const isZero = sats === 0 && usd === 0;
		const isBelowThreshold = Math.abs(usd) < 0.01;
		const isNeutral = isZero || isBelowThreshold;
		const isPositive = sats > 0 && !isNeutral;

		const formattedUsd = new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(Math.abs(usd));

		const satsDisplay = isNeutral
			? `${formatSats(Math.abs(sats))}`
			: sats > 0
				? `+${formatSats(Math.abs(sats))}`
				: `-${formatSats(Math.abs(sats))}`;

		const usdDisplay = isNeutral ? `$${formattedUsd}` : usd > 0 ? `+$${formattedUsd}` : `-$${formattedUsd}`;

		return {
			satsDisplay,
			usdDisplay,
			isNeutral,
			isPositive,
			colorClass: isNeutral ? 'text-base-content' : isPositive ? 'text-success' : 'text-error',
			usdColorClass: isNeutral ? 'text-base-content/70' : isPositive ? 'text-success/80' : 'text-error/80'
		};
	}
</script>

<!-- Historical Balance Indicators Card -->
<div class="border-2 border-primary rounded-lg bg-base-100">
	<div class="py-3 px-4">
		<div class="grid grid-cols-3 gap-2 text-sm">
			{#await balanceChangesPromise}
				<!-- Loading state -->
				{#each [1, 2, 3] as _}
					<div class="flex flex-col items-center gap-1">
						<div class="text-base-content/70 font-medium">...</div>
						<div class="flex flex-col items-center gap-1">
							<span class="loading loading-spinner loading-xs text-primary"></span>
							<span class="text-base-content/50 text-xs">{$t('common.loading')}</span>
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
							<!-- Loading indicator -->
							<div class="flex flex-col items-center gap-1">
								<span class="loading loading-spinner loading-xs text-primary"></span>
								<span class="text-base-content/50 text-xs">{$t('common.loading')}</span>
							</div>
						{:else}
							{@const formatted = formatBalanceChange(change.satsChange, change.usdChange)}
							{#if formatted}
								<div class="font-semibold {formatted.colorClass}">
									{formatted.satsDisplay}
									{$t('wallet.sats')}
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
