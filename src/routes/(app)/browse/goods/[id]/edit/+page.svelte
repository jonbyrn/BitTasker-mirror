<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import GoodsForm from '$lib/components/market/GoodsForm.svelte';
	import { goodsBoard, refreshGoodsBoard } from '$lib/market/board.svelte';
	import { marketCopy } from '$lib/market/copy';
	import { formFromListing, type GoodsFormValue } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';
	import { pubkeyHex, samePerson } from '$lib/staffing/ids';
	import { getNpub } from '$lib/utils/nostrKeys';

	const enabled = isMarketEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));
	const listingId = $derived(page.params.id ?? '');
	const listing = $derived(goodsBoard.listings.find((item) => item.id === listingId) ?? null);

	let me = $state('');
	let value = $state<GoodsFormValue | null>(null);

	onMount(() => {
		if (!enabled) return;
		getNpub()
			.then((pubkey) => {
				me = pubkeyHex(pubkey);
				const item = goodsBoard.listings.find((listing) => listing.id === listingId);
				if (item && samePerson(item.sellerPubkey, me)) value = formFromListing(item);
			})
			.catch(() => {
				me = '';
			});
		refreshGoodsBoard().then(() => {
			const item = goodsBoard.listings.find((listing) => listing.id === listingId);
			if (item && me && samePerson(item.sellerPubkey, me) && !value) value = formFromListing(item);
		});
	});
</script>

<svelte:head>
	<title>{copy.edit} · BitTasker</title>
</svelte:head>

<div class="container mx-auto px-4 py-8">
	<a
		class="link mb-4 inline-block text-sm"
		href={resolve('/(app)/browse/goods/[id]', { id: listingId })}
	>
		{copy.back}
	</a>
	<h1 class="mb-4 text-2xl font-semibold">{copy.edit}</h1>
	{#if !enabled}
		<p data-testid="goods-off">{copy.off}</p>
	{:else if !goodsBoard.loaded}
		<p>{copy.loading}</p>
	{:else if value && listing && samePerson(listing.sellerPubkey, me)}
		<GoodsForm bind:value existing={listing} />
	{:else}
		<p>{copy.unavailable}</p>
	{/if}
</div>
