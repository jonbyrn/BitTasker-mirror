<script lang="ts">
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import BrowseSearch from '$lib/components/browse/BrowseSearch.svelte';
	import { categoryLabel, conditionLabel, fulfillmentLabel } from '$lib/market/categories';
	import { isJunkListing } from '$lib/browse/task-board';
	import { BROWSE_DEADLINE_MS } from '$lib/nostr/relayQuery';
	import { marketCopy } from '$lib/market/copy';
	import { goodsBoard, refreshGoodsBoard } from '$lib/market/board.svelte';
	import { askingLabel } from '$lib/market/money';
	import { loadBtcUsd } from '$lib/market/price';
	import { matchesGoods, stockLeft } from '$lib/market/rules';
	import { GOODS_CATEGORIES, GOODS_CONDITIONS, GOODS_FULFILLMENTS } from '$lib/market/types';
	import { isMarketEnabled } from '$lib/services/feature-flags';
	import IconChip from '~icons/mdi/chip';
	import IconCellphone from '~icons/mdi/cellphone';
	import IconSofa from '~icons/mdi/sofa';
	import IconHome from '~icons/mdi/home';
	import IconShirt from '~icons/mdi/tshirt-crew';
	import IconCar from '~icons/mdi/car';
	import IconTools from '~icons/mdi/hammer-wrench';
	import IconBasketball from '~icons/mdi/basketball';
	import IconBaby from '~icons/mdi/baby-carriage';
	import IconProperty from '~icons/mdi/home-city';
	import IconLaptop from '~icons/mdi/laptop';
	import IconPackage from '~icons/mdi/package-variant';
	import type { Component } from 'svelte';

	const TILE_ICONS: Record<string, Component> = {
		electronics: IconChip,
		phones: IconCellphone,
		furniture: IconSofa,
		home: IconHome,
		clothing: IconShirt,
		vehicles: IconCar,
		tools: IconTools,
		sports: IconBasketball,
		kids: IconBaby,
		property: IconProperty,
		digital: IconLaptop,
		other: IconPackage
	};

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
	let timedOut = $state(false);
	let ready = $state(false);

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
		goodsBoard.listings.filter((item) => {
			const listing = { title: item.title, description: item.description, location: item.location };
			if (isJunkListing(listing)) return false;
			return matchesGoods(item, {
				query,
				category,
				condition,
				fulfillment,
				maxPrice: Number(maxPrice) || 0,
				location,
				near,
				maxKm: Number(maxKm) || 0
			});
		})
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

	function loadGoods() {
		ready = false;
		timedOut = false;
		const timer = setTimeout(() => {
			ready = true;
			if (!goodsBoard.loaded) timedOut = true;
		}, BROWSE_DEADLINE_MS);
		refreshGoodsBoard().finally(() => {
			clearTimeout(timer);
			ready = true;
		});
	}

	onMount(() => {
		if (!enabled) return;
		loadGoods();
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
						class="border-base-300 hover:border-primary flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm font-medium"
						class:border-primary={category === item}
						aria-pressed={category === item}
						data-testid="browse-tile-{item}"
						onclick={() => selectCategory(item)}
					>
						<span class="text-primary text-2xl" aria-hidden="true">
							{#if TILE_ICONS[item]}
								{@const TileIcon = TILE_ICONS[item]}
								<TileIcon />
							{/if}
						</span>
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

		{#if !ready && visible.length === 0}
			<div class="mt-6 flex flex-col gap-3" data-testid="browse-loading" aria-busy="true">
				<p class="sr-only">{copy.loading}</p>
				{#each [0, 1, 2, 3] as card (card)}
					<div class="bg-base-300 h-24 w-full animate-pulse rounded-xl"></div>
				{/each}
			</div>
		{:else if visible.length === 0}
			<div class="mt-8 max-w-lg" data-testid="browse-empty">
				<p class="text-lg font-medium">
					{goodsBoard.loaded && goodsBoard.listings.length === 0 && !query && !category
						? copy.catalogEmpty
						: copy.empty}
				</p>
				<p class="text-base-content/70 mt-2 text-sm">{copy.emptyHelp}</p>
				<a
					href={resolve('/(app)/browse/goods/new')}
					class="btn btn-primary mt-4"
					data-testid="goods-empty-sell"
				>
					{copy.sell}
				</a>
				{#if timedOut && !goodsBoard.loaded}
					<p class="mt-4 text-sm" data-testid="browse-timeout">{copy.slow}</p>
					<button
						type="button"
						class="btn btn-outline btn-sm mt-3"
						data-testid="browse-retry"
						onclick={loadGoods}
					>
						{copy.retry}
					</button>
				{/if}
			</div>
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
							<span class="mt-1 block text-sm"
								>{askingLabel(item.priceUsd, item.priceSats, btcUsd)}</span
							>
							{#if stockLeft(item, goodsBoard.orders) === 0}
								<span class="mt-1 block text-sm">{copy.soldOut}</span>
							{/if}
							<span class="listing-body text-base-content/70 mt-1 block">
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
