<script lang="ts">
	import { browser } from '$app/environment';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import HelpFinder from '$lib/components/categories/HelpFinder.svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { categoriesWithListings } from '$lib/search/browse-index';
	import { loadHomeTileCounts } from '$lib/search/home-counts';
	import { categoriesFor, categoryCopy, priceLabel } from '$lib/search/taxonomy.js';

	let {
		showHeading = true,
		counts = undefined
	}: { showHeading?: boolean; counts?: Record<string, number> | null } = $props();

	let loadedCounts = $state<Record<string, number> | null>(null);
	const tileCounts = $derived(counts === undefined ? loadedCounts : counts);

	const spanish = $derived(String($locale || 'en').startsWith('es'));
	const copy = $derived(categoryCopy(spanish ? 'es' : 'en'));
	const groups = $derived([
		{ id: 'local' as const, label: copy.inPerson },
		{ id: 'remote' as const, label: copy.remote }
	]);

	function nameFor(category: { name: string; nameEs: string }) {
		return spanish ? category.nameEs : category.name;
	}

	function cost(category: { fromPrice: number; priceUnit: 'project' | 'hour' }) {
		return priceLabel(category.fromPrice, category.priceUnit, spanish ? 'es' : 'en');
	}

	function tilesFor(mode: 'local' | 'remote') {
		const list = categoriesFor(mode).filter(
			(category) => category.id !== 'temp-staff' || isTempStaffEnabled()
		);
		if (!tileCounts) return list;
		return categoriesWithListings(list, tileCounts);
	}

	$effect(() => {
		if (counts !== undefined || !browser) return;
		let cancelled = false;
		loadHomeTileCounts()
			.then((next) => {
				if (!cancelled) loadedCounts = next;
			})
			.catch(() => {
				if (!cancelled) loadedCounts = null;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

<section class="bg-base-100 text-base-content overflow-x-clip py-12" data-testid="category-grid">
	<div class="container mx-auto min-w-0 px-4">
		<HelpFinder />

		{#if showHeading}
			<div class="mt-10 mb-8 flex flex-wrap items-end justify-between gap-3">
				<h2 class="text-2xl font-semibold">{copy.needDone}</h2>
				<a href={resolve('/categories')} class="link link-primary text-sm">{copy.seeAll}</a>
			</div>
		{/if}

		<div class="space-y-8">
			{#each groups as group (group.id)}
				{@const tiles = tilesFor(group.id)}
				{#if tiles.length > 0}
					<div>
						<h3 class="mb-3 text-sm font-medium tracking-wide uppercase">{group.label}</h3>
						<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
							{#each tiles as category (category.id)}
								<li>
									{#if category.id === 'temp-staff'}
										<a
											href={resolve('/(app)/shifts')}
											class="border-base-300 bg-base-100 hover:border-primary flex h-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
											data-testid="category-tile-{category.id}"
										>
											<CategoryIcon name={category.icon} />
											<span class="text-sm leading-tight font-medium">{nameFor(category)}</span>
											<span class="text-base-content/60 text-xs">{cost(category)}</span>
										</a>
									{:else}
										<a
											href={resolve('/(app)/categories/[category]', { category: category.id })}
											class="border-base-300 bg-base-100 hover:border-primary flex h-full flex-col items-center gap-2 rounded-xl border px-3 py-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
											data-testid="category-tile-{category.id}"
										>
											<CategoryIcon name={category.icon} />
											<span class="text-sm leading-tight font-medium">{nameFor(category)}</span>
											<span class="text-base-content/60 text-xs">{cost(category)}</span>
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</section>
