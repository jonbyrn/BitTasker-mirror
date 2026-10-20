<script lang="ts">
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals, formatInteger } from '$lib/utils/helpers/currencyFormatter';

	const {
		amount,
		btcPrice,
		title = null,
		usdColor = 'text-base-content',
		satsKey = 'bids.sats',
		size = 'default'
	} = $props<{
		/** Amount in USD */
		amount: number;
		/** BTC price for sats conversion */
		btcPrice: number;
		/** Optional title shown above the amount (e.g. "Amount", "YOUR BID") */
		title?: string | null;
		/** Tailwind class for USD value color (e.g. "text-primary", "text-base-content") */
		usdColor?: string;
		/** Translation key for "sats" suffix (default: bids.sats) */
		satsKey?: string;
		/** Size variant: default (text-lg), compact (text-sm), or large (text-2xl) */
		size?: 'default' | 'compact' | 'large';
	}>();

	/** Sats computed from USD and BTC price. A missing price is not zero sats. */
	const satsFormatted = $derived.by(() => {
		if (!(btcPrice > 0) || !Number.isFinite(amount)) return null;
		const sats = Math.round((amount / btcPrice) * 100_000_000);
		if (!Number.isFinite(sats)) return null;
		return formatInteger(sats);
	});

	const usdSizeClass = $derived(
		size === 'compact' ? 'text-sm' : size === 'large' ? 'text-2xl' : 'text-lg'
	);
	const satsSizeClass = $derived(
		size === 'compact' ? 'text-xs' : size === 'large' ? 'text-base' : 'text-sm'
	);
</script>

<div class="flex flex-col gap-0.5 text-right">
	{#if title}
		<span class="text-base-content/60 block text-xs font-semibold tracking-wide uppercase">
			{title}
		</span>
	{/if}
	<p class="{usdColor} {usdSizeClass} font-bold">${formatNumberWithTwoDecimals(amount)} USD</p>
	{#if satsFormatted === null}
		<p class="text-base-content/80 {satsSizeClass}">{$t('bids.price_unavailable')}</p>
	{:else}
		<p class="text-base-content/80 {satsSizeClass}">{satsFormatted} {$t(satsKey)}</p>
	{/if}
</div>
