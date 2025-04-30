<script lang="ts">
	import { onMount } from 'svelte';
	import { AxiosError } from 'axios';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app.store';
	import { BudgetTypeEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import recurringTasksService from '$lib/api/services/recurring-tasks.service';
	import Uploader from '$lib/components/Uploader.svelte';
	import Tags from '$lib/components/Tags.svelte';
	import LocationAutoComplete from '$lib/components/LocationAutoComplete.svelte';
	import DatePicker from '$lib/components/date/DatePicker.svelte';
	import uploadService from '$lib/api/services/upload.service';
	import RecurrencePattern from '$lib/components/task/RecurrencePattern.svelte';
	import { CreateTaskStore } from '$houdini';
	import { tryCatch } from '$lib/utils/tryCatch';

	// Load the draft when the page is loaded
	onMount(() => {
		store.loadDraft();
	});

	const createTaskMutation = new CreateTaskStore();

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
				if ($store.task.deadlineDate && new Date($store.task.deadlineDate) < new Date())
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
		if (!files || files.length === 0) return;

		try {
			const uploadedFiles = await uploadService.uploadMultipleFiles(files);
			uploadedFiles.forEach((file, index) => {
				if (!$store.task.attachments) return;
				$store.task.attachments.push({
					fileUrl: file.url,
					fileName: files[index].name,
					fileSize: files[index].size
				});
			});

			// Save to localStorage immediately after adding attachments
			store.saveDraft();
			appStore.showSuccessToast('Files uploaded successfully');
		} catch (error) {
			// Handle upload failure
			console.error('File upload failed:', error);
			errors.attachments = 'Failed to upload attachments. Please go back and try again.';
			appStore.showErrorToast('Failed to upload attachments. Please go back and try again.');
		}
	};

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
			if ($store.recurringTask.isRecurring) {
				// Create recurring task template
				const data = {
					isRecurring: true,
					name: $store.recurringTask.name,
					description: $store.recurringTask.description,
					recurrencePattern: $store.recurringTask.recurrencePattern,
					task: $store.task
				};
				await recurringTasksService.createTemplate(data);
			} else {
				// Create a regular task
				console.log($store.task);
				const { data, error } = await tryCatch(
					createTaskMutation.mutate({
						input: {
							title: $store.task.title,
							description: $store.task.description,
							budget: $store.task.budget,
							budgetType: $store.task.budgetType,
							taskType: $store.task.taskType,
							deadlineDate: $store.task.deadlineDate,
							estimatedHours: $store.task.estimatedHours,
							categoryIds: $store.task.categoryIds,
							skillIds: $store.task.skillIds,
							pickupLocation: {
								displayName: $store.task.pickupLocation?.displayName ?? '',
								longitude: $store.task.pickupLocation?.longitude ?? 0,
								latitude: $store.task.pickupLocation?.latitude ?? 0,
								zipCode: $store.task.pickupLocation?.zipCode ?? '',
								locationLoaded: $store.task.pickupLocation?.locationLoaded ?? false
							},
							dropOffLocation: {
								displayName: $store.task.dropOffLocation?.displayName ?? '',
								longitude: $store.task.dropOffLocation?.longitude ?? 0,
								latitude: $store.task.dropOffLocation?.latitude ?? 0,
								zipCode: $store.task.dropOffLocation?.zipCode ?? '',
								locationLoaded: $store.task.dropOffLocation?.locationLoaded ?? false
							},
							dateRange: $store.task.dateRange,
							attachments: $store.task.attachments
						}
					})
				);
				if (error) throw error;
				console.log(data);
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

<div class="card bg-base-100 mx-auto min-h-[90dvh] max-w-3xl shadow-xl">
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
									store.updateTask({
										deadlineDate: new Date().toISOString(),
										dateRange: undefined
									})}
							>
								I'm flexible
							</button>
							<button
								class="btn {!$store.task.dateRange ? 'btn-outline' : 'btn-primary'}"
								onclick={() =>
									store.updateTask({
										deadlineDate: undefined,
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
									value={$store.task.deadlineDate}
									onChange={(value: string) => store.updateTask({ deadlineDate: value })}
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
								class="btn {$store.task?.taskType === 'IN_PERSON' ? 'btn-primary' : 'btn-outline'}"
								onclick={() => store.updateTask({ taskType: TaskTypeEnum.IN_PERSON })}
							>
								In-person
							</button>
							<button
								class="btn {$store.task?.taskType === TaskTypeEnum.REMOTE
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

						{#if $store.task?.taskType === TaskTypeEnum.IN_PERSON}
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
							files={$store.task.attachments?.map((file) => file.fileUrl)}
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
				</div>
			{:else if $store.currentStep === 'recurring'}
				<div
					class="space-y-4"
					in:fly={{
						duration: 200,
						easing: linear,
						y: 0,
						x: direction === 'forward' ? 20 : -20
					}}
				>
					<div class="w-full">
						<label for="name" class="label">
							<span class="label-text">Recurring Task Name</span>
						</label>
						<input
							type="text"
							id="name"
							value={$store.recurringTask.name}
							onchange={(e) =>
								store.updateRecurringDetails({ name: (e.target as HTMLInputElement).value })}
							class="input input-bordered w-full {errors.name ? 'input-error' : ''}"
							placeholder="e.g. Weekly Sofa Pickup"
						/>
						{#if errors.name}
							<span class="label-text-alt text-error">{errors.name}</span>
						{/if}
					</div>

					<div class="w-full">
						<label for="description">
							<span class="label-text">Recurring Task Details</span>
						</label>
						<textarea
							id="description"
							value={$store.recurringTask.description}
							onchange={(e) =>
								store.updateRecurringDetails({
									description: (e.target as HTMLTextAreaElement).value
								})}
							class="textarea textarea-bordered h-32 w-full {errors.description
								? 'textarea-error'
								: ''}"
							placeholder="Describe your recurring task in detail"
						></textarea>
						{#if errors.description}
							<span class="label-text-alt text-error">{errors.description}</span>
						{/if}
					</div>

					<div class="divider mt-6 mb-4">Recurring Task Schedule</div>

					<!-- Recurrence Pattern Selector -->
					<div class="mb-6">
						<h4 class="mb-2 text-lg font-medium">How often should this task repeat?</h4>
						<RecurrencePattern pattern={$store.recurringTask.recurrencePattern} />
					</div>
				</div>
			{/if}

			<!-- Control buttons -->
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
