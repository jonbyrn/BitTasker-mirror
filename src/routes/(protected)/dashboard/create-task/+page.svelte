<script lang="ts">
	import type { Attachment, TaskBody } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
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
	import { t } from 'svelte-i18n';
	let errors = $state<Record<string, string>>({});
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');
	let newFiles = $state<File[]>([]);
	let attachmentsToRemove = $state<Attachment[]>([]);
	// Remover esta línea ya que signedEventId se usará como variable local
	// let signedEventId = $state<string | null>(null);

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
				eventId: '',
				title: taskData.title,
				description: taskData.description,
				taskType: graphqlTaskType,
				skills: taskData.skills || [],
				categories: taskData.categories.map((category) => category.id) || [],		
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
			} else if (result.data?.triggerSavedSearchCheck.success) {
				const { matchCount, message } = result.data.triggerSavedSearchCheck;

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
			
			// Check if we're in edit mode
			const isEditing = $page.url.searchParams.get('edit') === 'true';
			
			if (isEditing) {
				// Load the draft for editing
				await store.loadDraft();
			} else {
				// Clear any existing draft for new task creation
				await store.clearDraft();
			}
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
				if (!$store.task.title?.trim()) errors.title = $t('task.errors.title_required');
				if ($store.task.title && $store.task.title.length > 200)
					errors.title = $t('task.errors.title_too_long');
				if ($store.task.dateRange) {
					// Validar que ambos campos de fecha sean requeridos
					if (
						!$store.task.dateRange.start ||
						!$store.task.dateRange.end ||
						$store.task.dateRange.end === 'null' ||
						$store.task.dateRange.end === null
					) {
						errors.deadline = $t('task.errors.date_range_required');
					}

					// Validar que las fechas estén en el futuro (comparando solo fechas, no horas)
					const today = new Date();
					const todayDateStr = today.toISOString().split('T')[0];

					const startDate = new Date($store.task.dateRange.start);
					const startDateStr = startDate.toISOString().split('T')[0];

					const endDate = new Date($store.task.dateRange.end);
					const endDateStr = endDate.toISOString().split('T')[0];

					if (endDateStr < todayDateStr || startDateStr < todayDateStr || endDateStr < startDateStr) {
						errors.deadline = $t('task.errors.date_range_future');
					}
				}
				if ($store.task.deadline) {
					const deadlineDate = new Date($store.task.deadline);
					const today = new Date();
					
					// Compare dates using date strings to avoid timezone issues
					const deadlineDateStr = deadlineDate.toISOString().split('T')[0];
					const todayDateStr = today.toISOString().split('T')[0];

					if (deadlineDateStr < todayDateStr)
						// Allow today's date for deadline
						errors.deadline = $t('task.errors.deadline_future');
				}
				if ($store.task?.categories?.length === 0)
					errors.category = $t('task.errors.category_required');
				if ($store.task?.skills?.length === 0) errors.skill = $t('task.errors.skill_required');
				break;
			case 'location':
				if ($store.isRemovals) {
					if (!$store.task.pickupLocation?.latitude || !$store.task.pickupLocation?.longitude) {
						errors.location = $t('task.errors.pickup_required');
					}
					if (!$store.task.dropOffLocation?.latitude || !$store.task.dropOffLocation?.longitude) {
						errors.location = $t('task.errors.dropoff_required');
					}
				}
				if (
					$store.task.taskType === TaskTypeEnum.IN_PERSON &&
					(!$store.task.pickupLocation?.latitude || !$store.task.pickupLocation?.longitude)
				) {
					errors.location = $t('task.errors.location_required');
				}
				break;
			case 'budget':
				if (!$store.task.budget.amount || $store.task.budget.amount <= 0) {
					errors.budget = $t('task.errors.budget_required');
				}
				if (
					$store.task.budget.type === BudgetTypeEnum.HOURLY &&
					(!$store.task.budget.estimatedHours || $store.task.budget.estimatedHours <= 0)
				) {
					errors.estimatedHours = $t('task.errors.estimated_hours_required');
				}
				if (!$store.task.description?.trim())
					errors.description = $t('task.errors.description_required');
				if ($store.task.description?.trim().length < 20)
					errors.description = $t('task.errors.description_min_length');
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
				const uploadResult = await uploadService.uploadSingleFile(file, { folder: 'task' });
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

		// Start image upload in the background if we're in the budget step
		if ($store.currentStep === TaskStepEnum.BUDGET) {
			if (newFiles.length !== 0) {
				if (($store.task.attachments?.length || 0) + newFiles.length > 5) {
					appStore.showErrorToast($t('task.upload.too_many_files'));
					return;
				}

				// Show upload started toast
				appStore.showInfoToast($t('task.upload.background_uploading'));

				// Start upload in background
				uploadFiles(newFiles)
					.then((uploadedFiles) => {
						$store.task.attachments = [...($store.task.attachments || []), ...uploadedFiles];
						newFiles = [];
						store.saveDraft();
						appStore.showSuccessToast($t('task.upload.files_uploaded'));
					})
					.catch((error) => {
						console.error('Failed to upload files:', error);
						appStore.showErrorToast($t('task.upload.upload_failed'));
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

		let signedEventId: string | null = null;

		try {
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

		
			const isUpdating = $page.url.searchParams.get('edit') === 'true';

			if (isUpdating) {
				signedEventId = await updateTask($store.id, task);
				appStore.showSuccessToast($t('task.success.updated'));

				const url = new URL($page.url);
				url.searchParams.delete('edit');
				goto(url);
			} else {
				if ($store.recurringTask.isRecurring) {
					signedEventId = await createRecurringTask(task, $store.recurringTask);
				} else {
					signedEventId = await createTask(task);
				}

				appStore.showSuccessToast($t('task.success.created'));
			}

			await store.clearDraft();
			await goto('/dashboard');
			
		} catch (error) {
			
			const errorMessage = error instanceof Error ? error.message : $t('task.errors.create_failed');
			errors.general = errorMessage;
			appStore.showErrorToast(errorMessage);
			
		} finally {
			
			isSubmitting = false;
			if (signedEventId) {
				const currentTask = {
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
				triggerSavedSearchChecks(currentTask);
			}
			
		}
	}
</script>

<div class="mx-auto max-w-7xl py-4 sm:p-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h3 class="">{$page.url.searchParams.get('edit') === 'true' ? $t('task.edit_title') : $t('task.create_title')}</h3>
		<p class="text-base-content/70">{$page.url.searchParams.get('edit') === 'true' ? $t('task.edit_description') : $t('task.create_description')}</p>
	</div>
	<div class=" bg-base-100 rounded-xl">
		<div class="card-body">
			<div class="mb-4 flex items-center justify-between">
				<div class="text-sm">
					{$t('task.step')}
					{$STEPS.indexOf($store.currentStep) + 1}
					{$t('task.of')}
					{$STEPS.length}
				</div>
			</div>

			{#if isLoading}
				<div class="flex justify-center">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{:else}
				<div class="space-y-6">
					{#if $store.currentStep === TaskStepEnum.BASICS}
						<TaskBasics {errors} {direction} />
					{:else if $store.currentStep === TaskStepEnum.LOCATION}
						<TaskLocation {errors} {direction} />
					{:else if $store.currentStep === TaskStepEnum.BUDGET}
						<TaskBudget {errors} {direction} bind:newFiles bind:attachmentsToRemove />
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
								{$t('task.back')}
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
									{$t('task.create_recurring')}
								{:else}
									{$t('task.get_quotes')}
								{/if}
							</button>
						{:else}
							<button class="btn btn-primary" onclick={handleNext}>{$t('task.next')}</button>
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
</div>
