<script lang="ts">
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import HelpFinder from '$lib/components/categories/HelpFinder.svelte';
	import { onMount } from 'svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import { loadCategoryListingCounts } from '$lib/search/category-counts';
	import { categoriesFor, categoryById, categoryCopy, priceLabel } from '$lib/search/taxonomy.js';

	const HOME_PREVIEW_IDS = ['cleaning', 'handyman', 'moving', 'assembly', 'mounting', 'gardening'];

	let {
		showHeading = true,
		preview = 0,
		showFinder = true,
		showPopular = true
	}: {
		showHeading?: boolean;
		preview?: number;
		showFinder?: boolean;
		showPopular?: boolean;
	} = $props();
	let counts = $state<Record<string, number>>({});

	onMount(() => {
		let cancelled = false;
		void loadCategoryListingCounts()
			.then((next) => {
				if (!cancelled) counts = next;
			})
			.catch(() => {
				// The price label still shows when the catalog does not answer.
			});
		return () => {
			cancelled = true;
		};
	});

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

	const previewCategories = $derived.by(() => {
		if (!preview) return [];
		return HOME_PREVIEW_IDS.map((id) => categoryById(id)).filter(
			(category): category is NonNullable<ReturnType<typeof categoryById>> => Boolean(category)
		);
	});
</script>

{#snippet tile(
	category: {
		id: string;
		icon: string;
		name: string;
		nameEs: string;
		fromPrice: number;
		priceUnit: 'project' | 'hour';
	},
	large = false
)}
	<li class={large ? 'w-40 shrink-0 snap-start lg:w-auto' : ''}>
		{#if category.id === 'temp-staff'}
			<a
				href={resolve('/(app)/shifts')}
				class="border-base-300 bg-base-100 hover:border-primary flex h-full flex-col items-center gap-2 rounded-xl border px-3 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
				data-testid="category-tile-{category.id}"
			>
				<CategoryIcon name={category.icon} class={large ? 'text-5xl' : ''} />
				<span class="text-base leading-tight font-medium">{nameFor(category)}</span>
				<span class="text-base">{cost(category)}</span>
			</a>
		{:else}
			<a
				href={resolve('/(app)/categories/[category]', { category: category.id })}
				class="border-base-300 bg-base-100 hover:border-primary flex h-full flex-col items-center gap-2 rounded-xl border px-3 py-5 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
				data-testid="category-tile-{category.id}"
			>
				<CategoryIcon name={category.icon} class={large ? 'text-5xl' : ''} />
				<span class="text-base leading-tight font-medium">{nameFor(category)}</span>
				<span class="text-base">{cost(category)}</span>
				{#if counts[category.id]}
					<span class="text-base" data-testid="category-count-{category.id}">
						{counts[category.id]}
					</span>
				{/if}
			</a>
		{/if}
	</li>
{/snippet}

<section class="bg-base-100 text-base-content overflow-x-clip py-12" data-testid="category-grid">
	<div class="container mx-auto min-w-0 px-4">
		{#if showFinder}
			<HelpFinder {showPopular} />
		{/if}

		{#if preview > 0}
			<div class="mb-6 flex flex-wrap items-end justify-between gap-3">
				<h2>{copy.needDone}</h2>
				<a
					href={resolve('/categories')}
					class="link link-primary text-base"
					data-testid="categories-see-all"
				>
					{copy.seeAll}
				</a>
			</div>
			<ul
				class="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 lg:grid lg:grid-cols-6 lg:overflow-visible"
			>
				{#each previewCategories as category (category.id)}
					{@render tile(category, true)}
				{/each}
			</ul>
		{:else}
			{#if showHeading}
				<div class="mt-10 mb-8 flex flex-wrap items-end justify-between gap-3">
					<h2>{copy.needDone}</h2>
					<a href={resolve('/categories')} class="link link-primary text-base">{copy.seeAll}</a>
				</div>
			{/if}

			<div class="space-y-8">
				{#each groups as group (group.id)}
					<div>
						<p class="mb-3 text-base font-medium">{group.label}</p>
						<ul class="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
							{#each categoriesFor(group.id).filter((category) => category.id !== 'temp-staff' || isTempStaffEnabled()) as category (category.id)}
								{@render tile(category)}
							{/each}
						</ul>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</section>
