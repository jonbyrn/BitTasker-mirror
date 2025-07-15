<script lang="ts">
	import type { Attachment, TaskBody } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/stores/app.store';
	import { getBudgetBucket } from '$lib/utils/helpers/budgetTier';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import { TriggerSavedSearchCheckStore, type TaskBodyInput } from '$houdini';
	import { createTask, createRecurringTask, updateTask } from '$lib/nostr/task';
	import {
		BudgetTypeEnum,
		TaskStatusEnum,
		TaskStepEnum,
		TaskTypeEnum
	} from '$lib/utils/enums/task.enum';
	import TaskBasics from '$lib/components/task/steps/TaskBasics.svelte';
	import TaskLocation from '$lib/components/task/steps/TaskLocation.svelte';
	import TaskBudget from '$lib/components/task/steps/TaskBudget.svelte';
	import TaskRecurring from '$lib/components/task/steps/TaskRecurring.svelte';
	import TaskReview from '$lib/components/task/steps/TaskReview.svelte';
	import uploadService from '$lib/api/services/upload.service';

	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');
	let newFiles = $state<File[]>([]);
	let attachmentsToRemove = $state<Attachment[]>([]);
	let signedEventId = $state<string | null>(null);

	// Houdini store for triggering saved search checks
	const triggerSavedSearchStore = new TriggerSavedSearchCheckStore();

	// Background function to trigger saved search checks
	const triggerSavedSearchChecks = async (taskData: TaskBody) => {
		try {
			// Convert taskType value to GraphQL enum key
			let graphqlTaskType: TaskBodyInput['taskType'] = 'REMOTE';
			if (taskData.taskType === TaskTypeEnum.IN_PERSON) graphqlTaskType = 'IN_PERSON';

			const budgetTier = getBudgetBucket(taskData.budget.amount, taskData.budget.currency);

			// Convert the task data to TaskBodyInput format
			const taskBodyInput: TaskBodyInput = {
				eventId: signedEventId || '',
				title: taskData.title,
				description: taskData.description,
				taskType: graphqlTaskType,
				skills: taskData.skills || [],
				categories: taskData.categories || [],
				deadline: taskData.deadline,
				budget: taskData.budget
					? {
							currency: taskData.budget.currency,
							type: taskData.budget.type,
							tier: budgetTier
						}
					: undefined
			};

			const result = await triggerSavedSearchStore.mutate({
				task: taskBodyInput
			});

			if (result.errors) {
				console.warn('⚠️ Saved search check failed:', result.errors);
			} else if (result.data?.triggerSavedSearchCheck.success) {
				const { matchCount, message } = result.data.triggerSavedSearchCheck;
				console.log('✅ Saved search check completed:', { matchCount, message });

				if (matchCount && matchCount > 0) {
					console.log(`📧 ${matchCount} saved search notifications sent`);
				}
			}
		} catch (error) {
			// Silently handle errors in background operation - don't interrupt user flow
			console.warn('⚠️ Background saved search check failed:', error);
		}
	};

	// Load the draft when the page is loaded
	onMount(async () => {
		try {
			isLoading = true;
			await store.loadDraft();
		} catch (error) {
			console.error('Error loading draft:', error);
		} finally {
			isLoading = false;
		}
	});

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
				if ($store.task?.categories?.length === 0)
					errors.category = 'At least one category is required';
				if ($store.task?.skills?.length === 0) errors.skill = 'At least one skill is required';
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

	const handleRemoveAttachment = () => {
		if (attachmentsToRemove.length > 0) {
			attachmentsToRemove.forEach((attachment) => {
				uploadService.deleteFile(attachment.key).then(() => {
					attachmentsToRemove = [];
					store.saveDraft();
				});
			});
		}
	};

	const uploadFiles = async (files: (Attachment | File)[]): Promise<Attachment[]> => {
		const uploadPromises = files.map(async (file) => {
			if (file instanceof File) {
				const uploadResult = await uploadService.uploadSingleFile(file, 'task');
				return {
					key: uploadResult.key,
					url: uploadResult.url,
					type: file.type,
					alt: file.name,
					size: file.size
				};
			} else {
				return file;
			}
		});

		return Promise.all(uploadPromises);
	};

	const handleNext = async () => {
		if (!validateCurrentStep()) return;

		// Start image upload in the background if we're in the location step
		if ($store.currentStep === TaskStepEnum.LOCATION) {
			if (newFiles.length !== 0) {
				if (($store.task.attachments?.length || 0) + newFiles.length > 5) {
					appStore.showErrorToast('You can only upload up to 5 files');
					return;
				}

				// Show upload started toast
				appStore.showInfoToast('Uploading files in background...');

				// Start upload in background
				uploadFiles(newFiles)
					.then((uploadedFiles) => {
						$store.task.attachments = [...($store.task.attachments || []), ...uploadedFiles];
						newFiles = [];
						store.saveDraft();
						appStore.showSuccessToast('Files uploaded successfully!');
					})
					.catch((error) => {
						console.error('Failed to upload files:', error);
						appStore.showErrorToast(
							'Failed to upload some files. You can try uploading them again in the review step.'
						);
					});
			}

			handleRemoveAttachment();
		}

		// Proceed to next step immediately
		store.nextStep();
		store.saveDraft();
		direction = 'forward';
	};

	async function handleSubmit() {
		if (!validateCurrentStep()) return;

		isSubmitting = true;

		const task: TaskBody = {
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
			categories: $store.task.categories,
			status: TaskStatusEnum.OPEN
		};

		try {
			const isUpdating = page.url.searchParams.get('edit') === 'true';

			if (isUpdating) {
				signedEventId = await updateTask($store.id, task);

				// TODO: Handle update recurring task

				appStore.showSuccessToast('Task updated successfully!');
				page.url.searchParams.delete('edit');
				goto(page.url.pathname);
			} else {
				if ($store.recurringTask.isRecurring) {
					// TODO: Create recurring task template
					await createRecurringTask(task, $store.recurringTask);
				} else {
					// Create a regular task
					signedEventId = await createTask(task);
				}

				appStore.showSuccessToast('Task created successfully!');
			}

			await store.clearDraft();
			goto('/dashboard');
		} catch (error) {
			console.error('Error creating task:', error);
			if (error instanceof Error) errors.general = error.message;
			else errors.general = 'Failed to create task. Please try again.';
		} finally {
			isSubmitting = false;
			// Trigger saved search checks in the background (non-blocking)
			triggerSavedSearchChecks(task);
		}
	}
