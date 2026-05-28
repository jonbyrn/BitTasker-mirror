<script lang="ts">
	/**
	 * BalanceHistory Accordion
	 *
	 * Closed: "Activity · Last 24h" with 24h change inline
	 * Expanded: 7d + 30d rows, plus "View Historical Chart" button
	 */
	import { t } from 'svelte-i18n';
	import { walletStore, totalBalances, formatSats } from '$lib/stores/wallet.store';
	import balanceHistoryService from '$lib/api/services/balanceHistory.service';
	import BalanceChartModal from './BalanceChartModal.svelte';
	import IconChevronRight from '~icons/mdi/chevron-right';

	let { balancesHidden } = $props<{ balancesHidden: boolean }>();

	let showChartModal = $state(false);
	let expanded = $state(false);

	let balanceChangesPromise = $derived.by(() => {
		return balanceHistoryService.getBalanceChanges(
			$totalBalances.sats,
			$totalBalances.usd,
			$walletStore.rsk.provider,
			$walletStore.rsk.address
		);
	});

	function formatChange(satsChange: number | null, usdChange: number | null) {
		if (satsChange === null || usdChange === null) return null;
		const sats = satsChange;
		const usd = usdChange;
		const satsNeutral = sats === 0;
		const usdNeutral = usd === 0 || Math.abs(usd) < 0.01;

		function formatUsdChange(value: number, neutral: boolean): string {
			const absUsd = new Intl.NumberFormat('en-US', {
				minimumFractionDigits: 2,
				maximumFractionDigits: 2
			}).format(Math.abs(value));
			if (neutral) return `≈ ($0.00)`;
			return value > 0 ? `≈ (+$${absUsd})` : `≈ (-$${absUsd})`;
		}

		return {
			sats: satsNeutral
				? `${formatSats(Math.abs(sats))}`
				: sats > 0
					? `+${formatSats(Math.abs(sats))}`
					: `-${formatSats(Math.abs(sats))}`,
			usd: formatUsdChange(usd, usdNeutral),
			satsColor: satsNeutral ? 'text-base-content/70' : sats > 0 ? 'text-success' : 'text-error',
			usdColor: usdNeutral ? 'text-base-content/70' : usd > 0 ? 'text-success/80' : 'text-error/80'
		};
	}
</script>

<div
	class="collapse-arrow border-primary bg-base-100 collapse rounded-lg border-2"
	class:collapse-open={expanded}
	aria-label={$t('wallet.balance_chart.open_chart')}
>
	<input type="checkbox" bind:checked={expanded} />

	<!-- Title row (always visible) — 24h inline -->
	<div
		class="collapse-title flex min-h-0 items-center justify-between px-3 py-2 pr-10 text-left text-sm font-medium sm:px-4 sm:py-3 sm:pr-12 sm:text-base"
	>
		<span class="text-sm font-medium sm:text-base">
			{$t('wallet.balance_history.label')} ·
			<span class="text-base-content/70">{$t('wallet.balance_history.24h')}</span>
		</span>

		<div class="ml-auto flex items-center gap-3 text-sm sm:text-base">
			{#await balanceChangesPromise}
				<span class="loading loading-spinner loading-xs text-primary"></span>
			{:then changes}
				{#if changes.length > 0}
					{@const f24 = formatChange(changes[0]?.satsChange ?? null, changes[0]?.usdChange ?? null)}
					{#if f24}
						{#if balancesHidden}
							<span class="text-base-content/50">••••</span>
							<span class="text-base-content/50">••••</span>
						{:else}
							<span class="font-semibold {f24.satsColor}">{f24.sats}</span>
							<span class={f24.usdColor}>{f24.usd}</span>
						{/if}
					{/if}
				{/if}
			{:catch}
				<span class="text-base-content/50 text-xs">—</span>
			{/await}
		</div>
	</div>

	<!-- Expanded body — 7d + 30d rows + chart button -->
	<div class="collapse-content px-3 sm:px-4">
		{#await balanceChangesPromise}
			<div class="flex justify-center py-2">
				<span class="loading loading-spinner loading-sm text-primary"></span>
			</div>
		{:then changes}
			<div class="space-y-2 pt-1">
				<!-- 7d row -->
				{#if changes.length > 1}
					{@const f7 = formatChange(changes[1]?.satsChange ?? null, changes[1]?.usdChange ?? null)}
					<div class="flex items-center justify-between gap-3 px-2 py-1.5">
						<span class="text-base-content/70 text-sm">{$t('wallet.balance_history.7d')}</span>
						<div class="flex items-center gap-3">
							{#if f7}
								{#if balancesHidden}
									<span class="text-base-content/50">••••</span>
									<span class="text-base-content/50">••••</span>
								{:else}
									<span class="font-semibold {f7.satsColor}">{f7.sats}</span>
									<span class={f7.usdColor}>{f7.usd}</span>
								{/if}
							{:else}
								<span class="loading loading-spinner loading-xs text-primary"></span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- 30d row -->
				{#if changes.length > 2}
					{@const f30 = formatChange(changes[2]?.satsChange ?? null, changes[2]?.usdChange ?? null)}
					<div class="flex items-center justify-between gap-3 px-2 py-1.5">
						<span class="text-base-content/70 text-sm">{$t('wallet.balance_history.30d')}</span>
						<div class="flex items-center gap-3">
							{#if f30}
								{#if balancesHidden}
									<span class="text-base-content/50">••••</span>
									<span class="text-base-content/50">••••</span>
								{:else}
									<span class="font-semibold {f30.satsColor}">{f30.sats}</span>
									<span class={f30.usdColor}>{f30.usd}</span>
								{/if}
							{:else}
								<span class="loading loading-spinner loading-xs text-primary"></span>
							{/if}
						</div>
					</div>
				{/if}

				<!-- Divider + Chart button -->
				<div class="border-base-300 border-t pt-2">
					<button
						class="hover:bg-primary/10 text-base-content/80 inline-flex min-h-[44px] w-full cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm font-medium transition-colors"
						onclick={(e) => {
							e.stopPropagation();
							showChartModal = true;
						}}
					>
						<span>{$t('wallet.balance_history.view_chart')}</span>
						<IconChevronRight class="text-base-content/30 h-5 w-5 shrink-0 sm:h-6 sm:w-6" />
					</button>
				</div>
			</div>
		{:catch}
			<div class="py-2 text-center">
				<span class="text-error text-xs">{$t('wallet.balance_history.error')}</span>
			</div>
		{/await}
	</div>
</div>

<BalanceChartModal isOpen={showChartModal} onClose={() => (showChartModal = false)} />
