<script lang="ts">
	import { onMount } from 'svelte';
	import { AxiosError } from 'axios';
	import { createTask, createRecurringTask } from '$lib/nostr/task';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import TaskBasics from '$lib/components/task/steps/TaskBasics.svelte';
	import TaskLocation from '$lib/components/task/steps/TaskLocation.svelte';
	import TaskBudget from '$lib/components/task/steps/TaskBudget.svelte';
	import TaskRecurring from '$lib/components/task/steps/TaskRecurring.svelte';
	import TaskBoost from '$lib/components/task/steps/TaskBoost.svelte';
	import TaskReview from '$lib/components/task/steps/TaskReview.svelte';

	// Load the draft when the page is loaded
	onMount(() => {
		store.loadDraft();
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');

	function validateCurrentStep(): boolean {
		errors = {};
		switch ($store.currentStep) {
			case 'basics':
				if (!$store.task.title?.trim()) errors.title = 'Title is required';
				if ($store.task.dateRange) {
					if (!$store.task.dateRange.end && !$store.task.dateRange.start) {
						errors.deadline = 'You must select a start or an end date';
					}
					if (
						new Date($store.task.dateRange.end) < new Date() ||
						new Date($store.task.dateRange.start) < new Date() ||
						new Date($store.task.dateRange.end) < new Date($store.task.dateRange.start)
					) {
						errors.deadline = 'Date range must be in the future';
					}
				}
				if ($store.task.deadline && new Date($store.task.deadline) < new Date())
					errors.deadline = 'Deadline must be in the future';
				if ($store.task.categoryIds.length === 0)
					errors.category = 'At least one category is required';
				if ($store.task.skills.length === 0) errors.skill = 'At least one skill is required';
				break;
			case 'location':
				if ($store.isRemovals) {
					if (!$store.task.pickupLocation?.latitude || !$store.task.pickupLocation?.longitude) {
						errors.location = 'Pickup location is required for this task';
					}
					if (!$store.task.dropOffLocation?.latitude || !$store.task.dropOffLocation?.longitude) {
						errors.location = 'Drop-off location is required for this task';
					}
				}
				if (
					$store.task.taskType === TaskTypeEnum.IN_PERSON &&
					(!$store.task.pickupLocation?.latitude || !$store.task.pickupLocation?.longitude)
				) {
					errors.location = 'Location is required for this task';
				}
				break;
			case 'budget':
				if (!$store.task.budget.amount || $store.task.budget.amount <= 0) {
					errors.budget = 'Valid budget is required';
				}
				if (
					$store.task.budget.type === BudgetTypeEnum.HOURLY &&
					(!$store.task.budget.estimatedHours || $store.task.budget.estimatedHours <= 0)
				) {
					errors.estimatedHours = 'Estimated hours must be greater than 0';
				}
				if (!$store.task.description?.trim()) errors.description = 'Description is required';
				if ($store.task.description?.trim().length < 20)
					errors.description = 'Description must be at least 20 characters long';
				break;
			case 'taskboost':
				// Task boost step doesn't need validation as it's optional
				break;
			case 'review':
				// Review step doesn't need validation as it's just reviewing previous inputs
				break;
		}

		return Object.keys(errors).length === 0;
	}

	const handleNext = () => {
		if (validateCurrentStep()) {
			store.nextStep();
			store.saveDraft();
			direction = 'forward';
		}
	};

	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		isSubmitting = true;

		try {
			const task = {
				title: $store.task.title,
				description: $store.task.description,
				budget: $store.task.budget,
				deadline: $store.task.deadline,
				dateRange: $store.task.dateRange,
				taskType: $store.task.taskType,
				pickupLocation: $store.task.pickupLocation,
				dropOffLocation: $store.task.dropOffLocation,
				skills: $store.task.skills,
				attachments: $store.task.attachments,
				categoryIds: $store.task.categoryIds
			};

			if ($store.recurringTask.isRecurring) {
				// Create recurring task template
				await createRecurringTask(task, $store.recurringTask);
			} else {
				// Create a regular task
				await createTask(task);
			}

			isSubmitted = true;
			await store.clearDraft();

			setTimeout(() => {
				isSubmitted = false;
			}, 3000);
		} catch (error) {
			console.error('Error creating task:', error);
			if (error instanceof AxiosError && error.response && error.response?.data?.message) {
				const message = error.response.data.message;
				if (Array.isArray(message)) errors.general = message[0];
				else errors.general = message;
			} else if (error instanceof Error) errors.general = error.message;
			else errors.general = 'Failed to create task. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="card bg-base-100 mx-auto mt-2 max-w-3xl rounded-xl shadow-xl sm:mt-0">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-2xl">Create a New Task</h2>
			<div class="text-sm">
				Step {$STEPS.indexOf($store.currentStep) + 1} of {$STEPS.length}
			</div>
		</div>

		<!-- Recurring Task Toggle -->
		{#if $store.currentStep !== 'recurring'}
			<div class="form-control mt-2 mb-4 w-full max-w-xs">
				<label class="label cursor-pointer">
					<span class="label-text font-medium">Create as recurring task</span>
					<input
						type="checkbox"
						class="toggle toggle-primary"
						bind:checked={$store.recurringTask.isRecurring}
						onchange={(event) =>
							store.setupRecurringTask((event.target as HTMLInputElement).checked)}
					/>
				</label>
				{#if $store.recurringTask.isRecurring}
					<div class="text-info text-sm">This task will repeat based on the schedule you set</div>
				{/if}
			</div>
		{/if}

		<div class="space-y-6">
			<TaskBasics {errors} {direction} />
			<TaskLocation {errors} {direction} />
			<TaskBudget {errors} {direction} />
			<TaskRecurring {errors} {direction} />

			<!-- {#if $store.currentStep === 'basics'}
				<TaskBasics {errors} {direction} />
			{:else if $store.currentStep === 'location'}
				<TaskLocation {errors} {direction} />
			{:else if $store.currentStep === 'budget'}
				<TaskBudget {errors} {direction} />
			{:else if $store.currentStep === 'taskboost'}
				<TaskBoost {direction} />
			{:else if $store.currentStep === 'review'}
				<TaskReview {errors} {direction} />
			{:else if $store.currentStep === 'recurring'}
				<TaskRecurring {errors} {direction} />
			{/if} -->

			<!-- Control buttons -->
			<div class="mt-6 flex justify-between">
				{#if $store.currentStep !== 'basics'}
					<button
						class="btn"
						onclick={() => {
							store.previousStep();
							direction = 'backward';
						}}
					>
						Back
					</button>
				{:else}
					<div></div>
				{/if}

				{#if $STEPS.indexOf($store.currentStep) === $STEPS.length - 1}
					<button
						class="btn btn-primary {isSubmitting ? 'loading' : ''}"
						onclick={handleSubmit}
						disabled={isSubmitting}
					>
						{#if isSubmitting}
							<span></span>
						{:else if $store.recurringTask.isRecurring}
							Create Recurring Template
						{:else}
							Get Quotes
						{/if}
					</button>
				{:else}
					<button class="btn btn-primary" onclick={handleNext}>Next</button>
				{/if}

				<button class="btn btn-primary" onclick={handleSubmit}>Create</button>
			</div>
		</div>

		{#if isSubmitted}
			<div class="alert alert-success mt-6 shadow-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>Task created successfully!</span>
			</div>
		{/if}

		{#if errors.general}
			<div class="alert alert-error mt-6 shadow-lg">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-6 w-6 shrink-0 stroke-current"
					fill="none"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<span>{errors.general}</span>
			</div>
		{/if}
	</div>
</div>