</script>

<div class="card bg-base-100 mx-auto mt-2 max-w-3xl rounded-xl shadow-xl sm:mt-0">
	<div class="card-body">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="card-title text-2xl">Create a New Task</h2>
			<div class="text-sm">
				Step {$STEPS.indexOf($store.currentStep) + 1} of {$STEPS.length}
			</div>
		</div>

		{#if isLoading}
			<div class="flex justify-center">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else}
			<!-- TODO: Recurring Task Toggle -->
			<!-- {#if $store.currentStep !== 'recurring'}
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
			{/if} -->

			<div class="space-y-6">
				{#if $store.currentStep === TaskStepEnum.BASICS}
					<TaskBasics {errors} {direction} />
				{:else if $store.currentStep === TaskStepEnum.LOCATION}
					<TaskLocation {errors} {direction} bind:newFiles bind:attachmentsToRemove />
				{:else if $store.currentStep === TaskStepEnum.BUDGET}
					<TaskBudget {errors} {direction} />
				{:else if $store.currentStep === TaskStepEnum.REVIEW}
					<TaskReview {direction} />
				{:else if $store.currentStep === TaskStepEnum.RECURRING}
					<TaskRecurring {errors} {direction} />
				{/if}

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
				</div>
			</div>

			{#if errors.general}
				<div class="alert alert-error alert-outline mt-6 shadow-lg">
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
		{/if}
	</div>
</div>
