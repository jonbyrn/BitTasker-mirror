<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import DatePicker from '$lib/components/date/DatePicker.svelte';
	import CategoryMultiselect from '$lib/components/CategoryMultiselect.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import { TASK_CATEGORIES } from '$lib/utils/constants/categories';
	import { t } from 'svelte-i18n';
	let { errors, direction } = $props();

	// Convert category IDs to translated names for display
	let translatedCategories = $state([]);
	let lastCategories = $state([]);
	let lastLanguage = $state('');
	
	$effect(() => {
		try {
			// Only update if categories or language has changed to prevent excessive re-renders
			const currentLanguage = $t('categories.cleaning.name'); // Use any translation to get current language
			const currentCategories = $store.task.categories;
			
			if (JSON.stringify(currentCategories) !== JSON.stringify(lastCategories) || 
				currentLanguage !== lastLanguage) {
				lastCategories = [...currentCategories];
				lastLanguage = currentLanguage;
				
				translatedCategories = currentCategories.map(categoryId => {
					const category = TASK_CATEGORIES.find(cat => cat.id === categoryId);
					return category ? $t(`categories.${category.id}.name`) : categoryId;
				});
			}
		} catch (error) {
			console.error('Error updating translated categories:', error);
		}
	});

	// Handle category changes - convert translated names back to IDs
	function handleCategoryChange(translatedNames: string[]) {
		try {
			const categoryIds = translatedNames.map(translatedName => {
				const category = TASK_CATEGORIES.find(cat => 
					$t(`categories.${cat.id}.name`) === translatedName
				);
				return category ? category.id : translatedName;
			});
			store.updateTask({ categories: categoryIds });
		} catch (error) {
			console.error('Error handling category change:', error);
		}
	}
</script>

<div
	class="space-y-6"
	in:fly={{
		duration: 200,
		easing: linear,
		y: 0,
		x: direction === 'forward' ? 20 : -20
	}}
>
	<div class="w-full">
		<label for="title" class="label">
			<span class="label-text">{$t('task.what_needed')}</span>
		</label>
		<input
			type="text"
			id="title"
			value={$store.task.title}
			onchange={(e) => store.updateTask({ title: (e.target as HTMLInputElement).value })}
			class="input input-bordered w-full rounded-lg {errors.title ? 'input-error' : ''}"
			placeholder={$t('task.recurring_name_placeholder')}
			maxlength="200"
		/>
		{#if errors.title}
			<span class="label-text-alt text-error">{errors.title}</span>
		{/if}
	</div>

	<div class="space-y-4">
		<h4 class="font-semibold">{$t('task.when_needed')}</h4>

		<div class="flex gap-4 flex-wrap">
			<button
				class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				onclick={() => {
					const tomorrow = new Date();
					tomorrow.setDate(tomorrow.getDate() + 1);
					
					store.updateTask({
						deadline: tomorrow.toISOString(),
						dateRange: undefined
					});
				}}
			>
				{$t('task.specific_date')}
			</button>
			<button
				class="btn {!$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				onclick={() => {
					const today = new Date();
					const tomorrow = new Date();
					tomorrow.setDate(tomorrow.getDate() + 1);
					
					store.updateTask({
						deadline: undefined,
						dateRange: {
							start: today.toISOString(),
							end: tomorrow.toISOString()
						}
					});
				}}
			>
				{$t('task.flexible')}
			</button>
		</div>

		{#if $store.task.dateRange}
			<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<DatePicker
					label={$t('task.start_date')}
					value={$store.task.dateRange.start}
					minDate={new Date().toISOString()}
					onChange={(value: string) => {
						const start = value;
						const end = $store.task.dateRange?.end ?? new Date().toISOString();
						store.updateTask({
							dateRange: {
								start,
								end
							}
						});
					}}
				/>
				<DatePicker
					label={$t('task.end_date')}
					value={$store.task.dateRange.end}
					minDate={new Date().toISOString()}
					onChange={(value: string) => {
						const end = value;
						const start = $store.task.dateRange?.start ?? new Date().toISOString();
						store.updateTask({
							dateRange: {
								start,
								end
							}
						});
					}}
				/>
				{#if errors.deadline}
					<span class="label-text-alt text-error -mt-2">{errors.deadline}</span>
				{/if}
			</div>
		{:else}
			<div>
				<DatePicker
					label={$t('task.deadline')}
					minDate={new Date().toISOString()}
					value={$store.task.deadline}
					onChange={(value: string) => store.updateTask({ deadline: value })}
				/>
				{#if errors.deadline}
					<span class="label-text-alt text-error -mt-4">{errors.deadline}</span>
				{/if}
			</div>
		{/if}
	</div>

	<div class="w-full">
		<label for="category" class="label">{$t('task.category')}</label>
            <CategoryMultiselect
                    bind:selectedCategories={translatedCategories}
                    onChange={handleCategoryChange}
                    maxSelections={3}
                    placeholder="Add tags..."
                    className="w-full"
            />

		{#if errors.category}
			<span class="label-text-alt text-error">{errors.category}</span>
		{/if}
	</div>

	<div class="form-control w-full">
		<label class="label" for="skills">
			<span class="label-text">{$t('task.required_skills')}</span>
			<span class="label-text-alt">{$store.task?.skills?.length}/10</span>
		</label>
		<SkillsMultiselect
			bind:selectedSkills={$store.task.skills}
			maxSelections={10}
			placeholder="Add skills..."
			className="w-full"
		/>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
