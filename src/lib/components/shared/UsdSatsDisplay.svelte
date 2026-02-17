<script lang="ts">
	import { t } from 'svelte-i18n';
	import { usdFromSats, SATS_PER_BTC } from '$lib/utils/helpers/crypto';

	interface Props {
		/** Amount in sats (default) or USD when amountUnit is 'usd' */
		amount: number;
		btcPrice: number;
		title?: string;
		size?: 'normal' | 'large' | 'compact';
		/** Translation key for the "sats" label (e.g. 'bids.sats') */
		satsKey?: string;
		/** When 'usd', amount is in USD and sats are derived from btcPrice */
		amountUnit?: 'sats' | 'usd';
	}

	let { amount, btcPrice, title, size = 'normal', satsKey, amountUnit = 'sats' }: Props = $props();

	const sats = $derived.by(() => {
		if (amountUnit === 'usd' && btcPrice > 0) {
			return Math.round((amount / btcPrice) * SATS_PER_BTC);
		}
		return Math.round(amount);
	});

	const usd = $derived.by(() => {
		if (btcPrice <= 0) return 0;
		if (amountUnit === 'usd') return amount;
		return usdFromSats(amount, btcPrice);
	});

	const satsFormatted = $derived(sats.toLocaleString('en-US'));
	const usdFormatted = $derived(
		usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
	);
	const satsLabel = $derived(satsKey ? $t(satsKey) : 'Sats');
</script>

<div class="flex flex-col gap-0.5 text-right">
	{#if title}
		<span class="text-base-content/60 text-xs font-medium">{title}</span>
	{/if}
	<div
		class="flex flex-col gap-0.5"
		class:text-sm={size === 'compact'}
		class:text-lg={size === 'normal'}
		class:text-xl={size === 'large'}
		class:font-semibold={size === 'large'}
		class:font-medium={size === 'normal' || size === 'compact'}
	>
		<span class="tracking-tight">${usdFormatted} USD</span>
		<span class="text-base-content/60 text-sm font-normal">
			{satsFormatted} {satsLabel}
		</span>
	</div>
</div>
