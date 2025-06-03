<script lang="ts">
	import { onMount } from 'svelte';
	import { AxiosError } from 'axios';
	import { linear } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { appStore } from '$lib/stores/app.store';
	import {
		BudgetTypeEnum,
		TaskTypeEnum,
		TaskStatusEnum
	} from '$lib/utils/enums/task.enum';
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
    import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// Load the draft when the page is loaded
	onMount(() => {
		store.loadDraft();
		// Fetch real-time BTC price
		fetchBtcPrice();
	});

	const createTaskMutation = new CreateTaskStore();

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isSubmitted = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');

	// BTC to USDT estimate
	let usdtEstimate = $state<string>('0');
	let btcPrice = $state<number>(63000); // Default fallback price
	
	/**
	 * Fetch current BTC price and update the state
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			console.log('Current BTC price:', btcPrice);
			
			// Update estimate if we have a budget value
			if ($store.task.budget) {
				usdtEstimate = calculateUsdtEstimate($store.task.budget);
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	/**
	 * Calculate estimated USDT value based on BTC amount
	 * Uses real-time BTC price from API
	 */
	function calculateUsdtEstimate(btcAmount: number): string {
		// Calculate the estimated value and format it
		const estimatedValue = btcAmount * btcPrice;
		return estimatedValue.toLocaleString('en-US', {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2
		});
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
			case 'taskboost':
				// Task boost step doesn't need validation as it's optional
				break;
			case 'review':
				// Review step doesn't need validation as it's just reviewing previous inputs
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

<div class="card bg-base-100 max-w-3xl shadow-xl mx-4 mt-2 sm:mt-0">
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
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
							oninput={(e) => {
								const value = parseFloat((e.target as HTMLInputElement).value);
								store.updateTask({ budget: value });
								// Update estimated USDT value as the user types
								usdtEstimate = calculateUsdtEstimate(value);
							}}
							onchange={(e) => {
								store.updateTask({ budget: parseFloat((e.target as HTMLInputElement).value) });
							}}
							class="input input-bordered w-full {errors.budget ? 'input-error' : ''}"
							placeholder="Enter your budget"
							min="0"
							step="0.00000001"
						/>
						{#if $store.task.budget > 0}
							<span class="label-text-alt mt-1 block text-info">≈ {usdtEstimate} USDT</span>
						{/if}
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
			{:else if $store.currentStep === 'taskboost'}
				<div
					class="space-y-6"
					in:fly={{
						duration: 200,
						easing: linear,
						y: 0,
						x: direction === 'forward' ? 20 : -20
					}}
				>
					<h2 class="text-xl font-semibold">Boost Your Task</h2>
					<p class="text-sm">Would you like to boost your task to get more visibility and faster responses?</p>

					<!-- <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary">
							<div class="card-body p-4">
								<h3 class="card-title">Standard</h3>
								<p class="text-2xl font-bold">Free</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Standard visibility
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Basic search ranking
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-outline btn-sm">Select</button>
								</div>
							</div>
						</div>

						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-primary">
							<div class="card-body p-4">
								<div class="badge badge-primary mb-2">MOST POPULAR</div>
								<h3 class="card-title">Premium</h3>
								<p class="text-2xl font-bold">$5.99</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Featured for 24 hours
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Highlighted in search results
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Priority notifications
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-primary btn-sm">Select</button>
								</div>
							</div>
						</div>

						<div class="card bg-base-100 shadow-md hover:shadow-lg transition-all cursor-pointer border border-transparent hover:border-primary">
							<div class="card-body p-4">
								<h3 class="card-title">Ultimate</h3>
								<p class="text-2xl font-bold">$9.99</p>
								<div class="divider my-1"></div>
								<ul class="space-y-2">
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Featured for 72 hours
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Top search placement
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										Instant notifications
									</li>
									<li class="flex items-center gap-2">
										<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-success" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
										VIP support
									</li>
								</ul>
								<div class="card-actions justify-end mt-4">
									<button class="btn btn-outline btn-sm">Select</button>
								</div>
							</div>
						</div>
					</div> -->

					<div class="alert alert-info mt-4">
						<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-6 h-6"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
						<span>Boosting your task increases your chances of finding the right tasker faster!</span>
					</div>

					<div class="divider">Payment Options</div>

					<!-- <div class="flex flex-wrap gap-3">
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" checked />
								<span class="label-text">Bitcoin</span>
							</label>
						</div>
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" />
								<span class="label-text">Lightning</span>
							</label>
						</div>
						<div class="form-control">
							<label class="cursor-pointer label gap-2">
								<input type="radio" name="payment-option" class="radio radio-primary" />
								<span class="label-text">Liquid</span>
							</label>
						</div>
					</div> -->
				</div>
			{:else if $store.currentStep === 'review'}
				<div
					class="space-y-6"
					in:fly={{
						duration: 200,
						easing: linear,
						y: 0,
						x: direction === 'forward' ? 20 : -20
					}}
				>
					<h2 class="text-xl font-semibold">Review Your Task</h2>
					
					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<h3 class="text-lg font-medium mb-2">Basic Information</h3>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								<div>
									<span class="font-medium">Title:</span> 
									<span>{$store.task.title}</span>
								</div>
								
								<div>
									<span class="font-medium">Task Type:</span> 
									<span>{$store.task.taskType === TaskTypeEnum.IN_PERSON ? 'In Person' : 'Remote'}</span>
								</div>
								
								<div>
									<span class="font-medium">Timeline:</span> 
									<span>
										{#if $store.task.dateRange}
											From {new Date($store.task.dateRange.start).toLocaleDateString()} to {new Date($store.task.dateRange.end).toLocaleDateString()}
										{:else}
											Deadline: {new Date($store.task.deadlineDate).toLocaleDateString()}
										{/if}
									</span>
								</div>
							</div>
							
							<h4 class="mt-3 font-medium">Categories</h4>
							<div class="flex flex-wrap gap-2">
								{#each $appStore.categories.filter(cat => $store.task.categoryIds.includes(cat.id)) as category}
									<div class="badge badge-primary">{category.name}</div>
								{/each}
							</div>
							
							<h4 class="mt-3 font-medium">Skills</h4>
							<div class="flex flex-wrap gap-2">
								{#each $appStore.skills.filter(skill => $store.task.skillIds.includes(skill.id)) as skill}
									<div class="badge badge-secondary">{skill.name}</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<h3 class="text-lg font-medium mb-2">Location</h3>
							{#if $store.isRemovals}
								<div class="grid grid-cols-1 gap-2">
									<div>
										<span class="font-medium">Pickup Location:</span> 
										<span>{$store.task.pickupLocation?.displayName}</span>
									</div>
									<div>
										<span class="font-medium">Drop-off Location:</span> 
										<span>{$store.task.dropOffLocation?.displayName}</span>
									</div>
								</div>
							{:else if $store.task.taskType === TaskTypeEnum.IN_PERSON}
								<div>
									<span class="font-medium">Task Location:</span> 
									<span>{$store.task.pickupLocation?.displayName}</span>
								</div>
							{:else}
								<div>Remote Task - No location specified</div>
							{/if}
						</div>
					</div>

					<div class="card bg-base-200 shadow-sm">
						<div class="card-body p-4">
							<h3 class="text-lg font-medium mb-2">Budget & Details</h3>
							<div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
								<div>
									<span class="font-medium">Budget Type:</span> 
									<span>{$store.task.budgetType === BudgetTypeEnum.FIXED ? 'Fixed Price' : 'Hourly Rate'}</span>
								</div>
								<div>
									<span class="font-medium">Budget Amount:</span> 
									<span>${$store.task.budget}</span>
								</div>
								{#if $store.task.budgetType === BudgetTypeEnum.HOURLY}
								<div>
									<span class="font-medium">Estimated Hours:</span> 
									<span>{$store.task.estimatedHours}</span>
								</div>
								{/if}
							</div>

							<h4 class="mt-3 font-medium">Description</h4>
							<div class="bg-base-100 p-3 rounded-md mt-1">
								<p>{$store.task.description}</p>
							</div>
							
							{#if $store.task.attachments && $store.task.attachments.length > 0}
								<h4 class="mt-3 font-medium">Attachments</h4>
								<div class="flex flex-wrap gap-2">
									{#each $store.task.attachments as attachment, i}
										<div class="badge badge-outline">
											<span class="truncate max-w-xs">{attachment.fileName}</span>
										</div>
									{/each}
								</div>
							{/if}
						</div>
					</div>

					{#if $store.recurringTask.isRecurring}
						<div class="alert alert-info">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
							<div>
								<h3 class="font-bold">This is a recurring task!</h3>
								<div class="text-sm">After review, you'll be asked to set up the recurring schedule.</div>
							</div>
						</div>
					{/if}

					{#if errors.general}
						<div class="alert alert-error">
							<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
							<span>{errors.general}</span>
						</div>
					{/if}
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
