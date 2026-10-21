<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { SvelteURLSearchParams } from 'svelte/reactivity';
	import { locale } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import { SEARCH_CATEGORIES, labelFor } from '$lib/search/taxonomy.js';

	let { category = '' }: { category?: string } = $props();

	const RECENT_KEY = 'bittasker-recent-searches';

	let query = $state('');
	let sort = $state('newest');
	let minPrice = $state('');
	let maxPrice = $state('');
	let remote = $state('');
	let place = $state('');
	let minRating = $state('');
	let loading = $state(false);
	let ready = $state(true);
	let message = $state('');
	let suggestions = $state<string[]>([]);
	let recent = $state<string[]>([]);
	let tasks = $state<SearchHit[]>([]);
	let services = $state<SearchHit[]>([]);
	let profiles = $state<SearchHit[]>([]);
	let searched = $state(false);

	type SearchHit = {
		id: string;
		type: string;
		title: string;
		description?: string;
		category?: string;
		subcategory?: string;
		price_usd?: number;
		price_sats?: number;
		location?: string;
		remote?: boolean;
		rating?: number;
		pubkey?: string;
		url?: string;
	};

	let spanish = $derived(($locale || 'en').startsWith('es'));
	let activeCategory = $derived(
		SEARCH_CATEGORIES.find((item) => item.id === category) ? category : ''
	);
	let copy = $derived(
		spanish
			? {
					placeholder: 'Busca tareas, servicios o personas',
					tasks: 'Tareas',
					services: 'Servicios',
					people: 'Personas',
					newest: 'Más recientes',
					price: 'Precio',
					rating: 'Valoración',
					anywhere: 'Cualquier lugar',
					remote: 'Remoto',
					place: 'En un lugar',
					city: 'Ciudad',
					min: 'Precio mínimo (USD)',
					max: 'Precio máximo (USD)',
					anyRating: 'Cualquier valoración',
					empty: 'Nada coincide con eso. Prueba una categoría o una palabra más corta.',
					start: 'Busca tareas, servicios y personas en un solo lugar.',
					offline:
						'La búsqueda todavía no está conectada. Mientras tanto puedes ver tareas y servicios.',
					categoryEmpty: 'Todavía no hay nada en esta categoría.',
					recent: 'Búsquedas recientes',
					clear: 'Borrar filtros',
					remoteLabel: 'Remoto',
					priceOnRequest: 'Precio a consultar',
					unknownCategory: 'Esa categoría no está en BitTasker.'
				}
			: {
					placeholder: 'Search tasks, services, or people',
					tasks: 'Tasks',
					services: 'Services',
					people: 'People',
					newest: 'Newest',
					price: 'Price',
					rating: 'Rating',
					anywhere: 'Anywhere',
					remote: 'Remote',
					place: 'In a place',
					city: 'City',
					min: 'Minimum price (USD)',
					max: 'Maximum price (USD)',
					anyRating: 'Any rating',
					empty: 'Nothing matches that. Try a category or a shorter word.',
					start: 'Search tasks, services, and people in one place.',
					offline: 'Search is not connected yet. You can still browse tasks and services.',
					categoryEmpty: 'Nothing in this category yet.',
					recent: 'Recent searches',
					clear: 'Clear filters',
					remoteLabel: 'Remote',
					priceOnRequest: 'Price on request',
					unknownCategory: 'That category is not on BitTasker.'
				}
	);

	let searchTimer: ReturnType<typeof setTimeout> | undefined;

	onMount(() => {
		try {
			const stored = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
			recent = Array.isArray(stored)
				? stored.filter((item) => typeof item === 'string').slice(0, 8)
				: [];
		} catch {
			recent = [];
		}
		scheduleSearch();
	});

	function scheduleSearch() {
		if (!browser) return;
		clearTimeout(searchTimer);
		searchTimer = setTimeout(() => runSearch(), 250);
	}

	function remember(value: string) {
		const next = [value, ...recent.filter((item) => item !== value)].slice(0, 8);
		recent = next;
		if (browser) localStorage.setItem(RECENT_KEY, JSON.stringify(next));
	}

	async function runSearch() {
		const trimmed = query.trim();
		if (trimmed.length === 1) return;
		loading = true;
		const params = new SvelteURLSearchParams();
		if (trimmed) params.set('q', trimmed);
		if (activeCategory) params.set('category', activeCategory);
		if (sort) params.set('sort', sort);
		if (minPrice) params.set('minPrice', minPrice);
		if (maxPrice) params.set('maxPrice', maxPrice);
		if (remote) params.set('remote', remote);
		if (place && remote !== 'true') params.set('location', place);
		if (minRating) params.set('minRating', minRating);
		try {
			const response = await fetch(`/api/search?${params.toString()}`);
			const body = await response.json();
			ready = body.ready !== false;
			message = body.message || '';
			tasks = body.tasks || [];
			services = body.services || [];
			profiles = body.profiles || [];
			suggestions = trimmed ? body.suggestions || [] : [];
			searched = true;
			if (trimmed && ready) remember(trimmed);
		} catch {
			ready = false;
			message = copy.offline;
			tasks = [];
			services = [];
			profiles = [];
		} finally {
			loading = false;
		}
	}

	function useSuggestion(value: string) {
		query = value;
		suggestions = [];
		runSearch();
	}

	function clearFilters() {
		minPrice = '';
		maxPrice = '';
		remote = '';
		place = '';
		minRating = '';
		sort = 'newest';
		scheduleSearch();
	}

	function taskId(hit: SearchHit): string {
		const prefix = '/tasks/';
		if (!hit.url?.startsWith(prefix)) return '';
		return decodeURIComponent(hit.url.slice(prefix.length));
	}

	function serviceId(hit: SearchHit): string {
		const prefix = '/services/';
		if (!hit.url?.startsWith(prefix)) return '';
		return decodeURIComponent(hit.url.slice(prefix.length));
	}

	function profileNpub(hit: SearchHit): string {
		if (!hit.pubkey || !/^[0-9a-f]{64}$/i.test(hit.pubkey)) return '';
		try {
			return nip19.npubEncode(hit.pubkey);
		} catch {
			return '';
		}
	}

	function priceLabel(hit: SearchHit): string {
		if ((hit.price_usd || 0) > 0) {
			return new Intl.NumberFormat(spanish ? 'es' : 'en', {
				style: 'currency',
				currency: 'USD',
				maximumFractionDigits: 0
			}).format(hit.price_usd || 0);
		}
		if ((hit.price_sats || 0) > 0) return `${hit.price_sats} sats`;
		return copy.priceOnRequest;
	}

	let total = $derived(tasks.length + services.length + profiles.length);
	let showStart = $derived(!query.trim() && !activeCategory && total === 0 && ready);
