<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { SEARCH_CATEGORIES } from '$lib/search/taxonomy.js';
	import { TASK_CATEGORIES, type Category } from '$lib/utils/constants/categories';

	let {
		categoryId = '',
		subcategoryId = '',
		onChange
	}: {
		categoryId?: string;
		subcategoryId?: string;
		onChange: (next: {
			categoryId: string;
			subcategoryId: string;
			legacy: Category | null;
		}) => void;
	} = $props();

	let spanish = $derived(($locale || 'en').startsWith('es'));
	let selected = $derived(SEARCH_CATEGORIES.find((category) => category.id === categoryId));

	function legacyFor(id: string): Category | null {
		const category = SEARCH_CATEGORIES.find((item) => item.id === id);
		const legacyId = category?.legacyCategoryIds[0];
		return TASK_CATEGORIES.find((item) => item.id === legacyId) ?? null;
	}

	function chooseCategory(event: Event) {
		const id = (event.target as HTMLSelectElement).value;
		const category = SEARCH_CATEGORIES.find((item) => item.id === id);
		onChange({
			categoryId: id,
			subcategoryId: category?.subcategories[0]?.id || '',
			legacy: legacyFor(id)
		});
	}

	function chooseSubcategory(event: Event) {
		const id = (event.target as HTMLSelectElement).value;
		onChange({ categoryId, subcategoryId: id, legacy: legacyFor(categoryId) });
	}
</script>

<div class="grid gap-3 sm:grid-cols-2">
	<label class="form-control w-full">
		<span class="label-text">{spanish ? 'Categoría' : 'Category'}</span>
		<select
			class="select select-bordered w-full"
			data-testid="search-category"
			value={categoryId}
			onchange={chooseCategory}
		>
			<option value="">{spanish ? 'Elige una categoría' : 'Choose a category'}</option>
			{#each SEARCH_CATEGORIES as category (category.id)}
				<option value={category.id}>{spanish ? category.nameEs : category.name}</option>
			{/each}
		</select>
	</label>
	<label class="form-control w-full">
		<span class="label-text">{spanish ? 'Subcategoría' : 'Subcategory'}</span>
		<select
			class="select select-bordered w-full"
			data-testid="search-subcategory"
			value={subcategoryId}
			disabled={!selected}
			onchange={chooseSubcategory}
		>
			<option value="">{spanish ? 'Elige una subcategoría' : 'Choose a subcategory'}</option>
			{#each selected?.subcategories || [] as subcategory (subcategory.id)}
				<option value={subcategory.id}>{spanish ? subcategory.nameEs : subcategory.name}</option>
			{/each}
		</select>
	</label>
</div>
