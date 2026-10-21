<script lang="ts">
	import { linear } from 'svelte/easing';
	import { SvelteDate } from 'svelte/reactivity';
	import { fly } from 'svelte/transition';
	import { taskStore as store } from '$lib/stores/task.store';
	import DateInput from '$lib/components/date/DateInput.svelte';
	import CategoryPicker from '$lib/components/categories/CategoryPicker.svelte';
	import SkillsMultiselect from '$lib/components/SkillsMultiselect.svelte';
	import { skillsForDropdown } from '$lib/utils/constants/skills';
	import { categoryById } from '$lib/search/taxonomy.js';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';
	import {
		normalizeDateToUTC,
		normalizeDeadlineToEndOfDay
	} from '$lib/utils/helpers/dateFormatter';
	let { errors, direction } = $props();

	type SkillsMultiselectHandle = { saveInputAsSkill: () => void };
	let skillsMultiselectRef = $state<SkillsMultiselectHandle | null>(null);
	const blankLocation = {
		displayName: '',
		longitude: null,
		latitude: null,
		zipCode: '',
		locationLoaded: false
	};
	const categoryMode = $derived.by(() => {
		const chosen = categoryById($store.task.searchCategory || '');
		if (chosen) return chosen.mode;
		if ($store.task.taskType === TaskTypeEnum.REMOTE) return 'remote' as const;
		if ($store.task.taskType === TaskTypeEnum.IN_PERSON) return 'local' as const;
		return '' as const;
	});

	const getDefaultDeadlineDate = () => {
		const futureDate = new SvelteDate();
		futureDate.setDate(futureDate.getDate() + 3);
		return futureDate;
	};

	const getDefaultDateRange = () => {
		const startDate = new SvelteDate();
		const endDate = new SvelteDate(startDate);
		endDate.setDate(endDate.getDate() + 3);
		return {
			start: startDate,
			end: endDate
		};
	};

	// Set default deadline to three days from today when component loads if no deadline is set or if deadline is in the past
	$effect(() => {
		if (!$store.task.dateRange) {
			// Check if deadline exists and is valid (not in the past)
			let shouldSetDefault = false;

			if (!$store.task.deadline) {
				// No deadline set, use default
				shouldSetDefault = true;
			} else {
				// Check if deadline is in the past
				try {
					const deadlineDate = new Date($store.task.deadline);
					const today = new Date();

					// Compare dates using date strings to avoid timezone issues
					const deadlineDateStr = deadlineDate.toISOString().split('T')[0];
					const todayDateStr = today.toISOString().split('T')[0];

					// If deadline is in the past, set default
					if (deadlineDateStr < todayDateStr) {
						shouldSetDefault = true;
					}
				} catch (error) {
					// If parsing fails, treat as invalid and set default
					console.error('Error parsing deadline date:', error);
					shouldSetDefault = true;
				}
			}

			if (shouldSetDefault) {
				const defaultDeadline = getDefaultDeadlineDate();
				store.updateTask({
					deadline: normalizeDeadlineToEndOfDay(defaultDeadline) || defaultDeadline.toISOString()
				});
			}
		}
	});

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
	<!-- Dummy Data Button for Testing -->

	<div class="w-full">
		<label for="title" class="label">
			<span class="label-text">{$t('task.job_title')}</span>
		</label>
		<input
			type="text"
			id="title"
			data-testid="task-title-input"
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
				type="button"
				class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
				data-testid="specific-date-btn"
				onclick={() => {
					const defaultDeadline = getDefaultDeadlineDate();

					store.updateTask({
						deadline: normalizeDeadlineToEndOfDay(defaultDeadline) || defaultDeadline.toISOString(),
						dateRange: undefined
					});
				}}
			>
				{$t('task.specific_date')}
			</button>
			<button
				type="button"
				class="btn {$store.task.dateRange ? 'btn-primary' : 'btn-outline'}"
				data-testid="flexible-date-btn"
				onclick={() => {
					const defaultRange = getDefaultDateRange();

					store.updateTask({
						deadline: undefined,
						dateRange: {
							start: defaultRange.start.toISOString(),
							end: defaultRange.end.toISOString()
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
										start: normalizeDateToUTC(date) || date.toISOString()
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
										end: normalizeDateToUTC(date) || date.toISOString()
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
				placeholderKey="task.deadline_placeholder"
				maxDate={undefined}
				minDate={new Date().toISOString()}
				onChange={(date: Date | null) =>
					store.updateTask({
						deadline: date ? normalizeDeadlineToEndOfDay(date) || date.toISOString() : undefined
					})}
			/>
			{#if errors.deadline}
				<span class="label-text-alt text-error -mt-4">{errors.deadline}</span>
			{/if}
		{/if}
	</div>

	<div data-testid="task-category-input">
		<CategoryPicker
			mode={categoryMode}
			categoryId={$store.task.searchCategory || ''}
			subcategoryId={$store.task.searchSubcategory || ''}
			error={errors.category}
			onChange={(next) => {
				store.updateTask({
					searchCategory: next.categoryId,
					searchSubcategory: next.subcategoryId,
					categories: next.legacy ? [next.legacy] : [],
					taskType: next.mode === 'remote' ? TaskTypeEnum.REMOTE : TaskTypeEnum.IN_PERSON,
					...(next.mode === 'remote'
						? { pickupLocation: blankLocation, dropOffLocation: blankLocation }
						: {})
				});
			}}
		/>
	</div>

	<div class="form-control w-full">
		<label class="label" for="skills">
			<span class="label-text">{$t('task.required_skills')}</span>
			<span class="label-text-alt">{$store.task?.skills?.length}/10</span>
		</label>
		<div data-testid="task-skills-input">
			<SkillsMultiselect
				bind:selectedSkills={$store.task.skills}
				maxSelections={10}
				placeholder="Add skills..."
				className="w-full"
				options={skillsForDropdown($store.task.searchCategory)}
				bind:this={skillsMultiselectRef}
			/>
		</div>
		<p class="text-base-content/60 mt-1 text-sm">{$t('task.skills_hint')}</p>
		{#if errors.skill}
			<span class="label-text-alt text-error">{errors.skill}</span>
		{/if}
	</div>
</div>
