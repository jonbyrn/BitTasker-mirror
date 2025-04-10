<script lang="ts">
	import type { RecurrencePattern } from '$lib/types/recurring-tasks';
	import { onMount } from 'svelte';
	import { AxiosError } from 'axios';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import {
		RECURRINGFREQUENCYENUM,
		BUDGETCURRENCY,
		BUDGETTYPE,
		TIMINGTYPE,
		TIMINGTIMEOFDAY,
		LOCATIONTYPE,
		TASKCATEGORY,
		TASKSKILL
	} from '$lib/utils/enums/recurringTask.enums';
	import taskService from '$lib/api/services/task.service';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import Uploader from '$lib/components/Uploader.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import DatePicker from '$lib/components/Date/DatePicker.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import RecurrencePatternSelector from '$lib/components/task/RecurrencePatternSelector.svelte';

	onMount(() => {
		store.loadDraft();
	});

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);
	let isRecurringTask = $state(false);
	let generationPreview = $state<string[]>([]);

	// Recurring task data structure
	const recurringTaskData = $state({
		recurrencePattern: {
			frequency: RECURRINGFREQUENCYENUM.WEEKLY,
			interval: 1,
			daysOfWeek: [1], // Monday by default
			dayOfMonth: 1,
			endDate: '',
			maxOccurrences: 12
		},
		timing: {
			timeOfDay: TIMINGTIMEOFDAY.MORNING
		},
		details: {
			category: TASKCATEGORY.OTHER
		}
	});

	// Generate preview of upcoming task dates
	async function generatePreview() {
		if (!$store.task.title) return;

		try {
			// Convert skill IDs to TASKSKILL enum values
			const skillEnums = ($store.task.skillIds || []).map((id) => {
				// This is a simplification - you'd need a proper mapping from skill IDs to enum values
				return Object.values(TASKSKILL)[0];
			});

			const preview = {
				title: $store.task.title || 'Untitled Task',
				description: $store.task.description || '',
				recurrencePattern: recurringTaskData.recurrencePattern,
				timing: {
					type: $store.task.deadline ? TIMINGTYPE.BEFORE_DATE : TIMINGTYPE.FLEXIBLE,
					timeOfDay: recurringTaskData.timing.timeOfDay,
					dueDate: $store.task.deadline || null
				},
				location: {
					type:
						$store.task.taskType === TaskTypeEnum.IN_PERSON
							? LOCATIONTYPE.IN_PERSON
							: LOCATIONTYPE.ONLINE,
					isRemovalsTask: $store.isRemovals,
					pickup: {
						zipCode: $store.task.pickupLocation?.zipCode || null
					},
					dropoff: {
						zipCode: $store.task.dropOffLocation?.zipCode || null
					}
				},
				details: {
					summary: $store.task.description || '',
					category: recurringTaskData.details.category,
					requiredSkills: skillEnums,
					attachments: {
						images: []
					}
				},
				budget: {
					amount: $store.task.budget || 0,
					currency: BUDGETCURRENCY.BTC,
					type:
						$store.task.budgetType === BudgetTypeEnum.FIXED ? BUDGETTYPE.FIXED : BUDGETTYPE.HOURLY,
					estimatedHours: $store.task.estimatedHours || 1
				}
			};
			console.log(preview);
		} catch (err) {
			console.error('Error generating preview:', err);
		}
	}

	// Update recurrence pattern
	function updateRecurrencePattern(pattern: RecurrencePattern) {
		// Ensure all fields have proper default values to satisfy the type
		recurringTaskData.recurrencePattern = {
			frequency: pattern.frequency || RECURRINGFREQUENCYENUM.WEEKLY,
			interval: pattern.interval || 1,
			daysOfWeek: pattern.daysOfWeek || [1],
			dayOfMonth: pattern.dayOfMonth || 1,
			endDate: pattern.endDate || '',
			maxOccurrences: pattern.maxOccurrences || 12
		};
		generatePreview();
	}

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
				if ($store.task.skillIds.length === 0) errors.skill = 'At least one skill is required';
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
				if (!$store.task.budget || $store.task.budget <= 0) {
					errors.budget = 'Valid budget is required';
				}
				if (
					$store.task.budgetType === 'HOURLY' &&
					(!$store.task.estimatedHours || $store.task.estimatedHours <= 0)
				) {
					errors.estimatedHours = 'Estimated hours must be greater than 0';
				}
				if (!$store.task.description?.trim()) errors.description = 'Description is required';
				if ($store.task.description?.trim().length < 20)
					errors.description = 'Description must be at least 20 characters long';
				break;
		}

		return Object.keys(errors).length === 0;
	}

	const handleFileUpload = async (files: File[]) => {
		if (files) {
			const uploadedFiles = await uploadService.uploadMultipleFiles(files);
			console.log(uploadedFiles);
		}
	};

	let direction: 'forward' | 'backward' = $state('forward');
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
			if (isRecurringTask) {
				// Convert skill IDs to TASKSKILL enum values for recurring task
				const skillEnums = ($store.task.skillIds || []).map((id) => {
					// This is a simplification - you'd need a proper mapping from skill IDs to enum values
					return Object.values(TASKSKILL)[0];
				});

				// Create a recurring task template
				const template = await recurringTasksService.createTemplate({
					title: $store.task.title,
					description: $store.task.description,
					recurrencePattern: recurringTaskData.recurrencePattern,
					timing: {
						type: $store.task.deadline ? TIMINGTYPE.BEFORE_DATE : TIMINGTYPE.FLEXIBLE,
						timeOfDay: recurringTaskData.timing.timeOfDay,
						dueDate: $store.task.deadline || null
					},
					location: {
						type:
							$store.task.taskType === TaskTypeEnum.IN_PERSON
								? LOCATIONTYPE.IN_PERSON
								: LOCATIONTYPE.ONLINE,
						isRemovalsTask: $store.isRemovals,
						pickup: {
							zipCode: $store.task.pickupLocation?.zipCode || null
						},
						dropoff: {
							zipCode: $store.task.dropOffLocation?.zipCode || null
						}
					},
					details: {
						summary: $store.task.description,
						category: recurringTaskData.details.category,
						requiredSkills: skillEnums,
						attachments: {
							images: []
						}
					},
					budget: {
						amount: $store.task.budget,
						currency: BUDGETCURRENCY.BTC,
						type:
							$store.task.budgetType === BudgetTypeEnum.FIXED
								? BUDGETTYPE.FIXED
								: BUDGETTYPE.HOURLY,
						estimatedHours: $store.task.estimatedHours || 1
					}
				});

				console.log('Created recurring task template:', template);
			} else {
				// Create a regular task
				await taskService.createTask($store.task);
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

<div class="card bg-base-100 mx-auto max-w-3xl shadow-xl">
	<div class="card-body">
		<div class="flex items-center justify-between">
			<h2 class="card-title text-2xl">Create a New Task</h2>
			<div class="text-sm">Step {STEPS.indexOf($store.currentStep) + 1} of {STEPS.length}</div>
		</div>

		<!-- Recurring Task Toggle -->
		<div class="form-control mt-2 mb-4 w-full max-w-xs">
			<label class="label cursor-pointer">
				<span class="label-text font-medium">Create as recurring task</span>
				<input
					type="checkbox"
					class="toggle toggle-primary"
					bind:checked={isRecurringTask}
					onchange={() => {
						if (isRecurringTask && $store.currentStep === 'budget') {
							generatePreview();
						}
					}}
				/>
			</label>
			{#if isRecurringTask}
				<div class="text-info text-sm">This task will repeat based on the schedule you set</div>
			{/if}
		</div>

		<div class="space-y-6">
			{#if $store.currentStep === 'basics'}
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
							<span class="label-text">What do you need done?</span>
						</label>
						<input
							type="text"
							id="title"
							value={$store.task.title}
							onchange={(e) => store.updateTask({ title: (e.target as HTMLInputElement).value })}
							class="input input-bordered w-full {errors.title ? 'input-error' : ''}"
							placeholder="e.g. Help move my sofa"
						/>
						{#if errors.title}
							<span class="label-text-alt text-error">{errors.title}</span>
						{/if}
					</div>

					<div class="space-y-4">
						<h3 class="text-lg font-semibold">When do you need this done?</h3>

						<div class="flex gap-4">
							<button
								class="btn {$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
								onclick={() =>
									store.updateTask({ deadline: new Date().toISOString(), dateRange: undefined })}
							>
								I'm flexible
							</button>
							<button
								class="btn {!$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
								onclick={() =>
									store.updateTask({
										deadline: '',
										dateRange: {
											start: new Date().toISOString(),
											end: new Date().toISOString()
										}
									})}
							>
								On a specific date
							</button>
						</div>

						{#if $store.task.dateRange}
							<div class="grid grid-cols-2 gap-4">
								<div>
									<DatePicker
										label="Start Date"
										value={$store.task.dateRange.start}
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
								</div>
								<div>
									<DatePicker
										label="End Date"
										value={$store.task.dateRange.end}
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
								</div>
								{#if errors.deadline}
									<span class="label-text-alt text-error col-span-2 -mt-4">{errors.deadline}</span>
								{/if}
							</div>
						{:else}
							<div>
								<DatePicker
									label="Deadline"
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
						<label for="category" class="label">Category</label>
						<Tags
							options={$appStore.categories.map((cat) => ({
								name: cat.name,
								id: cat.id
							}))}
							selectedTags={$store.task.categoryIds}
							onChange={(ids) => store.updateTask({ categoryIds: ids })}
						/>
						{#if errors.category}
							<span class="label-text-alt text-error">{errors.category}</span>
						{/if}
					</div>

					<div class="w-full">
						<label for="skills" class="label">Required Skills</label>
						<Tags
							options={$appStore.skills}
							selectedTags={$store.task.skillIds}
							onChange={(ids) => store.updateTask({ skillIds: ids })}
						/>
						{#if errors.skill}
							<span class="label-text-alt text-error">{errors.skill}</span>
						{/if}
					</div>
				</div>
			{:else if $store.currentStep === 'location'}
				<div
					class="space-y-4"
					in:fly={{
						duration: 200,
						easing: linear,
						y: 0,
						x: direction === 'forward' ? 20 : -20
					}}
				>
					<h3 class="text-lg font-semibold">Is this a removals task?</h3>
					<div class="flex gap-4">
						<button
							class="btn min-w-1/3 text-xl {$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
							onclick={() => ($store.isRemovals = true)}
						>
							Yes
						</button>
						<button
							class="btn min-w-1/3 text-xl {!$store.isRemovals ? 'btn-primary' : 'btn-outline'}"
							onclick={() => {
								$store.isRemovals = false;
								store.updateTask({
									dropOffLocation: {
										displayName: '',
										longitude: null,
										latitude: null,
										zipCode: '',
										locationLoaded: false
									}
								});
							}}
						>
							No
						</button>
					</div>

					<div class="h-1"></div>
					{#if $store.isRemovals}
						<div class="w-full">
							<LocationAutoComplete
								label="Pickup Location"
								placeholder="Enter address or ZIP code"
								location={$store.task.pickupLocation}
								onLocationSelect={(location) => {
									store.updateTask({
										pickupLocation: {
											...location,
											locationLoaded: true
										}
									});
								}}
							/>
						</div>
						<div class="w-full">
							<LocationAutoComplete
								label="Drop-off Location"
								placeholder="Enter address or ZIP code"
								location={$store.task.dropOffLocation}
								onLocationSelect={(location) => {
									store.updateTask({
										dropOffLocation: {
											...location,
											locationLoaded: true
										}
									});
								}}
							/>
						</div>
						{#if errors.location}
							<span class="label-text-alt text-error block">{errors.location}</span>
						{/if}
					{:else}
						<p class="text-md font-semibold">Where do you need this done?</p>

						<div class="flex gap-4">
							<button
								class="btn {$store.task.taskType === 'IN_PERSON' ? 'btn-primary' : 'btn-outline'}"
								onclick={() => store.updateTask({ taskType: TaskTypeEnum.IN_PERSON })}
							>
								In-person
							</button>
							<button
								class="btn {$store.task.taskType === TaskTypeEnum.REMOTE
									? 'btn-primary'
									: 'btn-outline'}"
								onclick={() => {
									store.updateTask({ taskType: TaskTypeEnum.REMOTE });
									store.updateTask({
										pickupLocation: {
											displayName: '',
											longitude: null,
											latitude: null,
											zipCode: '',
											locationLoaded: false
										},
										dropOffLocation: {
											displayName: '',
											longitude: null,
											latitude: null,
											zipCode: '',
											locationLoaded: false
										}
									});
								}}
							>
								Remote
							</button>
						</div>

						{#if $store.task.taskType === TaskTypeEnum.IN_PERSON}
							<div class="w-full">
								<LocationAutoComplete
									label="Location"
									placeholder="Enter address or ZIP code"
									location={$store.task.pickupLocation}
									onLocationSelect={(location) => {
										store.updateTask({
											pickupLocation: {
												...location,
												locationLoaded: true
											}
										});
									}}
								/>
								{#if errors.location}
									<span class="label-text-alt text-error">{errors.location}</span>
								{/if}
							</div>
						{/if}
					{/if}

					<div class="w-full">
						<label for="attachments" class="label"> Attachments </label>

						<Uploader
							id="attachments"
							label="Attachments"
							maxFiles={5}
							maxFileSize={10}
							onChange={handleFileUpload}
						/>
					</div>
				</div>
			{:else if $store.currentStep === 'budget'}
				<div
					class="space-y-4"
					in:fly={{
						duration: 200,
						easing: linear,
						y: 0,
						x: direction === 'forward' ? 20 : -20
					}}
				>
					<h3 class="text-lg font-semibold">What's your budget?</h3>

					<div class="flex gap-4">
						<button
							class="btn {$store.task.budgetType === BudgetTypeEnum.FIXED
								? 'btn-primary'
								: 'btn-outline'}"
							onclick={() => store.updateTask({ budgetType: BudgetTypeEnum.FIXED })}
						>
							Fixed price
						</button>
						<button
							class="btn {$store.task.budgetType === BudgetTypeEnum.HOURLY
								? 'btn-primary'
								: 'btn-outline'}"
							onclick={() => store.updateTask({ budgetType: BudgetTypeEnum.HOURLY })}
						>
							Hourly rate
						</button>
					</div>

					<div class="w-full">
						<label for="budget" class="label">
							<span class="label-text">Budget (in BTC)</span>
						</label>
						<input
							type="number"
							id="budget"
							value={$store.task.budget}
							onchange={(e) => {
								store.updateTask({ budget: parseFloat((e.target as HTMLInputElement).value) });
								if (isRecurringTask) generatePreview();
							}}
							class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
							placeholder="Enter your budget"
							min="0"
							step="0.00000001"
						/>
						{#if errors.budget}
							<span class="label-text-alt text-error">{errors.budget}</span>
						{/if}
					</div>

					{#if $store.task.budgetType === BudgetTypeEnum.HOURLY}
						<div class="w-full">
							<label for="estimatedHours" class="label">
								<span class="label-text">Estimated Hours</span>
							</label>
							<input
								type="number"
								id="estimatedHours"
								value={$store.task.estimatedHours}
								onchange={(e) => {
									store.updateTask({
										estimatedHours: parseInt((e.target as HTMLInputElement).value)
									});
									if (isRecurringTask) generatePreview();
								}}
								class="input input-bordered w-full"
								placeholder="Estimated hours needed"
								min="1"
							/>
							{#if errors.estimatedHours}
								<span class="label-text-alt text-error">{errors.estimatedHours}</span>
							{/if}
						</div>
					{/if}

					<div class="w-full">
						<label for="description">
							<span class="label">Task Details</span>
							<textarea
								id="description"
								value={$store.task.description}
								onchange={(e) => {
									store.updateTask({ description: (e.target as HTMLTextAreaElement).value });
									if (isRecurringTask) generatePreview();
								}}
								class="textarea textarea-bordered h-32 w-full {errors.description
									? 'textarea-error'
									: ''}"
								placeholder="Describe your task in detail"
							></textarea>
						</label>
						{#if errors.description}
							<span class="label-text-alt text-error">{errors.description}</span>
						{/if}
					</div>

					<!-- Recurring Task Section -->
					{#if isRecurringTask}
						<div class="divider mt-6 mb-4">Recurring Task Schedule</div>

						<!-- Recurrence Pattern Selector -->
						<div class="mb-6">
							<h4 class="mb-2 text-lg font-medium">How often should this task repeat?</h4>
							<RecurrencePatternSelector
								pattern={recurringTaskData.recurrencePattern}
								onUpdate={updateRecurrencePattern}
							/>
						</div>

						<!-- Generation Preview -->
						{#if generationPreview.length > 0}
							<div class="my-6">
								<h4 class="mb-2 text-lg font-medium">Task Generation Preview</h4>
								<div class="bg-base-200 rounded-box p-4">
									<p class="mb-2 text-sm">
										Based on your settings, tasks will be generated on these dates:
									</p>
									<ul class="max-h-32 list-disc overflow-y-auto pl-5 text-sm">
										{#each generationPreview.slice(0, 10) as date}
											<li>{new Date(date).toLocaleDateString()}</li>
										{/each}
										{#if generationPreview.length > 10}
											<li class="italic">...and {generationPreview.length - 10} more instances</li>
										{/if}
									</ul>
								</div>
							</div>
						{:else}
							<div class="alert alert-info">
								<span>Complete all required fields to see when your tasks will be scheduled.</span>
							</div>
						{/if}
					{/if}
				</div>
			{/if}

			<div class="mt-6 flex justify-between">
				{#if $store.currentStep !== 'basics'}
					<button
						class="btn"
						onclick={() => {
							store.previousStep();
							direction = 'backward';
						}}>Back</button
					>
				{:else}
					<div></div>
				{/if}

				{#if $store.currentStep === 'budget'}
					<button
						class="btn btn-primary {isSubmitting ? 'loading' : ''}"
						onclick={handleSubmit}
						disabled={isSubmitting}
					>
						{#if isSubmitting}
							<span></span>
						{:else if isRecurringTask}
							Create Recurring Template
						{:else}
							Get Quotes
						{/if}
					</button>
				{:else}
					<button class="btn btn-primary" onclick={handleNext}>Next</button>
				{/if}
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
