<script lang="ts">
	import type { Attachment, Task, TaskBody } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { appStore } from '$lib/stores/app.store';
	import { getBudgetBucket } from '$lib/utils/helpers/budgetTier';
	import { taskStore as store, STEPS } from '$lib/stores/task.store';
	import { createTask, createRecurringTask, updateTask } from '$lib/nostr/task';
	import { hasPlaceOrCoordinates } from '$lib/utils/maps/geocode-on-save';
	import { addNewTaskToMyTasks, findMyTasks } from '$lib/nostr/findMyTasks';
	import {
		BudgetCurrencyEnum,
		TaskStatusEnum,
		TaskStepEnum,
		TaskTypeEnum
	} from '$lib/utils/enums/task.enum';
	import { isSatBid } from '$lib/utils/nostr-bid';
	import TaskBasics from '$lib/components/task/steps/TaskBasics.svelte';
	import TaskLocation from '$lib/components/task/steps/TaskLocation.svelte';
	import TaskBudget from '$lib/components/task/steps/TaskBudget.svelte';
	import TaskRecurring from '$lib/components/task/steps/TaskRecurring.svelte';
	import TaskReview from '$lib/components/task/steps/TaskReview.svelte';
	import savedSearchService, { type TaskBodyDto } from '$lib/api/services/saved-search.service';
	import { t } from 'svelte-i18n';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
	import { prepareSigner } from '$lib/utils/nostrKeys';
	import { getMnemonic } from '$lib/utils/helpers/mnemonic';
	import { isNsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
	import KeyUnlock from '$lib/components/wallet/KeyUnlock.svelte';
	let errors = $state<Record<string, string>>({});
	let needsKey = $state(false);
	let draftPrompt = $state(false);
	let isSubmitting = $state(false);
	let isLoading = $state(false);
	let isEditDataLoaded = $state(false);
	let direction: 'forward' | 'backward' = $state('forward');
	let attachmentsToRemove = $state<Attachment[]>([]);
	let taskBudgetRef: {
		uploadPendingFiles?: () => Promise<unknown[]>;
	} | null = $state(null);
	let taskBasicsRef: {
		saveCurrentSkillInput?: () => void;
	} | null = $state(null);

	// Background function to trigger saved search checks
	const triggerSavedSearchChecks = async (taskData: TaskBody, eventId: string) => {
		try {
			// Convert taskType enum to string for API
			const taskTypeString = taskData.taskType === TaskTypeEnum.IN_PERSON ? 'IN_PERSON' : 'REMOTE';

			const budgetTier = getBudgetBucket(taskData.budget.amount, taskData.budget.currency);

			// Convert the task data to TaskBodyDto format
			const taskBodyDto: TaskBodyDto = {
				eventId: eventId,
				title: taskData.title,
				description: taskData.description,
				taskType: taskTypeString,
				skills: taskData.skills || [],
				categories: taskData.categories.map((category) => category.id) || [],
				deadline: taskData.deadline,
				dateRange: taskData.dateRange,
				budget: {
					currency: taskData.budget.currency,
					type: taskData.budget.type,
					tier: budgetTier
				},
				pickupLocation: taskData.pickupLocation
					? {
							longitude: taskData.pickupLocation.longitude!,
							latitude: taskData.pickupLocation.latitude!,
							displayName: taskData.pickupLocation.displayName
						}
					: undefined,
				dropOffLocation: taskData.dropOffLocation
					? {
							longitude: taskData.dropOffLocation.longitude!,
							latitude: taskData.dropOffLocation.latitude!,
							displayName: taskData.dropOffLocation.displayName
						}
					: undefined
			};

			const result = await savedSearchService.triggerSavedSearchCheck(taskBodyDto);

			if (result.success && result.matchCount > 0) {
				console.log(`📧 ${result.matchCount} saved search notifications sent`);
			}
		} catch (error) {
			// Silently handle errors in background operation - don't interrupt user flow
			console.warn('⚠️ Background saved search check failed:', error);
		}
	};

	// Function to refresh My Tasks list after creating/updating a task
	async function refreshMyTasks() {
		try {
			// Reload the first page of My Tasks to show the new task
			await findMyTasks({ page: 1, limit: 20, refresh: true });
		} catch (error) {
			console.error('Error refreshing My Tasks:', error);
		}
	}

	function addOptimisticTask(task: TaskBody, eventId: string): void {
		if (!browser || !window.__PLAYWRIGHT_TEST__) return;
		const now = new Date();
		const optimisticTask: Task = {
			...task,
			id: eventId,
			npub: window.localStorage.getItem('__E2E_NPUB__') ?? '',
			status: task.status ?? TaskStatusEnum.OPEN,
			deadline: task.deadline ?? null,
			dateRange: task.dateRange ?? null,
			pickupLocation: task.pickupLocation ?? null,
			dropOffLocation: task.dropOffLocation ?? null,
			attachments: task.attachments ?? [],
			estimatedHours: task.budget.estimatedHours ?? 0,
			isRemovals: false,
			isBoosted: false,
			boostPercentage: null,
			createdAt: Math.floor(now.getTime() / 1000),
			updatedAt: now.toISOString(),
			completedAt: null,
			cancelledAt: null,
			deletedAt: null,
			isDeleted: false,
			requiredSkills: task.skills
		};
		addNewTaskToMyTasks(optimisticTask);
	}

	// Function to handle cancel/back to My Tasks
	function handleCancel() {
		// Check if we're in edit mode
		const isEditing = $page.url.searchParams.get('edit') === 'true';
		// Clear the appropriate draft (creation or edit)
		store.clearDraft(isEditing);
		// Navigate back to My Tasks
		goto(resolve('/hiring', {}));
	}

	// Save draft before leaving the page
	let isEditingMode = $state(false);
	let beforeUnloadHandler: (() => void) | null = null;

	// Load the draft when the page is loaded
	onMount(async () => {
		try {
			isLoading = true;

			// Check if we're in edit mode
			const isEditing = $page.url.searchParams.get('edit') === 'true';
			isEditingMode = isEditing;

			if (isEditing) {
				// Load the draft for editing (uses EDIT_STORAGE_KEY)
				await store.loadDraft(true);
				// Mark that edit data is loaded
				isEditDataLoaded = true;
			} else {
				// Load draft for new task creation (uses CREATE_STORAGE_KEY)
				await store.loadDraft(false);
				const loaded = get(store);
				draftPrompt =
					loaded.currentStep !== TaskStepEnum.BASICS || Boolean(loaded.task?.title?.trim());
				// Mark that edit data is loaded
				isEditDataLoaded = true;
			}

			// Setup auto-save on page unload
			if (browser) {
				beforeUnloadHandler = () => {
					// Force immediate save before leaving
					store.saveDraft(isEditingMode, true);
				};

				window.addEventListener('beforeunload', beforeUnloadHandler);
			}
		} catch (error) {
			console.error('Error loading draft:', error);
		} finally {
			isLoading = false;
		}
	});

	// Save draft when component is destroyed
	onDestroy(() => {
		if (browser) {
			// Remove beforeunload listener
			if (beforeUnloadHandler) {
				window.removeEventListener('beforeunload', beforeUnloadHandler);
			}
			// Save draft one more time when component is destroyed
			store.saveDraft(isEditingMode, true);
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

					if (
						endDateStr < todayDateStr ||
						startDateStr < todayDateStr ||
						endDateStr < startDateStr
					) {
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
				break;
			case 'location':
				if ($store.isRemovals) {
					if (!hasPlaceOrCoordinates($store.task.pickupLocation)) {
						errors.location = $t('task.errors.pickup_required');
					}
					if (!hasPlaceOrCoordinates($store.task.dropOffLocation)) {
						errors.location = $t('task.errors.dropoff_required');
					}
				}
				if (
					$store.task.taskType === TaskTypeEnum.IN_PERSON &&
					!hasPlaceOrCoordinates($store.task.pickupLocation)
				) {
					errors.location = $t('task.errors.location_required');
				}
				break;
			case 'budget':
				if (!$store.task.budget.amount || $store.task.budget.amount <= 0) {
					errors.budget = $t('task.errors.budget_required');
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

	const handleNext = async () => {
		// Save current skill input if we're on the basics step
		if ($store.currentStep === TaskStepEnum.BASICS && taskBasicsRef) {
			taskBasicsRef.saveCurrentSkillInput?.();
		}

		if (!validateCurrentStep()) return;

		// Proceed to next step immediately
		store.nextStep();
		store.saveDraft();
		direction = 'forward';
	};

	function paymentBudget(budget: TaskBody['budget']): TaskBody['budget'] {
		return {
			...budget,
			currency: isSatBid(budget.currency) ? 'SATS' : BudgetCurrencyEnum.USDT,
			escrow: budget.escrow !== false
		};
	}

	async function handleSubmit() {
		if (!validateCurrentStep()) return;
		const unlock = prepareSigner();

		let signedEventId: string | null = null;

		try {
			isSubmitting = true;
			await unlock;

			if (taskBudgetRef && taskBudgetRef.uploadPendingFiles) {
				try {
					const uploadedAttachments = await taskBudgetRef.uploadPendingFiles();
					// Solo mostrar mensajes si realmente se subieron archivos
					if (uploadedAttachments.length > 0) {
						appStore.showInfoToast($t('task.upload.uploading_files'));
						appStore.showSuccessToast($t('task.upload.files_uploaded'));
					}
				} catch (uploadError) {
					appStore.showErrorToast($t('task.upload.upload_failed'));
					throw uploadError;
				}
			}

			const flexible = $store.task.flexibleSchedule === true;
			const task: TaskBody = {
				title: $store.task.title,
				description: $store.task.description,
				budget: paymentBudget($store.task.budget),
				deadline: flexible ? undefined : $store.task.deadline,
				dateRange: flexible ? undefined : $store.task.dateRange,
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

				// Refresh My Tasks list to show updated task
				await refreshMyTasks();

				const url = new URL($page.url);
				url.searchParams.delete('edit');
				goto(resolve(`${url.pathname}${url.search}`, {}));
			} else {
				if ($store.recurringTask.isRecurring) {
					signedEventId = await createRecurringTask(task, $store.recurringTask);
				} else {
					signedEventId = await createTask(task);
				}
				if (signedEventId) addOptimisticTask(task, signedEventId);

				appStore.showSuccessToast($t('task.success.created'));

				// Enrich backend with task deadline for scheduled reminders
				if (signedEventId) {
					const deadlineStr = flexible
						? undefined
						: ($store.task.deadline ?? $store.task.dateRange?.end);
					const taskDeadline = deadlineStr
						? Math.floor(new Date(deadlineStr).getTime() / 1000)
						: undefined;
					notificationCenterService.enrich({
						action: 'task_created',
						taskId: signedEventId,
						taskDeadline,
						taskTitle: $store.task.title || undefined
					});
				}
			}

			// Trigger saved search check BEFORE clearing draft (store still has task data)
			if (signedEventId) {
				const currentTask = {
					title: $store.task.title,
					description: $store.task.description,
					budget: paymentBudget($store.task.budget),
					deadline: flexible ? undefined : $store.task.deadline,
					dateRange: flexible ? undefined : $store.task.dateRange,
					taskType: $store.task.taskType,
					pickupLocation: $store.task.pickupLocation,
					dropOffLocation: $store.task.dropOffLocation,
					skills: $store.task.skills,
					attachments: $store.task.attachments,
					categories: $store.task.categories,
					status: TaskStatusEnum.OPEN
				};
				triggerSavedSearchChecks(currentTask, signedEventId);
			}

			// Navigate first so draft reset / Nostr refresh cannot stall the /hiring redirect.
			await goto(resolve('/hiring', {}));

			await store.clearDraft(isUpdating);
			refreshMyTasks().catch((error) => {
				console.error('Error refreshing My Tasks:', error);
			});
		} catch (error) {
			if (isNsecUnlockRequired(error)) {
				needsKey = true;
				errors.general = $t('wallet.nsec_unlock_hint');
				return;
			}
			const errorMessage = error instanceof Error ? error.message : $t('task.errors.create_failed');
			errors.general = errorMessage;
			appStore.showErrorToast(errorMessage);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div
	class="mx-auto flex h-full w-full max-w-6xl min-w-0 flex-col gap-4 px-2 pt-6 pb-24 md:px-0 md:pb-6"
	data-testid="task-create-form"
>
	{#if draftPrompt}
		<div class="modal modal-open" data-testid="task-draft-choice">
			<div class="modal-box">
				<h3 class="text-lg font-bold">{$t('task.draft_title')}</h3>
				<p class="py-4">{$t('task.draft_body')}</p>
				<div class="modal-action">
					<button
						type="button"
						class="btn"
						onclick={async () => {
							draftPrompt = false;
							await store.clearDraft(false);
						}}
					>
						{$t('task.draft_new')}
					</button>
					<button type="button" class="btn btn-primary" onclick={() => (draftPrompt = false)}>
						{$t('task.draft_continue')}
					</button>
				</div>
			</div>
		</div>
	{/if}
	<div>
		<h2 class="text-2xl font-semibold sm:text-3xl">
			{$page.url.searchParams.get('edit') === 'true'
				? $t('task.edit_title')
				: $t('task.create_title')}
		</h2>
		<p class="text-base-content/70">
			{$page.url.searchParams.get('edit') === 'true'
				? $t('task.edit_description')
				: $t('task.create_description')}
		</p>
	</div>
	<div class="card bg-base-100 border-base-300 border shadow-sm">
		<div class="card-body gap-4 p-5">
			<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
				<span class="badge badge-outline">
					{$t('task.step')}
					{$STEPS.indexOf($store.currentStep) + 1}
					{$t('task.of')}
					{$STEPS.length}
				</span>
			</div>

			{#if isLoading || !isEditDataLoaded}
				<div class="flex justify-center py-6">
					<span class="loading loading-spinner loading-lg"></span>
				</div>
			{:else}
				<div class="flex flex-col gap-4">
					<!-- Always mount TaskBudget component to keep taskBudgetRef available -->
					<div class:hidden={$store.currentStep !== TaskStepEnum.BUDGET}>
						<TaskBudget {errors} {direction} bind:attachmentsToRemove bind:this={taskBudgetRef} />
					</div>

					{#if $store.currentStep === TaskStepEnum.BASICS}
						<TaskBasics {errors} {direction} bind:this={taskBasicsRef} />
					{:else if $store.currentStep === TaskStepEnum.LOCATION}
						<TaskLocation {errors} {direction} />
					{:else if $store.currentStep === TaskStepEnum.REVIEW}
						<TaskReview {direction} />
					{:else if $store.currentStep === TaskStepEnum.RECURRING}
						<TaskRecurring {errors} {direction} />
					{/if}

					<!-- Control buttons -->
					<div
						class="border-base-300 relative z-[60] flex flex-col gap-3 border-t pt-4 sm:flex-row sm:justify-between"
					>
						{#if $store.currentStep !== 'basics'}
							<button
								class="btn btn-secondary"
								data-testid="previous-task-step-btn"
								onclick={() => {
									store.previousStep();
									direction = 'backward';
								}}
							>
								{$t('task.back')}
							</button>
						{:else}
							<button class="btn btn-secondary" onclick={handleCancel}>
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="mr-1 h-4 w-4"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M6 18L18 6M6 6l12 12"
									/>
								</svg>
								{$t('common.back_to_tasks')}
							</button>
						{/if}

						{#if $STEPS.indexOf($store.currentStep) === $STEPS.length - 1}
							<button
								class="btn btn-primary {isSubmitting ? 'loading' : ''}"
								data-testid="submit-task-btn"
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
							<button data-testid="next-task-step-btn" class="btn btn-primary" onclick={handleNext}
								>{$t('task.next')}</button
							>
						{/if}
					</div>
				</div>

				{#if needsKey}
					<KeyUnlock
						testId="task-nsec-unlock"
						passkeyLabel={$t('wallet.unlock_with_key')}
						onunlock={async (nsec) => {
							try {
								await getMnemonic({ nsec });
								needsKey = false;
								errors.general = '';
								await handleSubmit();
							} catch (unlockError) {
								errors.general =
									unlockError instanceof Error
										? unlockError.message
										: $t('wallet.nsec_unlock_hint');
							}
						}}
					/>
				{/if}
				{#if errors.general}
					<div class="alert alert-outline alert-error">
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
