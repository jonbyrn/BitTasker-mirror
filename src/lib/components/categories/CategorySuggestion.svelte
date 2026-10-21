<script lang="ts">
	import { locale } from 'svelte-i18n';
	import { TASK_CATEGORIES, type Category } from '$lib/utils/constants/categories';
	import { categoryById, categoryCopy, labelFor, suggestCategory } from '$lib/search/taxonomy.js';

	let {
		title = '',
		description = '',
		categoryId = '',
		onAccept
	}: {
		title?: string;
		description?: string;
		categoryId?: string;
		onAccept: (next: {
			mode: 'local' | 'remote' | '';
			categoryId: string;
			subcategoryId: string;
			legacy: Category | null;
		}) => void;
	} = $props();

	const spanish = $derived(String($locale || 'en').startsWith('es'));
	const copy = $derived(categoryCopy(spanish ? 'es' : 'en'));
	const suggestion = $derived(suggestCategory({ title, description }));
	const show = $derived(
		title.trim().length >= 3 &&
			suggestion.source !== 'fallback' &&
			suggestion.category !== categoryId
	);

	function accept() {
		const category = categoryById(suggestion.category);
		const legacyId = category?.legacyCategoryIds[0] || category?.hintLegacyIds?.[0];
		const legacy = TASK_CATEGORIES.find((item) => item.id === legacyId) ?? null;
		onAccept({
			mode: category?.mode || '',
			categoryId: suggestion.category,
			subcategoryId: suggestion.subcategory,
			legacy
		});
	}
</script>

{#if show}
	<div
		class="border-primary/40 bg-primary/5 flex flex-col gap-2 rounded-xl border px-3 py-3 text-sm"
		data-testid="category-suggestion"
	>
		<p>
			{copy.suggestedCategory}:
			<strong>{labelFor(suggestion.category, spanish ? 'es' : 'en')}</strong>
		</p>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="btn btn-primary btn-sm"
				data-testid="accept-category"
				onclick={accept}
			>
				{copy.acceptSuggestion}
			</button>
			<span class="text-base-content/70">{copy.changeSuggestion}</span>
		</div>
	</div>
{/if}
