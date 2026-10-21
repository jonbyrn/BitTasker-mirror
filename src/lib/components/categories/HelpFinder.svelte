<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import { isTempStaffEnabled } from '$lib/services/feature-flags';
	import {
		categoryById,
		popularRowItems,
		categoryCopy,
		priceLabel,
		serviceSuggestions
	} from '$lib/search/taxonomy.js';

	let { showPopular = true }: { showPopular?: boolean } = $props();

	const spanish = $derived(String($locale || 'en').startsWith('es'));
	const language = $derived(spanish ? 'es' : 'en');
	const copy = $derived(categoryCopy(language));
	let query = $state('');
	let open = $state(false);

	const suggestions = $derived(
		serviceSuggestions(query, language).filter(
			(item) => item.categoryId !== 'temp-staff' || isTempStaffEnabled()
		)
	);
	const popular = $derived.by(() => {
		const items: Array<{
			id: string;
			name: string;
			nameEs: string;
			categoryId: string;
			icon: string;
			fromPrice: number;
			priceUnit: 'project' | 'hour';
		}> = [];
		for (const service of popularRowItems(language)) {
			const category = categoryById(service.categoryId);
			if (!category) continue;
			items.push({
				id: service.id,
				name: service.name,
				nameEs: service.nameEs,
				categoryId: service.categoryId,
				icon: category.icon,
				fromPrice: category.fromPrice,
				priceUnit: category.priceUnit
			});
		}
		return items;
	});
	const showList = $derived(open || query.trim().length > 0);

	function label(item: { name: string; nameEs: string }) {
		return spanish ? item.nameEs : item.name;
	}

	function cost(item: { fromPrice: number; priceUnit: 'project' | 'hour' }) {
		return priceLabel(item.fromPrice, item.priceUnit, language);
	}

	function suggestionCost(categoryId: string) {
		const category = categoryById(categoryId);
		if (!category) return '';
		return priceLabel(category.fromPrice, category.priceUnit, language);
	}

	function openFirst(event: KeyboardEvent) {
		if (event.key !== 'Enter') return;
		const first = suggestions[0];
		if (!first) return;
		event.preventDefault();
		if (first.categoryId === 'temp-staff') {
			goto(resolve('/(app)/shifts'));
			return;
		}
		goto(resolve('/(app)/categories/[category]', { category: first.categoryId }));
	}
</script>

<div data-testid="help-finder">
	<label for="help-query" class="mb-2 block text-base font-medium">{copy.helpWith}</label>
	<input
		id="help-query"
		class="input input-bordered w-full"
		type="search"
		placeholder={copy.helpWith}
		bind:value={query}
		role="combobox"
		aria-expanded={showList}
		aria-controls="help-suggestions"
		autocomplete="off"
		onfocus={() => (open = true)}
		onblur={() => (open = false)}
		onkeydown={openFirst}
	/>
	{#if showList}
		<div class="mt-3" id="help-suggestions" data-testid="help-suggestions">
			<p class="text-base-content/70 mb-2 text-base">{copy.suggested}</p>
			{#if suggestions.length === 0}
				<p class="text-base">{copy.noMatches}</p>
			{:else}
				<ul class="flex flex-col gap-1">
					{#each suggestions as item (item.id)}
						<li>
							{#if item.categoryId === 'temp-staff'}
								<a
									href={resolve('/(app)/shifts')}
									class="hover:bg-base-200 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
									data-testid="help-suggestion-{item.id}"
									onmousedown={(event) => event.preventDefault()}
								>
									<span>{label(item)}</span>
									<span class="text-base-content/70 text-base"
										>{suggestionCost(item.categoryId)}</span
									>
								</a>
							{:else}
								<a
									href={resolve('/(app)/categories/[category]', { category: item.categoryId })}
									class="hover:bg-base-200 flex items-center justify-between gap-3 rounded-lg px-3 py-2"
									data-testid="help-suggestion-{item.id}"
									onmousedown={(event) => event.preventDefault()}
								>
									<span>{label(item)}</span>
									<span class="text-base-content/70 text-base"
										>{suggestionCost(item.categoryId)}</span
									>
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</div>

{#if showPopular}
	<div class="mt-8" data-testid="popular-services">
		<div class="mb-3">
			<h2>{copy.popular}</h2>
			<p class="text-base-content/70 text-base">{copy.typical}</p>
		</div>
		<ul class="flex gap-3 overflow-x-auto pb-2">
			{#each popular as service (service.id)}
				<li class="w-40 shrink-0">
					<a
						href={resolve('/(app)/categories/[category]', { category: service.categoryId })}
						class="border-base-300 hover:border-primary flex h-full flex-col gap-2 rounded-xl border px-3 py-4"
						data-testid="popular-{service.id}"
					>
						<CategoryIcon name={service.icon} />
						<span class="text-base leading-tight font-medium">{label(service)}</span>
						<span class="text-base">{cost(service)}</span>
					</a>
				</li>
			{/each}
		</ul>
	</div>
{/if}
