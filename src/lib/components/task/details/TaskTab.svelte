<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { goto } from '$app/navigation';
	import { deleteTask } from '$lib/nostr/task';
	import { taskStore } from '$lib/stores/task.store';
	import { myTasksStore } from '$lib/stores/task.store';
	import { format } from 'date-fns';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { formatStandardDate, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import { fade, scale } from 'svelte/transition';
	import TranslatableTask from '../TranslatableTask.svelte';
	import { getUserContracts } from '$lib/utils/nostr-bid';

	let { task, isOwner, onClose } = $props<{
		task: Task;
		isOwner: boolean;
		onClose: () => void;
	}>();

	let isDeleting = $state(false);
	let errorMessage = $state('');
	let btcPrice = $state<number>(63000); // Default fallback price
	let showEditConfirmation = $state(false);
	let showDeleteConfirm = $state(false);
	let canDelete = $state(true); // Default to true, will be checked
	let isCheckingDelete = $state(false);

	const formatDateString = (date: string | number): string => {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		return format(dateObj, 'M/d/yyyy, haaa');
	};

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	function handleEditTask() {
		showEditConfirmation = true;
	}

	function confirmEditTask() {
		const editTask = { ...task };
		['id', 'author'].forEach((key) => {
			delete editTask[key as keyof Task];
		});
		taskStore.saveEditTaskDraft(task?.id, task?.uniqueId, editTask);
		showEditConfirmation = false;
		goto(`/dashboard/create-task?edit=true`);
	}

	function cancelEditTask() {
		showEditConfirmation = false;
	}

	// Check if task can be deleted (similar to contract deletion logic)
	// Uses canDelete property already calculated by getUserContracts to avoid duplicate auth requests
	async function checkCanDeleteTask(): Promise<void> {
		if (!task?.id) {
			canDelete = false;
			return;
		}

		try {
			isCheckingDelete = true;
			
			// Check if task has any contracts (which means it has an escrow)
			// getUserContracts already calculates canDelete for each contract, avoiding duplicate auth
			const contracts = await getUserContracts({ taskIds: [task.id] });
			
			if (contracts.length === 0) {
				// No contracts found - task was never funded, can delete
				canDelete = true;
				return;
			}

			// Task has contracts - use canDelete property already calculated by getUserContracts
			// If ANY contract cannot be deleted (was funded), then task cannot be deleted
			const anyContractCannotDelete = contracts.some(contract => !contract.canDelete);
			
			if (anyContractCannotDelete) {
				// At least one contract was funded - cannot delete task
				canDelete = false;
			} else {
				// All contracts can be deleted (never funded) - can delete task
				canDelete = true;
			}
		} catch (error) {
			console.error('Error checking if task can be deleted:', error);
			// On error, be conservative and disallow deletion
			canDelete = false;
		} finally {
			isCheckingDelete = false;
		}
	}

	// Show delete confirmation
	function showDeleteConfirmation() {
		if (!canDelete) return;
		showDeleteConfirm = true;
	}

	// Delete task (after confirmation)
	async function handleDeleteTask() {
		if (!canDelete) return;
		
		showDeleteConfirm = false;
		try {
			isDeleting = true;
			if (!task?.id) return;
			await deleteTask(task.id);
			$myTasksStore.items = $myTasksStore.items.filter((t) => t.id !== task.id);
			onClose();
		} catch (error) {
			console.error('Failed to delete task:', error);
			errorMessage = 'Failed to delete task';
		} finally {
			isDeleting = false;
		}
	}

	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}

	onMount(() => {
		fetchBtcPrice();
		checkCanDeleteTask();
	});
</script>

