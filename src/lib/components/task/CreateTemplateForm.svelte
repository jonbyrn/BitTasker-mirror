<script lang="ts">
	import type { TaskTemplate } from '$lib/types/recurring-tasks';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import RecurrencePatternSelector from '$lib/components/task/RecurrencePattern.svelte';
	import {
		RECURRINGFREQUENCYENUM,
		TIMINGTYPE,
		LOCATIONTYPE,
		TIMINGTIMEOFDAY,
		BUDGETTYPE,
		TASKSTATUS,
		TASKCATEGORY,
		TASKSKILL,
		BUDGETCURRENCY
	} from '$lib/utils/enums/recurringTask.enums';

	let { onCancel, onCreated, existingTaskId } = $props<{
		onCancel: () => void;
		onCreated: (template: TaskTemplate) => void;
		existingTaskId: string | undefined;
	}>();

	// State
	const formData = $state({
		title: '',
		description: '',

		// Schedule configuration
		recurrencePattern: {
			frequency: RECURRINGFREQUENCYENUM.WEEKLY,
			interval: 1,
			daysOfWeek: [1], // Monday by default
			dayOfMonth: 1,
			endDate: '',
			maxOccurrences: 12
		},

		// Task details
		timing: {
			type: TIMINGTYPE.FLEXIBLE,
			timeOfDay: TIMINGTIMEOFDAY.MORNING,
			dueDate: null
		},

		location: {
			type: LOCATIONTYPE.ONLINE,
			isRemovalsTask: false,
			pickup: {
				zipCode: null
			},
			dropoff: {
				zipCode: null
			}
		},

		details: {
			summary: '',
			category: TASKCATEGORY.OTHER,
			requiredSkills: [] as TASKSKILL[],
			attachments: {
				images: [] as string[]
			}
		},

		budget: {
			amount: 0,
			currency: BUDGETCURRENCY.BTC,
			type: BUDGETTYPE.FIXED,
			estimatedHours: 1
		}
	});

	let isSubmitting = $state(false);
	let error = $state<string | null>(null);
	let generationPreview = $state<string[]>([]);
	let currentStep = $state(1);
	const totalSteps = 4;

	// Derived values for form validation
	const isStep1Valid = $derived(() => 
		formData.title.trim().length > 0 && formData.description.trim().length > 0
	);

	const isStep2Valid = $derived(() => 
		formData.location.type === LOCATIONTYPE.ONLINE ||
			(formData.location.pickup?.zipCode &&
				(!formData.location.isRemovalsTask || formData.location.dropoff?.zipCode))
	);

	const isStep3Valid = $derived(() => 
		formData.details.summary.trim().length > 0 && formData.details.requiredSkills.length > 0
	);

	const isStep4Valid = $derived(() => 
		formData.budget.amount > 0 &&
			(formData.budget.type !== BUDGETTYPE.HOURLY ||
				(formData.budget.estimatedHours && formData.budget.estimatedHours > 0))
	);

	// Initialize form with existing task data if provided
	async function initFromExistingTask() {
		if (existingTaskId) {
			try {
				// This would need to be implemented in the task service
				// const taskData = await taskService.getTaskById(existingTaskId);
				// Pre-fill form with task data...
			} catch (err) {
				console.error('Error loading task data:', err);
				error = 'Failed to load task data';
			}
		}
	}

	// Update recurrence pattern
	function updateRecurrencePattern(pattern: TaskTemplate['recurrencePattern']) {
		formData.recurrencePattern = pattern;
		generatePreview();
	}

	// Generate preview of upcoming task dates
	async function generatePreview() {
		try {
			generationPreview = await recurringTasksService.getGenerationPreview({
				...formData
			});
		} catch (err) {
			console.error('Error generating preview:', err);
		}
	}

	// Handle form submission
	async function handleSubmit(event: Event) {
		event.preventDefault();
		isSubmitting = true;
		error = null;

		try {
			let result;

			if (existingTaskId) {
				// Create from existing task
				result = await recurringTasksService.createTemplateFromTask(
					existingTaskId,
					formData.recurrencePattern
				);
			} else {
				// Create new template
				result = await recurringTasksService.createTemplate({
					title: formData.title,
					description: formData.description,
					recurrencePattern: formData.recurrencePattern,
					timing: formData.timing,
					location: formData.location,
					details: formData.details,
					budget: formData.budget
				});
			}

			onCreated(result);
		} catch (err) {
			console.error('Error creating template:', err);
			error = 'Failed to create template. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}

	// Navigation between steps
	function nextStep() {
		if (currentStep < totalSteps) {
			currentStep++;
			if (currentStep === totalSteps) {
				// Generate preview when reaching the final step
				generatePreview();
			}
		}
	}

	function prevStep() {
		if (currentStep > 1) {
			currentStep--;
		}
	}

	// Initialize form if needed
	$effect(() => {
		if (existingTaskId) {
			initFromExistingTask();
		}
	});
</script>

<div class="w-full">
	<!-- Form Steps Indicator -->
	<div class="steps steps-horizontal mb-6 w-full">
		<button class="step {currentStep >= 1 ? 'step-primary' : ''}" onclick={() => (currentStep = 1)}>
			Basic Info
		</button>
		<button
			class="step {currentStep >= 2 ? 'step-primary' : ''}"
			onclick={() => (!!isStep1Valid) && (currentStep = 2)}
		>
			Location
		</button>
		<button
			class="step {currentStep >= 3 ? 'step-primary' : ''}"
			onclick={() => (!!isStep1Valid) && (!!isStep2Valid) && (currentStep = 3)}
		>
			Details
		</button>
		<button
			class="step {currentStep >= 4 ? 'step-primary' : ''}"
			onclick={() => (!!isStep1Valid) && (!!isStep2Valid) && (!!isStep3Valid) && (currentStep = 4)}
		>
			Schedule & Budget
		</button>
	</div>

	<!-- Error Message -->
	{#if error}
		<div class="alert alert-error mb-4">
			<span>{error}</span>
		</div>
	{/if}

	<form onsubmit={handleSubmit} class="space-y-4">
		<!-- Step 1: Basic Information -->
		{#if currentStep === 1}
			<div>
				<h4 class="mb-4 font-medium">Step 1: Basic Information</h4>

				<div class="form-control mb-4 w-full">
					<label class="label" for="title">
						<span class="label-text">Task Title</span>
					</label>
					<input
						type="text"
						class="input input-bordered w-full"
						bind:value={formData.title}
						placeholder="e.g., Weekly House Cleaning"
						required
					/>
				</div>

				<div class="form-control mb-4 w-full">
					<label class="label" for="description">
						<span class="label-text">Task Description</span>
					</label>
					<textarea
						class="textarea textarea-bordered h-24"
						bind:value={formData.description}
						placeholder="Describe what needs to be done"
						required
					></textarea>
				</div>

				<div class="form-control mb-4 w-full">
					<label class="label" for="timing-type">
						<span class="label-text">Timing Type</span>
					</label>
					<select class="select select-bordered w-full" bind:value={formData.timing.type}>
						<option value={TIMINGTYPE.FLEXIBLE}>Flexible Timing</option>
						<option value={TIMINGTYPE.ON_DATE}>On Specific Date</option>
						<option value={TIMINGTYPE.BEFORE_DATE}>Before Specific Date</option>
					</select>
				</div>

				<div class="form-control mb-4 w-full">
					<label class="label" for="time-of-day">
						<span class="label-text">Time of Day Preference</span>
					</label>
					<select class="select select-bordered w-full" bind:value={formData.timing.timeOfDay}>
						<option value={TIMINGTIMEOFDAY.MORNING}>Morning</option>
						<option value={TIMINGTIMEOFDAY.MIDDAY}>Midday</option>
						<option value={TIMINGTIMEOFDAY.AFTERNOON}>Afternoon</option>
						<option value={TIMINGTIMEOFDAY.EVENING}>Evening</option>
					</select>
				</div>
			</div>

			<!-- Step 2: Location -->
		{:else if currentStep === 2}
			<div>
				<h4 class="mb-4 font-medium">Step 2: Location</h4>

				<div class="form-control mb-4 w-full">
					<label class="label" for="location-type">
						<span class="label-text">Task Type</span>
					</label>
					<select class="select select-bordered w-full" bind:value={formData.location.type}>
						<option value={LOCATIONTYPE.ONLINE}>Online/Remote</option>
						<option value={LOCATIONTYPE.IN_PERSON}>In-Person</option>
					</select>
				</div>

				{#if formData.location.type === LOCATIONTYPE.IN_PERSON}
					<div class="form-control mb-4">
						<label class="label cursor-pointer">
							<span class="label-text">This is a removals/delivery task</span>
							<input
								type="checkbox"
								class="toggle"
								bind:checked={formData.location.isRemovalsTask}
							/>
						</label>
					</div>

					<div class="form-control mb-4 w-full">
						<label class="label" for="pickup-zip-code">
							<span class="label-text">Location ZIP/Postal Code</span>
						</label>
						<input
							type="text"
							class="input input-bordered w-full"
							bind:value={formData.location.pickup.zipCode}
							placeholder="e.g., 90210"
						/>
					</div>

					{#if formData.location.isRemovalsTask}
						<div class="form-control mb-4 w-full">
							<label class="label" for="dropoff-zip-code">
								<span class="label-text">Dropoff ZIP/Postal Code</span>
							</label>
							<input
								type="text"
								class="input input-bordered w-full"
								bind:value={formData.location.dropoff.zipCode}
								placeholder="e.g., 90210"
							/>
						</div>
					{/if}
				{/if}
			</div>

			<!-- Step 3: Task Details -->
		{:else if currentStep === 3}
			<div>
				<h4 class="mb-4 font-medium">Step 3: Task Details</h4>

				<div class="form-control mb-4 w-full">
					<label class="label" for="task-summary">
						<span class="label-text">Task Summary</span>
					</label>
					<textarea
						class="textarea textarea-bordered h-24"
						bind:value={formData.details.summary}
						placeholder="Brief summary of the task requirements"
						required
					></textarea>
				</div>

				<div class="form-control mb-4 w-full">
					<label class="label" for="task-category">
						<span class="label-text">Task Category</span>
					</label>
					<select class="select select-bordered w-full" bind:value={formData.details.category}>
						{#each Object.values(TASKCATEGORY) as category}
							<option value={category}>{category.replace('_', ' ')}</option>
						{/each}
					</select>
				</div>

				<div class="form-control mb-4 w-full">
					<label class="label" for="required-skills">
						<span class="label-text">Required Skills (select at least one)</span>
					</label>
					<div class="grid grid-cols-2 gap-2">
						{#each Object.values(TASKSKILL) as skill}
							<label class="label cursor-pointer justify-start gap-2">
								<input
									type="checkbox"
									class="checkbox checkbox-sm"
									value={skill}
									checked={formData.details.requiredSkills.includes(skill)}
									onchange={(e) => {
										if ((e.target as HTMLInputElement).checked) {
											formData.details.requiredSkills = [...formData.details.requiredSkills, skill];
										} else {
											formData.details.requiredSkills = formData.details.requiredSkills.filter(
												(s) => s !== skill
											);
										}
									}}
								/>
								<span class="label-text">{skill.replace('_', ' ')}</span>
							</label>
						{/each}
					</div>
				</div>

				<!-- Image Attachments would go here -->
			</div>

			<!-- Step 4: Schedule & Budget -->
		{:else if currentStep === 4}
			<div>
				<h4 class="mb-4 font-medium">Step 4: Schedule & Budget</h4>

				<!-- Recurrence Pattern -->
				<div class="mb-6">
					<h5 class="mb-2 text-sm font-medium">Recurrence Pattern</h5>
					<RecurrencePatternSelector
						pattern={formData.recurrencePattern}
						onUpdate={updateRecurrencePattern}
					/>
				</div>

				<div class="divider"></div>

				<!-- Budget -->
				<div class="my-4">
					<h5 class="mb-2 text-sm font-medium">Budget</h5>

					<div class="form-control mb-4 w-full">
						<label class="label" for="budget-type">
							<span class="label-text">Budget Type</span>
						</label>
						<select class="select select-bordered w-full" bind:value={formData.budget.type}>
							<option value={BUDGETTYPE.FIXED}>Fixed Price</option>
							<option value={BUDGETTYPE.HOURLY}>Hourly Rate</option>
						</select>
					</div>

					<div class="form-control mb-4 w-full">
						<label class="label" for="budget-amount">
							<span class="label-text">
								{formData.budget.type === BUDGETTYPE.FIXED ? 'Total Budget' : 'Hourly Rate'}
							</span>
						</label>
						<div class="flex gap-2">
							<input
								type="number"
								class="input input-bordered w-full"
								bind:value={formData.budget.amount}
								min="0"
								step="0.0001"
								required
							/>
							<select class="select select-bordered" bind:value={formData.budget.currency}>
								{#each Object.values(BUDGETCURRENCY) as currency}
									<option value={currency}>{currency}</option>
								{/each}
							</select>
						</div>
					</div>

					{#if formData.budget.type === BUDGETTYPE.HOURLY}
						<div class="form-control mb-4 w-full">
							<label class="label" for="estimated-hours">
								<span class="label-text">Estimated Hours</span>
							</label>
							<input
								type="number"
								class="input input-bordered w-full"
								bind:value={formData.budget.estimatedHours}
								min="0.5"
								step="0.5"
								required
							/>
						</div>
					{/if}
				</div>

				<!-- Generation Preview -->
				{#if generationPreview.length > 0}
					<div class="my-6">
						<h5 class="mb-2 text-sm font-medium">Task Generation Preview</h5>
						<div class="bg-base-200 rounded-box p-3">
							<p class="mb-2 text-sm">
								Based on your settings, tasks will be generated on these dates:
							</p>
							<ul class="max-h-32 list-disc overflow-y-auto pl-5 text-sm">
								{#each generationPreview.slice(0, 10) as date}
									<li>{new Date(date).toLocaleDateString()}</li>
								{/each}
								{#if generationPreview.length > 10}
									<li class="font-italic">...and {generationPreview.length - 10} more</li>
								{/if}
							</ul>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Navigation Buttons -->
		<div class="mt-6 flex justify-between">
			{#if currentStep === 1}
				<button type="button" class="btn" onclick={onCancel}> Cancel </button>
			{:else}
				<button type="button" class="btn" onclick={prevStep}> Back </button>
			{/if}

			{#if currentStep < totalSteps}
				<button
					type="button"
					class="btn btn-primary"
					onclick={nextStep}
					disabled={(currentStep === 1 && !isStep1Valid) ||
						(currentStep === 2 && !isStep2Valid) ||
						(currentStep === 3 && !isStep3Valid)}
				>
					Next
				</button>
			{:else}
				<button type="submit" class="btn btn-primary" disabled={isSubmitting || !isStep4Valid}>
					{isSubmitting ? 'Creating...' : 'Create Template'}
				</button>
			{/if}
		</div>
	</form>
</div>
