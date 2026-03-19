<script lang="ts">
import { t } from 'svelte-i18n';
import { btcUsd, marketPriceMeta } from '$lib/stores/market-price.store';

interface Props {
	amount: string; // Store as string to preserve input
	unit: 'sats' | 'usd';
	onUnitToggle: () => void;
	btcPrice?: number; // Optional BTC price, will fetch if not provided
}

let {
	amount,
	unit,
	onUnitToggle,
	btcPrice = undefined
}: Props = $props();

const effectiveBtcPrice = $derived.by(() => btcPrice ?? $btcUsd);
const isUsingSharedPriceStore = $derived.by(() => btcPrice === undefined);
const isPriceLoading = $derived.by(() => {
	if (!isUsingSharedPriceStore) return false;
	if ($btcUsd > 0) return false;

	return $marketPriceMeta.isRefreshing || (!$marketPriceMeta.error && $marketPriceMeta.lastFetched === 0);
});
const isPriceUnavailable = $derived.by(() => {
	if (isPriceLoading) return false;
	return effectiveBtcPrice <= 0;
});

// Derived values
const amountInSats = $derived.by(() => {
	if (unit === 'sats') {
		const parsed = parseFloat(amount);
		return isNaN(parsed) ? 0 : Math.floor(parsed);
		} else {
			const usdAmount = parseFloat(amount);
			if (isNaN(usdAmount) || effectiveBtcPrice === 0) return 0;
			return Math.floor((usdAmount / effectiveBtcPrice) * 100_000_000);
		}
});

const amountInUSD = $derived.by(() => {
	if (unit === 'usd') {
		const parsed = parseFloat(amount);
		return isNaN(parsed) ? 0 : parsed;
		} else {
			const sats = parseFloat(amount);
			if (isNaN(sats) || effectiveBtcPrice === 0) return 0;
			return (sats / 100_000_000) * effectiveBtcPrice;
		}
});

	// Format sats with thousand separators
	function formatSats(sats: number): string {
		if (isNaN(sats) || !isFinite(sats)) return '0';
		return new Intl.NumberFormat('en-US').format(sats);
	}

	// Format USD with currency symbol
	function formatUSD(usd: number): string {
		if (isNaN(usd) || !isFinite(usd)) return '$0.00';
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(usd);
	}

	// Fetch BTC price if not provided
</script>

<div class="amount-display flex flex-col items-center gap-2 md:gap-3">
	<!-- Primary Amount Display -->
	<div class="flex items-baseline gap-2 md:gap-3">
		{#if unit === 'sats'}
			<span
				class="text-base-content text-4xl font-bold tabular-nums md:text-5xl lg:text-6xl"
				data-testid="primary-amount-sats"
			>
				{formatSats(amountInSats)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost h-auto min-h-0 px-2 text-lg font-semibold md:px-3 md:text-xl"
				onclick={onUnitToggle}
				aria-label={$t('wallet.receive.unit_sats')}
			>
				{$t('wallet.receive.unit_sats')}
			</button>
		{:else}
			<span
				class="text-base-content text-4xl font-bold tabular-nums md:text-5xl lg:text-6xl"
				data-testid="primary-amount-usd"
			>
				{formatUSD(amountInUSD)}
			</span>
			<button
				type="button"
				class="btn btn-sm btn-ghost h-auto min-h-0 px-2 text-lg font-semibold md:px-3 md:text-xl"
				onclick={onUnitToggle}
				aria-label={$t('wallet.receive.unit_usd')}
			>
				{$t('wallet.receive.unit_usd')}
			</button>
		{/if}
	</div>

	<!-- Conversion Display (Secondary) -->
	{#if amount && parseFloat(amount) > 0}
		<div class="text-base-content/70 flex items-center gap-2 text-base md:text-lg">
			{#if unit === 'sats'}
			{#if isPriceLoading}
					<span class="loading loading-spinner loading-sm"></span>
					<span>{$t('common.loading')}</span>
				{:else if effectiveBtcPrice > 0}
					<span data-testid="conversion-usd">≈ {formatUSD(amountInUSD)}</span>
				{:else if isPriceUnavailable}
					<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
				{/if}
			{:else if isPriceLoading}
				<span class="loading loading-spinner loading-sm"></span>
				<span>{$t('common.loading')}</span>
			{:else if effectiveBtcPrice > 0}
				<span data-testid="conversion-sats"
					>≈ {formatSats(amountInSats)} {$t('wallet.receive.unit_sats')}</span
				>
			{:else if isPriceUnavailable}
				<span class="text-base-content/50">{$t('wallet.exchange_rate_unavailable')}</span>
			{/if}
		</div>
	{/if}
</div>

<style>
	/* Ensure consistent number rendering */
	.tabular-nums {
		font-variant-numeric: tabular-nums;
	}
</style>
