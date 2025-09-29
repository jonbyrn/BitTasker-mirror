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

	// Use category IDs directly - CategoryMultiselect now handles translation internally
	let selectedCategoryIds = $state([] as string[]);
	let lastCategories = $state([]) as string[];
	let isUpdatingFromStore = $state(false);
	let skillsMultiselectRef: any = $state(null);

	// Set default deadline to today when component loads if no deadline is set
	$effect(() => {
		if (!$store.task.deadline && !$store.task.dateRange) {
			const today = new Date();
			store.updateTask({
				deadline: today.toISOString()
			});
		}
	});

	$effect(() => {
		try {
			// Sync with store categories
			const currentCategories = $store.task.categories;
			// Extract IDs from category objects
			const categoryIds = currentCategories.map((cat) =>
				typeof cat === 'string' ? cat : (cat as any).id
			);
			if (JSON.stringify(categoryIds) !== JSON.stringify(selectedCategoryIds)) {
				isUpdatingFromStore = true;
				selectedCategoryIds = [...categoryIds];
				isUpdatingFromStore = false;
			}
		} catch (error) {
			console.error('Error syncing category IDs:', error);
		}
	});

	// Handle category changes - now CategoryMultiselect returns IDs directly
	function handleCategoryChange(selectedItems: string[]) {
		try {
			// Prevent circular updates
			if (isUpdatingFromStore) return;
			
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
				.filter(Boolean);

			// Update the task with the full category objects
			store.updateTask({
				categories: categoryObjects as any
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

		<div class="flex flex-wrap gap-4">
			<button
				class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				onclick={() => {
					const today = new Date();

					store.updateTask({
						deadline: today.toISOString(),
						dateRange: undefined
					});
				}}
			>
				{$t('task.specific_date')}
			</button>
			<button
				class="btn {$store.task.dateRange ? 'btn-primary' : 'btn-outline'}"
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
			<div class="flex gap-4">
				<div class="flex-1">
					<DateInput
						bind:value={$store.task.dateRange.start}
						type="single"
						maxDate={undefined}
						labelKey="task.start_date"
						placeholderKey="task.start_date"
						minDate={new Date().toISOString()}
						onChange={(date: Date | null) => {
							if (date && $store.task.dateRange) {
								store.updateTask({
									dateRange: {
										...$store.task.dateRange,
										start: date.toISOString()
									}
								});
							}
						}}
					/>
				</div>
				<div class="flex-1">
					<DateInput
						bind:value={$store.task.dateRange.end}
						type="single"
						maxDate={undefined}
						labelKey="task.end_date"
						placeholderKey="task.end_date"
						minDate={$store.task.dateRange.start || new Date().toISOString()}
						onChange={(date: Date | null) => {
							if (date && $store.task.dateRange) {
								store.updateTask({
									dateRange: {
										...$store.task.dateRange,
										end: date.toISOString()
									}
								});
							}
						}}
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
				placeholderKey="task.deadline"
				maxDate={undefined}
				minDate={new Date().toISOString()}
				onChange={(date: Date | null) =>
					store.updateTask({ deadline: date ? date.toISOString() : undefined })}
			/>
			{#if errors.deadline}
				<span class="label-text-alt text-error -mt-4">{errors.deadline}</span>
			{/if}
		{/if}
	</div>

	<div class="w-full">
		<label for="category" class="label">{$t('task.category')}</label>
		<CategoryMultiselect
			bind:externalCategoryIds={selectedCategoryIds}
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
			bind:this={skillsMultiselectRef}
		/>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
