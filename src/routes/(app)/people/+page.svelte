<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import { nip19 } from 'nostr-tools';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import { peopleCopy } from '$lib/people/copy';
	import {
		LISTING_SEARCH_DEBOUNCE_MS,
		fetchListingSearch,
		listingSearchPath,
		profilesFromSearchBody,
		readSearchQueryParam,
		replaceSearchQueryParam,
		type ProfileHit
	} from '$lib/search/listing-search';
	import { categoriesFor } from '$lib/search/taxonomy.js';

	let searchQuery = $state('');
	let tileCategory = $state('');
	let people = $state<ProfileHit[]>([]);
	let loading = $state(true);
	let searchVersion = 0;
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let searchAbort: AbortController | null = null;

	const copy = $derived(peopleCopy(String($locale || 'en')));
	const tileLanguage = $derived(String($locale || 'en').startsWith('es') ? 'es' : 'en');
	const taskCategories = $derived(
		[...categoriesFor('local'), ...categoriesFor('remote')].filter(
			(category) => category.id !== 'temp-staff'
		)
	);
	const emptyMessage = $derived(
		searchQuery.trim() || tileCategory ? copy.empty : copy.emptyDirectory
	);

	function profileNpub(pubkey: string): string {
		try {
			return nip19.npubEncode(pubkey);
		} catch {
			return '';
		}
	}

	function syncQueryParam(q: string) {
		const next = replaceSearchQueryParam(window.location.href, q);
		if (next !== window.location.href) history.replaceState(history.state, '', next);
	}

	async function runSearch(q: string, categoryId: string, version: number) {
		searchAbort?.abort();
		const controller = new AbortController();
		searchAbort = controller;
		loading = true;
		people = [];
		const path = listingSearchPath({
			q,
			type: 'profile',
			categoryIds: categoryId ? [categoryId] : []
		});
		try {
			const body = await fetchListingSearch(path, controller.signal);
			if (controller.signal.aborted || version !== searchVersion) return;
			people = profilesFromSearchBody(body, categoryId ? [categoryId] : []);
			loading = false;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			if (controller.signal.aborted || version !== searchVersion) return;
			people = [];
			loading = false;
		}
	}

	function queueSearch() {
		if (searchTimer) clearTimeout(searchTimer);
		searchTimer = setTimeout(() => {
			const version = ++searchVersion;
			const q = searchQuery.trim();
			syncQueryParam(q);
			void runSearch(q, tileCategory, version);
		}, LISTING_SEARCH_DEBOUNCE_MS);
	}

	function selectTile(id: string) {
		tileCategory = tileCategory === id ? '' : id;
		if (searchTimer) clearTimeout(searchTimer);
		const version = ++searchVersion;
		syncQueryParam(searchQuery.trim());
		void runSearch(searchQuery.trim(), tileCategory, version);
	}

	onMount(() => {
		searchQuery = readSearchQueryParam(window.location.href);
		const version = ++searchVersion;
		void runSearch(searchQuery.trim(), tileCategory, version);
		return () => {
			if (searchTimer) clearTimeout(searchTimer);
			searchAbort?.abort();
		};
	});
</script>

<main class="mx-auto w-full max-w-6xl px-4 py-6 font-sans" data-testid="people-page">
	<h1 class="pb-3 text-2xl font-semibold">{copy.title}</h1>
	<label class="block pb-4">
		<span class="sr-only">{copy.placeholder}</span>
		<input
			class="input input-bordered w-full"
			type="search"
			placeholder={copy.placeholder}
			bind:value={searchQuery}
			oninput={queueSearch}
			data-testid="people-search-input"
			autocomplete="off"
		/>
	</label>

	<div class="pb-4" data-testid="people-category-tiles">
		<ul class="flex gap-3 overflow-x-auto pb-2">
			{#each taskCategories as category (category.id)}
				<li class="w-36 shrink-0">
					<button
						type="button"
						class="border-base-300 hover:border-primary flex h-full w-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center"
						class:border-primary={tileCategory === category.id}
						aria-pressed={tileCategory === category.id}
						data-testid="people-category-tile-{category.id}"
						onclick={() => selectTile(category.id)}
					>
						<CategoryIcon name={category.icon} />
						<span class="text-sm leading-tight font-medium">
							{tileLanguage === 'es' ? category.nameEs : category.name}
						</span>
					</button>
				</li>
			{/each}
		</ul>
	</div>

	{#if loading && people.length === 0}
		<div
			class="flex flex-col items-center justify-center py-12"
			data-testid="people-search-loading"
			aria-busy="true"
		>
			<span class="loading loading-spinner loading-lg text-primary"></span>
			<p class="text-base-content/70 mt-4">{copy.loading}</p>
		</div>
	{:else if people.length === 0}
		<div class="py-8 text-center" data-testid="people-search-empty">
			<p class="text-lg font-semibold">{emptyMessage}</p>
		</div>
	{:else}
		<ul class="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="people-list">
			{#each people as person (person.pubkey)}
				{@const npub = profileNpub(person.pubkey)}
				<li class="card bg-base-100 border-base-300 rounded-xl border p-4 shadow-sm">
					<div class="flex items-center gap-3">
						{#if person.picture}
							<img
								src={person.picture}
								alt=""
								class="h-12 w-12 rounded-full object-cover"
								data-testid="people-picture"
							/>
						{/if}
						<div class="min-w-0 flex-1">
							<p class="truncate font-medium">{person.title}</p>
							{#if person.location}
								<p class="text-base-content/60 truncate text-sm">{person.location}</p>
							{/if}
						</div>
						{#if npub}
							<a
								class="btn btn-secondary btn-sm"
								href={resolve('/(app)/npub/[npub]', { npub })}
								data-testid="people-view-link"
							>
								{copy.view}
							</a>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>
