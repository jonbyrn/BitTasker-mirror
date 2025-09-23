<script lang="ts">
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import DateInput from '$lib/components/date/DateInput.svelte';
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
					if (category) {
						const translatedName = $t(`categories.${category.id}.name`);
						// Fallback to category.name if translation key is returned (translation not loaded)
						return translatedName.startsWith('categories.') ? category.name : translatedName;
					}
					return categoryId;
				});
			}
		} catch (error) {
			console.error('Error updating translated categories:', error);
		}
	});

	// Handle category changes - convert translated names back to IDs
	function handleCategoryChange(selectedItems: any[]) {
		try {
			console.log('handleCategoryChange called with:', selectedItems);
			
			// Extract values from the selected items (they might be objects with value/label or just strings)
			const translatedNames = selectedItems.map(item => {
				if (typeof item === 'string') {
					return item;
				} else if (item && typeof item === 'object' && item.value) {
					return item.value;
				} else if (item && typeof item === 'object' && item.label) {
					return item.label;
				}
				return String(item);
			});
			
			console.log('Extracted translatedNames:', translatedNames);
			
			const categoryIds = translatedNames.map(translatedName => {
				// First try to find by translated name
				let category = TASK_CATEGORIES.find(cat => 
					$t(`categories.${cat.id}.name`) === translatedName
				);
				
				// If not found, try to find by original name (fallback case)
				if (!category) {
					category = TASK_CATEGORIES.find(cat => cat.name === translatedName);
				}
				
				const result = category ? category.id : translatedName;
				console.log(`Converting "${translatedName}" to "${result}"`);
				return result;
			});
			console.log('Final categoryIds:', categoryIds);
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
					console.log('Specific date button clicked');
					const tomorrow = new Date();
					tomorrow.setDate(tomorrow.getDate() + 1);
					
					store.updateTask({
						deadline: tomorrow.toISOString(),
						dateRange: undefined
					});
					console.log('Updated task:', $store.task);
				}}
			>
				{$t('task.specific_date')}
			</button>
			<button
				class="btn {$store.task.dateRange ? 'btn-primary' : 'btn-outline'}"
				onclick={() => {
					console.log('Flexible date button clicked');
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
					console.log('Updated task:', $store.task);
				}}
			>
				{$t('task.flexible')}
			</button>
		</div>

		{#if $store.task.dateRange}
			<div class="flex gap-4">
				<div class="flex-1">
					<DateInput
						bind:value={$store.task.dateRange.start}
						type="single"
						labelKey="task.start_date"
						placeholderKey="task.start_date"
						minDate={new Date().toISOString()}
						onChange={(date) => store.updateTask({ dateRange: { ...$store.task.dateRange, start: date } })}
					/>
				</div>
				<div class="flex-1">
					<DateInput
						bind:value={$store.task.dateRange.end}
						type="single"
						labelKey="task.end_date"
						placeholderKey="task.end_date"
						minDate={$store.task.dateRange.start || new Date().toISOString()}
						onChange={(date) => store.updateTask({ dateRange: { ...$store.task.dateRange, end: date } })}
					/>
				</div>
			</div>
			{#if errors.deadline}
				<span class="label-text-alt text-error -mt-2">{errors.deadline}</span>
			{/if}
		{:else}
			<DateInput
				bind:value={$store.task.deadline}
				type="single"
				labelKey="task.deadline"
				placeholderKey="task.deadline"
				minDate={new Date().toISOString()}
				onChange={(date) => store.updateTask({ deadline: date })}
			/>
			{#if errors.deadline}
				<span class="label-text-alt text-error -mt-4">{errors.deadline}</span>
			{/if}
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
