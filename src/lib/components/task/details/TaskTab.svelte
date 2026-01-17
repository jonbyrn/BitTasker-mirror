<script lang="ts">
	import type { Attachment, Task } from '$lib/types/task';
	import { goto } from '$app/navigation';
	import { deleteTask } from '$lib/nostr/task';
	import { taskStore } from '$lib/stores/task.store';
	import { myTasksStore } from '$lib/stores/task.store';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { onMount } from 'svelte';
	import { t } from 'svelte-i18n';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { formatStandardDate, formatStandardDateShort, formatStandardDateTime, parseDateToLocalMidnight } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { fade, scale } from 'svelte/transition';
	import { getContracts } from '$lib/utils/nostr-contract';
	import { escrow } from '$lib/utils/wallet/escrow';
	import { contractStore } from '$lib/stores/contract.store';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import LocationDetailsCard from '$lib/components/location/LocationDetailsCard.svelte';
	import { appStore } from '$lib/stores/app.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { taskTranslationService } from '$lib/services/task-translation.service';

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

	// Helper function to format date string with time (for timestamps like createdAt)
	function formatDateStringWithTime(date: string | number): string {
		const dateObj = typeof date === 'string' ? new Date(date) : new Date(date * 1000);
		if (!dateObj || isNaN(dateObj.getTime())) return '';
		return formatStandardDateTime(dateObj, $locale || 'en');
	}

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
	async function checkCanDeleteTask(): Promise<void> {
		if (!task?.id) {
			canDelete = false;
			return;
		}

		try {
			isCheckingDelete = true;
			
			// Check if task has any contracts (which means it has an escrow)
			const contracts = await getContracts({ taskIds: [task.id] });
			
			if (contracts.length === 0) {
				// No contracts found - task was never funded, can delete
				canDelete = true;
				return;
			}

			// Task has contracts - check if any escrow was funded
			for (const contract of contracts) {
				const fundingStatus = await escrow.checkEscrowFundingStatus(contract.escrowData.id);
				
				if (fundingStatus.error) {
					// Error checking escrow - be conservative and disallow deletion
					canDelete = false;
					return;
				}
				
				if (fundingStatus.wasFunded) {
					// Escrow was funded - cannot delete
					canDelete = false;
					return;
				}
			}
			
			// All escrows were never funded - can delete
			canDelete = true;
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

	// Generate share link for public route - always use uniqueId for stable URLs
	const shareLink = $derived(() => {
		if (typeof window !== 'undefined' && task) {
			// Always use the uniqueId from the task object for stable URLs
			// This ensures URLs remain stable even if task is edited (event ID changes, but uniqueId stays the same)
			const taskIdentifier = (task as any).uniqueId || task.id;
			return `${window.location.origin}/tasks/${taskIdentifier}`;
		}
		return '';
	});

	// Helper function to format date with time for sharing
	function formatDateTimeForShare(dateString: string): string {
		const date = parseDateToLocalMidnight(dateString) || new Date(dateString);
		if (!date || isNaN(date.getTime())) return '';
		
		const localeToUse = $locale || 'en';
		const formattedDate = formatStandardDateShort(date, localeToUse);
		const formattedTime = date.toLocaleTimeString(localeToUse, {
			hour: 'numeric',
			minute: '2-digit',
			hour12: true
		});
		return `${formattedDate} · ${formattedTime}`;
	}

	// Helper function to format date range for sharing
	function formatDateRangeForShare(startDateString: string, endDateString: string): string {
		const localeToUse = $locale || 'en';
		const startDate = new Date(startDateString);
		const endDate = new Date(endDateString);
		
		if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return '';
		}
		
		const start = formatStandardDateShort(startDate, localeToUse);
		const end = formatStandardDateShort(endDate, localeToUse);
		return `${start} - ${end}`;
	}

	// Helper function to truncate text to 200 characters at last complete word
	function truncateText(text: string, maxLength: number = 200): string {
		if (!text || text.length <= maxLength) return text;
		
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(' ');
		
		if (lastSpace > 0) {
			return truncated.substring(0, lastSpace) + '...';
		}
		return truncated + '...';
	}

	// Helper function to format share text with task details
	// Uses translation based on user's selected language, not task's original language
	function formatShareText(): string {
		if (!task) return $t('common.share.check_out_task');
		
		// Get user's current language
		const userLang = $currentUserLanguage || 'en';
		
		// Get translated task content if available
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		
		// Use translated content if available, otherwise use original
		const description = translation?.translatedDescription || task.description || '';
		
		let text = '';
		
		// Add truncated description (translated if available)
		if (description) {
			text += truncateText(description, 200);
		} else {
			text += $t('common.share.check_out_task');
		}
		
		// Collect details
		const details: string[] = [];
		
		// Budget
		if (task.budget?.amount) {
			details.push(`💰 ${$t('common.share.budget')}:\n$${formatNumberWithTwoDecimals(task.budget.amount)}`);
		}
		
		// Deadline
		if (task.deadline) {
			const deadlineFormatted = formatDateTimeForShare(task.deadline);
			if (deadlineFormatted) {
				details.push(`📅 ${$t('common.share.deadline')}:\n${deadlineFormatted}`);
			}
		} else if (task.dateRange) {
			const dateRangeFormatted = formatDateRangeForShare(task.dateRange.start, task.dateRange.end);
			if (dateRangeFormatted) {
				details.push(`📅 ${$t('common.share.deadline')}:\n${dateRangeFormatted}`);
			}
		}
		
		// Location
		if (task.dropOffLocation?.displayName) {
			details.push(`📍 ${$t('common.share.location')}:\n${task.dropOffLocation.displayName}`);
		} else if (task.pickupLocation?.displayName) {
			details.push(`📍 ${$t('common.share.location')}:\n${task.pickupLocation.displayName}`);
		} else if (task.taskType === TaskTypeEnum.REMOTE) {
			details.push(`📍 ${$t('common.share.location')}:\n${$t('dashboard.task_details_by_task.remote')}`);
		}
		
		// Add details if any exist
		if (details.length > 0) {
			text += '\n\n' + details.join('\n\n');
		}
		
		return text;
	}

	// Helper function to fetch first image attachment as File
	async function getFirstImageFile(): Promise<File | null> {
		if (!task?.attachments || task.attachments.length === 0) return null;
		
		// Find first non-video attachment (image)
		const firstImage = task.attachments.find((att: Attachment) => !isVideoFile(att.url));
		if (!firstImage) return null;
		
		try {
			// Fetch the image
			const response = await fetch(firstImage.url);
			if (!response.ok) return null;
			
			const blob = await response.blob();
			
			// Get file extension from URL or use default
			const urlParts = firstImage.url.split('.');
			const extension = urlParts.length > 1 ? urlParts[urlParts.length - 1].split('?')[0] : 'jpg';
			const mimeType = blob.type || `image/${extension}`;
			
			// Create File object
			const fileName = firstImage.alt || `task-image.${extension}`;
			const file = new File([blob], fileName, { type: mimeType });
			
			return file;
		} catch (error) {
			console.error('Failed to fetch image for sharing:', error);
			return null;
		}
	}

	// Handle share functionality
	let shareSuccess = $state(false);
	const handleShare = async () => {
		const link = shareLink();
		if (!link) return;

		if (navigator.share) {
			try {
				// Prepare share data
				const shareData: ShareData = {
					title: task?.title || 'Task Details',
					text: formatShareText(),
					url: link
				};
				
				// Try to add first image if available
				const imageFile = await getFirstImageFile();
				if (imageFile) {
					// Check if files can be shared
					if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
						shareData.files = [imageFile];
					}
				}
				
				await navigator.share(shareData);
				shareSuccess = true;
				appStore.showSuccessToast($t('common.toast.link_copied'));
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} catch (error) {
				// User cancelled sharing or error occurred
				if ((error as Error).name !== 'AbortError') {
					console.log('Share cancelled or failed:', error);
					// Fallback to copy full text with task details if share fails
					const shareText = formatShareText();
					const fullText = `${shareText}\n\n${link}`;
					const success = await copyToClipboard(fullText);
					if (success) {
						shareSuccess = true;
						appStore.showSuccessToast($t('common.toast.link_copied'));
						setTimeout(() => {
							shareSuccess = false;
						}, 2000);
					}
				}
			}
		} else {
			// Fallback: copy to clipboard with full task details
			const shareText = formatShareText();
			const fullText = `${shareText}\n\n${link}`;
			const success = await copyToClipboard(fullText);
			if (success) {
				shareSuccess = true;
				appStore.showSuccessToast($t('common.toast.link_copied'));
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} else {
				appStore.showErrorToast($t('common.toast.link_copy_failed'));
			}
		}
	};

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
					{formatStandardDate(parseDateToLocalMidnight(task.deadline) || new Date(task.deadline), $locale || 'en')}
				</p>
			</div>
		{:else if task.dateRange}
			<div>
				<small class="text-base-content/60 text-sm">
					{$t('dashboard.task_details_by_task.date_range')}
				</small>
				<p class="font-semibold">
					{formatStandardDateShort(parseDateToLocalMidnight(task.dateRange.start) || new Date(task.dateRange.start), $locale || 'en')} - {formatStandardDateShort(
						parseDateToLocalMidnight(task.dateRange.end) || new Date(task.dateRange.end),
						$locale || 'en'
					)}
				</p>
			</div>
		{/if}

		<div>
			<small class="text-base-content/60 text-sm"
				>{$t('dashboard.task_details_by_task.posted')}</small
			>
			<p class="font-semibold">{formatDateStringWithTime(task.createdAt)}</p>
		</div>
	</div>

	<!-- Task description -->
	<div class="mb-4">
		<small class="text-base-content/60"
			>{$t('dashboard.task_details_by_task.description_task')}</small
		>
		<div class="bg-base-200 rounded-2xl p-3">
			<div class="max-h-28 overflow-y-auto">
				<TranslatableTask 
					{task} 
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm whitespace-pre-line"
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
	<div class="space-y-3">
		{#if task.taskType === TaskTypeEnum.REMOTE}
			<!-- Remote task - show message that it can be completed remotely -->
			<div class="alert alert-outline alert-info">
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
				<span>{$t('dashboard.task_details_by_task.remote_location_description')}</span>
			</div>
		{:else}
			<!-- In-person task - show pickup and/or dropoff locations -->
			{#if task.pickupLocation && task.pickupLocation.latitude !== null && task.pickupLocation.longitude !== null && task.pickupLocation.locationLoaded}
				<LocationDetailsCard
					location={task.pickupLocation}
					label={$t('common.location.pickup_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
			{#if task.dropOffLocation && task.dropOffLocation.latitude !== null && task.dropOffLocation.longitude !== null && task.dropOffLocation.locationLoaded && task.dropOffLocation.displayName}
				<LocationDetailsCard
					location={task.dropOffLocation}
					label={$t('common.location.dropoff_location')}
					showDirections={true}
					showAddress={true}
				/>
			{/if}
		{/if}
	</div>

	<!-- Task attachments -->
	{#if task.attachments && task.attachments.length > 0}
		<div class={!isOwner ? 'mb-20 sm:mb-0' : ''}>
			<small class="text-base-content/60 mb-1 text-sm">
				{$t('dashboard.task_details_by_task.attachments')}
			</small>

			<div class="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-5">
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
		<div class="flex flex-col gap-2 sm:flex-row sm:justify-end">
			<!-- Share Button (always visible) -->
			<button 
				class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none transition-all duration-200 {shareSuccess
					? 'btn-success'
					: ''}" 
				onclick={handleShare}
				title={$t('dashboard.task_details_by_task.share_task')}
			>
				{#if shareSuccess}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						stroke-width="2"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4 shrink-0"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
						/>
					</svg>
				{/if}
				{$t('dashboard.task_details_by_task.share')}
			</button>

			{#if isOwner && task.status === TaskStatusEnum.OPEN}
				<button class="btn btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none" onclick={handleEditTask}>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="mr-1 h-4 w-4 shrink-0"
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
					class="btn btn-error btn-sm min-h-[40px] flex-1 sm:flex-none"
					onclick={showDeleteConfirmation}
					disabled={isDeleting || isCheckingDelete || !canDelete}
				>
					{#if isDeleting || isCheckingDelete}
						<span class="loading loading-spinner loading-sm"></span>
					{:else}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="mr-1 h-4 w-4 shrink-0"
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
				<button type="button" class="btn btn-error" onclick={confirmEditTask}>
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
