<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import GoodsForm from '$lib/components/market/GoodsForm.svelte';
	import { marketCopy } from '$lib/market/copy';
	import { blankGoodsForm } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';

	const enabled = isMarketEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	const starting = page.url.searchParams.get('type') === 'rent' ? 'rent' : 'sell';
	let value = $state(blankGoodsForm(starting));
	const heading = $derived(value.offer === 'rent' ? copy.rent : copy.sell);
</script>

<svelte:head>
	<title>{heading} · BitTasker</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<a class="link mb-4 inline-block text-sm" href={resolve('/(app)/browse/goods')}>{copy.back}</a>
	<h1 class="listing-body mb-4 text-2xl font-semibold">{heading}</h1>
	{#if !enabled}
		<p data-testid="goods-off">{copy.off}</p>
	{:else}
		<GoodsForm bind:value />
	{/if}
</div>
