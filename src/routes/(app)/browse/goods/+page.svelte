<script lang="ts">
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import BrowseSearch from '$lib/components/browse/BrowseSearch.svelte';
	import { categoryLabel, conditionLabel, fulfillmentLabel } from '$lib/market/categories';
	import { marketCopy } from '$lib/market/copy';
	import { goodsBoard, refreshGoodsBoard } from '$lib/market/board.svelte';
	import { priceLabel } from '$lib/market/money';
	import { loadBtcUsd } from '$lib/market/price';
	import { matchesGoods } from '$lib/market/rules';
	import { GOODS_CATEGORIES, GOODS_CONDITIONS, GOODS_FULFILLMENTS } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';

	const enabled = isMarketEnabled();
	const language = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const copy = $derived(marketCopy(language));

	let query = $state('');
	let category = $state('');
	let condition = $state('');
	let fulfillment = $state('');
	let maxPrice = $state('');
	let location = $state('');
	let maxKm = $state('');
	let near = $state<{ latitude: number; longitude: number } | null>(null);
	let btcUsd = $state(0);
	let placeError = $state('');

	const suggestions = $derived(
		GOODS_CATEGORIES.filter((item) => {
			const needle = query.trim().toLowerCase();
			const name = categoryLabel(item, language).toLowerCase();
			return !needle || name.includes(needle);
		}).map((item) => ({
			id: item,
			label: categoryLabel(item, language),
			categoryId: item
		}))
	);
	const visible = $derived(
		goodsBoard.listings.filter((item) =>
			matchesGoods(item, {
				query,
				category,
				condition,
				fulfillment,
				maxPrice: Number(maxPrice) || 0,
				location,
				near,
				maxKm: Number(maxKm) || 0
			})
		)
	);

	function selectCategory(id: string) {
		category = category === id ? '' : id;
	}

	function useHere() {
		placeError = '';
		if (!navigator.geolocation) {
			placeError = copy.nearDenied;
			return;
		}
		navigator.geolocation.getCurrentPosition(
			(position) => {
				near = { latitude: position.coords.latitude, longitude: position.coords.longitude };
			},
			() => {
				placeError = copy.nearDenied;
			}
		);
	}

	onMount(() => {
		if (!enabled) return;
		refreshGoodsBoard();
		loadBtcUsd().then((price) => {
			btcUsd = price;
		});
	});
</script>

<svelte:head>
	<title>{copy.title} · BitTasker</title>
</svelte:head>

<div class="container mx-auto min-w-0 px-4 py-8" data-testid="browse-page-goods">
	<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
		<h1 class="text-2xl font-semibold">{copy.title}</h1>
		{#if enabled}
			<a href={resolve('/(app)/browse/goods/new')} class="btn btn-primary btn-sm">{copy.sell}</a>
		{/if}
	</div>

	{#if !enabled}
		<p data-testid="goods-off">{copy.off}</p>
	{:else}
		<p class="text-base-content/70 mb-4 max-w-2xl text-sm">{copy.noKyc}</p>
		<BrowseSearch placeholder={copy.search} bind:query {suggestions} onpick={selectCategory} />

		<ul
			class="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4"
			data-testid="browse-tiles"
		>
			{#each GOODS_CATEGORIES as item (item)}
				<li>
					<button
						type="button"
						class="border-base-300 hover:border-primary h-full w-full rounded-xl border px-3 py-4 text-sm font-medium"
						class:border-primary={category === item}
						aria-pressed={category === item}
						data-testid="browse-tile-{item}"
						onclick={() => selectCategory(item)}
					>
						{categoryLabel(item, language)}
					</button>
				</li>
			{/each}
		</ul>

		<div class="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="browse-filters">
			<label class="flex flex-col gap-1 text-sm">
				{copy.condition}
				<select class="select select-bordered" bind:value={condition}>
					<option value="">{copy.any}</option>
					{#each GOODS_CONDITIONS as item (item)}
						<option value={item}>{conditionLabel(item, language)}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.fulfillment}
				<select class="select select-bordered" bind:value={fulfillment}>
					<option value="">{copy.any}</option>
					{#each GOODS_FULFILLMENTS as item (item)}
						<option value={item}>{fulfillmentLabel(item, language)}</option>
					{/each}
				</select>
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.price}
				<input class="input input-bordered" type="number" min="0" step="1" bind:value={maxPrice} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.location}
				<input class="input input-bordered" type="search" bind:value={location} />
			</label>
			<label class="flex flex-col gap-1 text-sm">
				{copy.distance}
				<input class="input input-bordered" type="number" min="0" step="1" bind:value={maxKm} />
			</label>
			<div class="flex items-end">
				<button type="button" class="btn btn-outline btn-sm" onclick={useHere}>{copy.near}</button>
			</div>
		</div>
		{#if placeError}
			<p class="mt-2 text-sm">{placeError}</p>
		{/if}

		{#if !goodsBoard.loaded}
			<p class="mt-6" data-testid="browse-loading">{copy.loading}</p>
		{:else if visible.length === 0}
			<p class="mt-6" data-testid="browse-empty">{copy.empty}</p>
		{:else}
			<ul class="mt-6 grid gap-3 sm:grid-cols-2">
				{#each visible as item (item.id)}
					<li>
						<a
							href={resolve('/(app)/browse/goods/[id]', { id: item.id })}
							class="border-base-300 hover:border-primary block rounded-xl border p-4"
							data-testid="browse-result"
						>
							{#if item.photos[0]}
								<img src={item.photos[0]} alt="" class="mb-3 h-36 w-full rounded-lg object-cover" />
							{/if}
							<span class="font-medium">{item.title}</span>
							<span class="mt-1 block text-sm">{priceLabel(item.priceUsd, btcUsd)}</span>
							<span class="text-base-content/70 mt-1 block text-sm">
								{categoryLabel(item.category, language)} · {conditionLabel(
									item.condition,
									language
								)} · {item.location}
							</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>
