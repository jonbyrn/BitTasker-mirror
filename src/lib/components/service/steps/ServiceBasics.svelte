<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { serviceStore as store } from '$lib/stores/service.store';
	import CategoryPicker from '$lib/components/categories/CategoryPicker.svelte';
	import CategorySuggestion from '$lib/components/categories/CategorySuggestion.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import { skillsForDropdown } from '$lib/utils/constants/skills';
	import { categoryById } from '$lib/search/taxonomy.js';
	import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';
	import { t } from 'svelte-i18n';

	let { errors, direction } = $props();

	type SkillsMultiselectHandle = { saveInputAsSkill: () => void };
	let skillsMultiselectRef = $state<SkillsMultiselectHandle | null>(null);
	const categoryMode = $derived.by(() => {
		const chosen = categoryById($store.service.searchCategory || '');
		if (chosen) return chosen.mode;
		const types = $store.service.serviceLocationTypes || [];
		if (types.includes(ServiceLocationTypeEnum.REMOTE) && types.length === 1)
			return 'remote' as const;
		if (
			types.includes(ServiceLocationTypeEnum.TASKEE_LOCATION) ||
			types.includes(ServiceLocationTypeEnum.TASKER_LOCATION)
		) {
			return 'local' as const;
		}
		return '' as const;
	});

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

	<CategorySuggestion
		title={$store.service.title || ''}
		description={$store.service.description || ''}
		categoryId={$store.service.searchCategory || ''}
		onAccept={(next) => {
			store.updateService({
				searchCategory: next.categoryId,
				searchSubcategory: next.subcategoryId,
				categories: next.legacy ? [next.legacy] : [],
				serviceLocationTypes:
					next.mode === 'remote'
						? [ServiceLocationTypeEnum.REMOTE]
						: next.mode === 'local'
							? [ServiceLocationTypeEnum.TASKEE_LOCATION]
							: []
			});
		}}
	/>

	<CategoryPicker
		purpose="offer"
		mode={categoryMode}
		categoryId={$store.service.searchCategory || ''}
		subcategoryId={$store.service.searchSubcategory || ''}
		error={errors.category}
		onChange={(next) => {
			store.updateService({
				searchCategory: next.categoryId,
				searchSubcategory: next.subcategoryId,
				categories: next.legacy ? [next.legacy] : [],
				serviceLocationTypes:
					next.mode === 'remote'
						? [ServiceLocationTypeEnum.REMOTE]
						: next.mode === 'local'
							? [ServiceLocationTypeEnum.TASKEE_LOCATION]
							: []
			});
		}}
	/>

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
			options={skillsForDropdown($store.service.searchCategory)}
			bind:this={skillsMultiselectRef}
		/>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