</script>

<section class="mx-auto w-full max-w-3xl px-4 py-6" data-testid="unified-search">
	<label class="relative block">
		<span class="sr-only">{copy.placeholder}</span>
		<input
			class="input input-bordered w-full"
			data-testid="unified-search-input"
			placeholder={copy.placeholder}
			bind:value={query}
			oninput={() => {
				searched = false;
				scheduleSearch();
			}}
		/>
		{#if suggestions.length > 0}
			<ul
				class="bg-base-100 absolute z-10 mt-1 w-full rounded-lg border shadow"
				data-testid="search-suggestions"
			>
				{#each suggestions as suggestion (suggestion)}
					<li>
						<button
							type="button"
							class="hover:bg-base-200 w-full px-3 py-2 text-left"
							onclick={() => useSuggestion(suggestion)}
						>
							{suggestion}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</label>

	<div class="mt-4 flex flex-wrap gap-2" data-testid="category-chips">
		{#each SEARCH_CATEGORIES as item (item.id)}
			{#if item.id === activeCategory}
				<a class="badge badge-lg badge-primary" href={resolve('/(app)/search')}>
					{spanish ? item.nameEs : item.name}
				</a>
			{:else}
				<a
					class="badge badge-lg badge-outline"
					href={resolve('/(app)/search/[category]', { category: item.id })}
				>
					{spanish ? item.nameEs : item.name}
				</a>
			{/if}
		{/each}
	</div>

	<div class="mt-4 grid gap-3 sm:grid-cols-2">
		<label class="form-control">
			<span class="label-text">{spanish ? 'Ordenar' : 'Sort'}</span>
			<select
				class="select select-bordered w-full"
				bind:value={sort}
				onchange={scheduleSearch}
				data-testid="search-sort"
			>
				<option value="newest">{copy.newest}</option>
				<option value="price">{copy.price}</option>
				<option value="rating">{copy.rating}</option>
			</select>
		</label>
		<label class="form-control">
			<span class="label-text">{spanish ? 'Lugar' : 'Where'}</span>
			<select
				class="select select-bordered w-full"
				bind:value={remote}
				onchange={scheduleSearch}
				data-testid="search-where"
			>
				<option value="">{copy.anywhere}</option>
				<option value="true">{copy.remote}</option>
				<option value="false">{copy.place}</option>
			</select>
		</label>
		{#if remote === 'false'}
			<label class="form-control">
				<span class="label-text">{copy.city}</span>
				<input
					class="input input-bordered w-full"
					bind:value={place}
					placeholder={copy.city}
					oninput={scheduleSearch}
				/>
			</label>
		{/if}
		<label class="form-control">
			<span class="label-text">{copy.min}</span>
			<input
				class="input input-bordered w-full"
				type="number"
				min="0"
				bind:value={minPrice}
				oninput={scheduleSearch}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">{copy.max}</span>
			<input
				class="input input-bordered w-full"
				type="number"
				min="0"
				bind:value={maxPrice}
				oninput={scheduleSearch}
			/>
		</label>
		<label class="form-control">
			<span class="label-text">{copy.rating}</span>
			<select
				class="select select-bordered w-full"
				bind:value={minRating}
				onchange={scheduleSearch}
			>
				<option value="">{copy.anyRating}</option>
				<option value="3">3+</option>
				<option value="4">4+</option>
				<option value="5">5</option>
			</select>
		</label>
	</div>
	<button type="button" class="btn btn-ghost btn-sm mt-2" onclick={clearFilters}
		>{copy.clear}</button
	>

	{#if category && !activeCategory}
		<p class="mt-6 text-sm">{copy.unknownCategory}</p>
	{/if}

	{#if !ready}
		<p class="mt-6" data-testid="search-offline">{message || copy.offline}</p>
		<p class="mt-2 flex gap-3 text-sm">
			<a class="link" href={resolve('/(app)/tasks')}>{copy.tasks}</a>
			<a class="link" href={resolve('/(app)/services')}>{copy.services}</a>
		</p>
	{:else if showStart}
		<p class="mt-6" data-testid="search-start">{copy.start}</p>
	{:else if searched && total === 0 && !loading}
		<p class="mt-6" data-testid="search-empty">
			{activeCategory && !query.trim() ? copy.categoryEmpty : copy.empty}
		</p>
	{/if}

	{#if recent.length > 0 && !query.trim()}
		<div class="mt-4">
			<p class="text-sm opacity-70">{copy.recent}</p>
			<div class="mt-2 flex flex-wrap gap-2">
				{#each recent as item (item)}
					<button type="button" class="btn btn-sm btn-outline" onclick={() => useSuggestion(item)}>
						{item}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if loading}
		<p class="mt-4 text-sm opacity-70">{spanish ? 'Buscando…' : 'Searching…'}</p>
	{/if}

	{#snippet group(title: string, hits: SearchHit[])}
		{#if hits.length > 0}
			<h2 class="mt-8 text-lg font-semibold">{title}</h2>
			<ul class="mt-3 space-y-3">
				{#each hits as hit (hit.id)}
					<li class="border-base-300 rounded-lg border p-3">
						{#if hit.type === 'task' && taskId(hit)}
							<a
								class="font-medium"
								href={resolve('/(app)/tasks/[taskId]', { taskId: taskId(hit) })}>{hit.title}</a
							>
						{:else if hit.type === 'service' && serviceId(hit)}
							<a
								class="font-medium"
								href={resolve('/(app)/services/[serviceId]', { serviceId: serviceId(hit) })}
								>{hit.title}</a
							>
						{:else if hit.type === 'profile' && profileNpub(hit)}
							<a
								class="font-medium"
								href={resolve('/(app)/npub/[npub]', { npub: profileNpub(hit) })}>{hit.title}</a
							>
						{:else}
							<p class="font-medium">{hit.title}</p>
						{/if}
						<p class="mt-1 text-sm opacity-70">
							{#if hit.category}{labelFor(hit.category, spanish ? 'es' : 'en')}{/if}
							{#if hit.remote}
								· {copy.remoteLabel}
							{:else if hit.location}
								· {hit.location}
							{/if}
							{#if hit.type !== 'profile'}
								· {priceLabel(hit)}
							{/if}
							{#if (hit.rating || 0) > 0}
								· {hit.rating}
							{/if}
						</p>
						{#if hit.description}
							<p class="mt-2 line-clamp-2 text-sm">{hit.description}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	{/snippet}

	{@render group(copy.tasks, tasks)}
	{@render group(copy.services, services)}
	{@render group(copy.people, profiles)}
</section>
