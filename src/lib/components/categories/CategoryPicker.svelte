<script lang="ts">
	import { locale } from 'svelte-i18n';
	import CategoryIcon from '$lib/components/categories/CategoryIcon.svelte';
	import { TASK_CATEGORIES, type Category } from '$lib/utils/constants/categories';
	import { categoriesFor, categoryById, categoryCopy, priceLabel } from '$lib/search/taxonomy.js';

	type Mode = 'local' | 'remote' | '';

	let {
		mode = '',
		categoryId = '',
		subcategoryId = '',
		error = '',
		purpose = 'need',
		onChange
	}: {
		mode?: Mode;
		categoryId?: string;
		subcategoryId?: string;
		error?: string;
		purpose?: 'need' | 'offer';
		onChange: (next: {
			mode: Mode;
			categoryId: string;
			subcategoryId: string;
			legacy: Category | null;
		}) => void;
	} = $props();

	const spanish = $derived(String($locale || 'en').startsWith('es'));
	const copy = $derived(categoryCopy(spanish ? 'es' : 'en'));
	const selected = $derived(categoryById(categoryId));
	const visible = $derived(mode === 'local' || mode === 'remote' ? categoriesFor(mode) : []);

	function legacyFor(id: string): Category | null {
		const category = categoryById(id);
		const legacyId = category?.legacyCategoryIds[0] || category?.hintLegacyIds?.[0];
		return TASK_CATEGORIES.find((item) => item.id === legacyId) ?? null;
	}

	function chooseMode(nextMode: 'local' | 'remote') {
		if (nextMode === mode) return;
		onChange({ mode: nextMode, categoryId: '', subcategoryId: '', legacy: null });
	}

	function chooseCategory(id: string) {
		onChange({ mode, categoryId: id, subcategoryId: '', legacy: null });
	}

	function chooseSubcategory(id: string) {
		onChange({
			mode,
			categoryId,
			subcategoryId: id,
			legacy: legacyFor(categoryId)
		});
	}
</script>

<div class="space-y-4" data-testid="category-picker">
	<div>
		<p class="mb-2 text-sm font-medium">{purpose === 'offer' ? copy.offer : copy.needDone}</p>
		<p class="text-base-content/70 mb-2 text-sm">{copy.pickType}</p>
		<div class="flex flex-wrap gap-2">
			<button
				type="button"
				class="btn btn-sm {mode === 'local' ? 'btn-primary' : 'btn-outline'}"
				data-testid="category-mode-local"
				onclick={() => chooseMode('local')}
			>
				{copy.inPerson}
			</button>
			<button
				type="button"
				class="btn btn-sm {mode === 'remote' ? 'btn-primary' : 'btn-outline'}"
				data-testid="category-mode-remote"
				onclick={() => chooseMode('remote')}
			>
				{copy.remote}
			</button>
		</div>
	</div>

	{#if visible.length > 0}
		<div>
			<p class="text-base-content/70 mb-2 text-sm">{copy.pickCategory}</p>
			<ul class="grid grid-cols-2 gap-2 sm:grid-cols-3">
				{#each visible as category (category.id)}
					<li>
						<button
							type="button"
							class="flex h-full w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center {categoryId ===
							category.id
								? 'border-primary bg-primary/10'
								: 'border-base-300 bg-base-100'}"
							data-testid="category-choice-{category.id}"
							onclick={() => chooseCategory(category.id)}
						>
							<CategoryIcon name={category.icon} />
							<span class="text-sm leading-tight">{spanish ? category.nameEs : category.name}</span>
							<span class="text-base-content/60 text-xs">
								{priceLabel(category.fromPrice, category.priceUnit, spanish ? 'es' : 'en')}
							</span>
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}

	{#if selected}
		<div>
			<p class="text-base-content/70 mb-2 text-sm">{copy.pickSub}</p>
			<div class="flex flex-wrap gap-2">
				{#each selected.subcategories as subcategory (subcategory.id)}
					<button
						type="button"
						class="btn btn-sm {subcategoryId === subcategory.id ? 'btn-primary' : 'btn-outline'}"
						data-testid="subcategory-choice-{subcategory.id}"
						onclick={() => chooseSubcategory(subcategory.id)}
					>
						{spanish ? subcategory.nameEs : subcategory.name}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	{#if error}
		<span class="label-text-alt text-error">{error}</span>
	{/if}
</div>
