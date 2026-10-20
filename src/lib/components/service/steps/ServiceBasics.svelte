<script lang="ts">
	import { onMount } from 'svelte';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import TagInput from '$lib/components/search/TagInput.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import type { Category } from '$lib/types/task.d';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	// Use category IDs directly - CategoryMultiselect now handles translation internally
	let selectedCategoryIds = $state([] as string[]);
	type SkillsMultiselectHandle = { saveInputAsSkill: () => void };
	let skillsMultiselectRef = $state<SkillsMultiselectHandle | null>(null);

	// Initialize selectedCategoryIds from store once on mount; CategoryMultiselect onChange updates store
	onMount(() => {
		try {
			const currentCategories = $store.service.categories || [];
			selectedCategoryIds = currentCategories.map((cat) =>
				typeof cat === 'string' ? cat : (cat as { id: string }).id
			);
		} catch (error) {
			console.error('Error initializing category IDs:', error);
		}
	});

	// Handle category changes via CategoryMultiselect onChange callback
	function handleCategoryChange(selectedItems: string[]) {
		try {
			// Convert IDs to full category objects
			const categoryObjects = selectedItems
				.map((categoryId) => {
					const category = TASK_CATEGORIES.find((cat) => cat.id === categoryId);
					if (category) {
						return {
							id: category.id,
							slug: category.slug,
							name: category.name,
							description: category.description
						};
					}
					return null;
				})
				.filter((category): category is Category => category !== null);

			// Update the service with the full category objects
			store.updateService({
				categories: categoryObjects
			});
		} catch (error) {
			console.error('Error handling category change:', error);
		}
	}

	// Function to save current input as a skill (called from parent component)
	export function saveCurrentSkillInput() {
		if (skillsMultiselectRef) {
			skillsMultiselectRef.saveInputAsSkill();
		}
	}
</script>

<div
	class="min-w-0 space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label for="title" class="label">
			<span class="label-text break-words"
				>{$t('dashboard.services.create.basics.title_label')}</span
			>
		</label>
		<input
			type="text"
			id="title"
			value={$store.service.title || ''}
			oninput={(e) => store.updateService({ title: (e.target as HTMLInputElement).value })}
			class="input input-bordered w-full rounded-lg {errors.title ? 'input-error' : ''}"
			placeholder={$t('dashboard.services.create.basics.title_placeholder')}
			maxlength="200"
		/>
		{#if errors.title}
			<span class="label-text-alt text-error">{errors.title}</span>
		{/if}
	</div>

	<div class="w-full">
		<label for="description" class="label">
			<span class="label-text break-words"
				>{$t('dashboard.services.create.basics.description_label')}</span
			>
		</label>
		<textarea
			id="description"
			value={$store.service.description || ''}
			oninput={(e) => store.updateService({ description: (e.target as HTMLTextAreaElement).value })}
			class="textarea textarea-bordered w-full rounded-lg {errors.description
				? 'textarea-error'
				: ''}"
			placeholder={$t('dashboard.services.create.basics.description_placeholder')}
			rows="6"
			maxlength="5000"
		></textarea>
		<div class="label">
			<span class="label-text-alt">
				{($store.service.description || '').length}/5000
			</span>
		</div>
		{#if errors.description}
			<span class="label-text-alt text-error">{errors.description}</span>
		{/if}
	</div>

	<div class="w-full">
		<label for="category" class="label">
			<span class="label-text break-words"
				>{$t('dashboard.services.create.basics.category_label')}</span
			>
		</label>
		<CategoryMultiselect
			bind:externalCategoryIds={selectedCategoryIds}
			onChange={handleCategoryChange}
			maxSelections={3}
			placeholder={$t('dashboard.services.create.basics.category_placeholder')}
			className="w-full"
		/>

		{#if errors.category}
			<span class="label-text-alt text-error">{errors.category}</span>
		{/if}
	</div>

	<div class="form-control w-full">
		<label class="label" for="skills">
			<span class="label-text break-words"
				>{$t('dashboard.services.create.basics.skills_label')}</span
			>
		</label>
		<SkillsMultiselect
			bind:selectedSkills={$store.service.skills}
			maxSelections={10}
			placeholder={$t('dashboard.services.create.basics.skills_placeholder')}
			className="w-full"
			bind:this={skillsMultiselectRef}
		/>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>

	<TagInput
		tags={$store.service.tags ?? []}
		onchange={(tags) => store.updateService({ tags })}
		label="Tags"
	/>
</div>