<div class="space-y-6">
	<!-- Task header with status and edit button -->
	<!-- 	<div class="flex items-center justify-between">
		<div class="flex items-center gap-2">
			{#if task.status}
				<div
					class="badge {task.status === TaskStatusEnum.OPEN
						? 'badge-success'
						: task.status === TaskStatusEnum.COMPLETED
							? 'badge-primary'
							: 'badge-neutral'}"
				>
					{task.status}
				</div>
			{/if}
		</div>
	</div> -->

	<!-- Task details -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.budget')} - {task.budget.type}
			</small>

			<div class="text-lg font-bold">
				${formatNumberWithTwoDecimals(task.budget.amount)}

				<div class="text-base-content/60 text-sm">
					{satsFromUsd(task.budget.amount, btcPrice)}
				</div>
			</div>
		</div>

		<div>
			<small class="text-base-content/60 text-sm">
				{$t('dashboard.task_details_by_task.type')}
			</small>
			<p class="font-semibold">
				{task.taskType === TaskTypeEnum.REMOTE
					? $t('dashboard.task_details_by_task.remote')
					: $t('dashboard.task_details_by_task.in_person')}
			</p>
		</div>

		{#if task.deadline}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.deadline')}
				</small>
				<p class="font-semibold">
					{formatStandardDate(new Date(task.deadline), $locale || 'en')}, 12pm
				</p>
			</div>
		{:else if task.dateRange}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.date_range')}
				</small>
				<p class="font-semibold">
					{formatStandardDateShort(new Date(task.dateRange.start), $locale || 'en')} - {formatStandardDateShort(
						new Date(task.dateRange.end),
						$locale || 'en'
					)}
				</p>
			</div>
		{/if}

		<div>
			<small class="text-base-content/60 text-sm"
				>{$t('dashboard.task_details_by_task.posted')}</small
			>
			<p class="font-semibold">{formatDateString(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div class="mb-4">
		<small class="text-base-content/60"
			>{$t('dashboard.task_details_by_task.description_task')}</small
		>
		<div class="bg-base-200 rounded-2xl p-3">
			<div class="max-h-[7rem] overflow-y-auto">
				<TranslatableTask 
					{task} 
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm"
				/>
			</div>
		</div>
	</div>

	<!-- Task skills -->
	{#if task.skills?.length > 0}
		<div>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.required_skills')}
			</small>
			<div class="flex flex-wrap gap-1">
				{#each task.skills as skill}
					<span class="badge badge-primary badge-outline pb-[2px]">{skill}</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task categories -->
	{#if task?.categories?.length > 0}
		<div>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.categories')}
			</small>
			<div class="flex flex-wrap gap-1">
				{#each task.categories as category}
					<span class="badge badge-outline badge-info pb-[2px]">
						{typeof category === 'string' ? category : category.name}
					</span>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Task location -->
	{#if task.taskType === TaskTypeEnum.IN_PERSON}
		{#if task.pickupLocation}
			<div>
				<small class="text-base-content/60 mb-1 text-sm">
					{$t('dashboard.task_details_by_task.pickup_location')}
				</small>
				<div class="flex items-center gap-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/60 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
					<span>{task.pickupLocation.displayName || task.pickupLocation.zipCode}</span>
				</div>
			</div>
		{/if}

		{#if task.dropOffLocation && task.dropOffLocation.displayName}
			<div>
				<small class="text-base-content/60 mb-1 text-sm">
					{$t('dashboard.task_details_by_task.dropoff_location')}
				</small>
				<div class="flex items-center gap-1">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/60 h-5 w-5"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
						/>
					</svg>
					<span>{task.dropOffLocation.displayName || task.dropOffLocation.zipCode}</span>
				</div>
			</div>
		{/if}
	{:else}
		<div>
			<p class="text-base-content/60 mb-1 text-sm">{$t('dashboard.task_details_by_task.remote')}</p>
		</div>
	{/if}

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</small>

			<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
				{#each task.attachments as attachment, i}
					{#if isVideoFile(attachment.url)}
						<!-- Video -->
						<div class="bg-base-200 overflow-hidden rounded-lg pb-4">
							<video class="h-32 w-full object-cover" controls preload="metadata">
								<source src={attachment.url} type="video/mp4" />
								<track kind="captions" src="" label="English" />
								{$t('dashboard.task_details_by_task.video_not_supported')}
							</video>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{:else}
						<!-- Image -->
						<div class="overflow-hidden rounded-lg pb-4 bg-base-200">
							<img
								src={attachment.url}
								alt={attachment?.alt || 'Attachment'}
								class="h-32 w-full object-cover"
							/>
							<div class="p-3">
								<p class="truncate text-sm font-medium">
									{attachment?.alt || $t('dashboard.task_details_by_task.attachment')}
								</p>
								<p class="text-base-content/60 text-xs">
									{(attachment.size / 1024 / 1024).toFixed(2)} MB
								</p>
							</div>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	{/if}

	<div class="mb-20 space-y-3 md:mb-5">
		<!-- Action Buttons Row -->
		<div class="flex justify-end gap-2">
			{#if isOwner && task.status === TaskStatusEnum.OPEN}
				<button class="btn btn-primary btn-sm" onclick={handleEditTask}>
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
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.edit_task')}
				</button>
			{/if}
			
			<!-- Delete Button (always visible, disabled when canDelete is false) -->
			{#if isOwner}
				<button
					class="btn btn-error btn-sm"
					onclick={showDeleteConfirmation}
					disabled={isDeleting || isCheckingDelete || !canDelete}
				>
					{#if isDeleting || isCheckingDelete}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
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
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					{/if}
					{$t('dashboard.task_details_by_task.delete_task')}
				</button>
			{/if}
		</div>
	</div>
</div>

<!-- Edit Task Confirmation Modal -->
{#if showEditConfirmation}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-error/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-error h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">{$t('dashboard.task_details_by_task.edit_task_confirmation.title')}</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-4">
				<!-- Main Warning Box -->
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-sm text-error font-semibold mb-2">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.warning')}
					</p>
					<p class="text-sm text-error">
						{$t('dashboard.task_details_by_task.edit_task_confirmation.details')}
					</p>
				</div>

				<!-- Additional Information -->
				<div class="text-base-content/70 text-sm">
					<p>
						{$t('dashboard.task_details_by_task.edit_task_confirmation.message')}
					</p>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-6">
				<button type="button" class="btn btn-ghost flex-1" onclick={cancelEditTask}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.edit_task_confirmation.cancel')}
				</button>
				<button type="button" class="btn btn-error flex-1" onclick={confirmEditTask}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.edit_task_confirmation.confirm_edit')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={cancelEditTask}
			aria-label={$t('dashboard.task_details_by_task.edit_task_confirmation.title')}
		></button>
	</div>
{/if}

<!-- Delete Task Confirmation Modal -->
{#if showDeleteConfirm}
	<div class="modal modal-open" transition:fade={{ duration: 200 }}>
		<div class="modal-box max-w-md" transition:scale={{ duration: 200, start: 0.9 }}>
			<!-- Modal Header -->
			<div class="mb-6">
				<div class="mb-2 flex items-center gap-3">
					<div class="bg-error/10 flex h-10 w-10 items-center justify-center rounded-full">
						<svg class="text-error h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
							/>
						</svg>
					</div>
					<div>
						<h4 class="text-sm font-semibold">{$t('dashboard.task_details_by_task.delete_task_confirm_title')}</h4>
					</div>
				</div>
			</div>

			<!-- Content -->
			<div class="space-y-4">
				<!-- Main Warning Box -->
				<div class="bg-error/10 rounded-lg p-4">
					<p class="text-sm text-error font-semibold">
						{$t('dashboard.task_details_by_task.delete_task_confirm_message')}
					</p>
				</div>
			</div>

			<!-- Action Buttons -->
			<div class="border-base-300 flex gap-3 pt-6">
				<button type="button" class="btn btn-ghost flex-1" onclick={() => (showDeleteConfirm = false)}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M6 18L18 6M6 6l12 12"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.cancel')}
				</button>
				<button type="button" class="btn btn-error flex-1" onclick={handleDeleteTask}>
					<svg class="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
					{$t('dashboard.task_details_by_task.delete_task')}
				</button>
			</div>
		</div>
		<button
			class="modal-backdrop"
			onclick={() => (showDeleteConfirm = false)}
			aria-label={$t('dashboard.task_details_by_task.delete_task_confirm_title')}
		></button>
	</div>
{/if}
