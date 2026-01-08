<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import {
		formatStandardDateShort,
		formatStandardDateTime,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import TranslatableTask from './TranslatableTask.svelte';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import { appStore } from '$lib/stores/app.store';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';

	type TaskFilterCategory =
		| 'waiting_for_bids'
		| 'bids_received'
		| 'tasks_in_progress'
		| 'tasks_completed'
		| 'tasks_disputed';

	const { task, btcPrice, activeFilter, getActionButtons } = $props<{
		task: Task;
		btcPrice: number;
		activeFilter: TaskFilterCategory;
		getActionButtons: (
			task: Task,
			category: TaskFilterCategory
		) => Array<{
			label: string;
			class: string;
			onclick: (e: any) => void;
			icon: string;
		}>;
	}>();

	function formatDateTimeReactive(dateString: string) {
		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
		// For deadlines, only show date, not time
		return formatStandardDateShort(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDateString: string, endDateString: string) {
		const localeToUse = $locale || 'en';
		
		// Parse dates - try to preserve time if present
		const startDate = new Date(startDateString);
		const endDate = new Date(endDateString);
		
		if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return '';
		}
		
		// Format with time using formatStandardDateTime
		const start = formatStandardDateTime(startDate, localeToUse);
		const end = formatStandardDateTime(endDate, localeToUse);
		
		return `${start} - ${end}`;
	}

	// Helper function to detect video files
	function isVideoFile(url: string): boolean {
		const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
		const urlLower = url.toLowerCase();
		return videoExtensions.some((ext) => urlLower.endsWith(ext));
	}

	// Generate share link
	const shareLink = $derived(() => {
		if (typeof window !== 'undefined' && task) {
			const taskIdentifier = (task as any).uniqueId || task.id;
			return `${window.location.origin}/tasks/${taskIdentifier}`;
		}
		return '';
	});

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

	// Helper function to format date with time for sharing
	function formatDateTimeForShare(dateString: string): string {
		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
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

	// Helper function to format share text with task details
	function formatShareText(): string {
		if (!task) return 'Check out this task';
		
		let text = '';
		
		// Add truncated description
		const description = task.description || '';
		if (description) {
			text += truncateText(description, 200);
		} else {
			text += 'Check out this task';
		}
		
		// Collect details
		const details: string[] = [];
		
		// Budget
		if (task.budget?.amount) {
			details.push(`💰 Budget:\n$${formatNumberWithTwoDecimals(task.budget.amount)}`);
		}
		
		// Deadline
		if (task.deadline) {
			const deadlineFormatted = formatDateTimeForShare(task.deadline);
			if (deadlineFormatted) {
				details.push(`📅 Deadline:\n${deadlineFormatted}`);
			}
		} else if (task.dateRange) {
			const dateRangeFormatted = formatDateRangeForShare(task.dateRange.start, task.dateRange.end);
			if (dateRangeFormatted) {
				details.push(`📅 Deadline:\n${dateRangeFormatted}`);
			}
		}
		
		// Location
		if (task.dropOffLocation?.displayName) {
			details.push(`📍 Location:\n${task.dropOffLocation.displayName}`);
		} else if (task.pickupLocation?.displayName) {
			details.push(`📍 Location:\n${task.pickupLocation.displayName}`);
		} else if (task.taskType === TaskTypeEnum.REMOTE) {
			details.push(`📍 Location:\n${$t('dashboard.task_details_by_task.remote')}`);
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
		const firstImage = task.attachments.find(att => !isVideoFile(att.url));
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
	const handleShare = async (e: MouseEvent) => {
		e.stopPropagation(); // Prevent card click
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
				appStore.showSuccessToast($t('dashboard.task_details_by_task.share_success') || 'Task shared successfully!');
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} catch (error) {
				// User cancelled sharing or error occurred
				if ((error as Error).name !== 'AbortError') {
					console.log('Share cancelled or failed:', error);
					// Fallback to copy link if share fails
					const success = await copyToClipboard(link);
					if (success) {
						shareSuccess = true;
						appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
						setTimeout(() => {
							shareSuccess = false;
						}, 2000);
					}
				}
			}
		} else {
			// Fallback: copy to clipboard
			const success = await copyToClipboard(link);
			if (success) {
				shareSuccess = true;
				appStore.showSuccessToast($t('dashboard.task_details_by_task.link_copied'));
				setTimeout(() => {
					shareSuccess = false;
				}, 2000);
			} else {
				appStore.showErrorToast($t('dashboard.task_details_by_task.link_copy_failed'));
			}
		}
	};
</script>

<div
	class="card bg-base-100 shadow-xl transition-shadow hover:shadow-lg"
>
	<div class="card-body">
		<!-- Task Title and Description -->
		<div class="flex flex-col justify-between gap-2">
			<div class="card-title line-clamp-1 text-lg flex items-center justify-between gap-2">
				<button
					class="hover:text-primary cursor-pointer text-left transition-colors flex-1 min-w-0"
					onclick={(e) => {
						e.stopPropagation();
						// Use uniqueId if available, fallback to id for backward compatibility
						const taskIdentifier = (task as any).uniqueId || task.id;
						goto(`/tasks/${taskIdentifier}`);
					}}
				>
					<TranslatableTask
						{task}
						showTitle={true}
						showDescription={false}
						showToggle={false}
						titleClass="text-lg font-semibold"
					/>
				</button>
				<!-- Share Button -->
				<button
					class="btn btn-ghost btn-sm btn-circle shrink-0 {shareSuccess ? 'btn-success' : ''}"
					onclick={handleShare}
					title={$t('dashboard.task_details_by_task.share_task')}
					aria-label={$t('dashboard.task_details_by_task.share_task')}
				>
					{#if shareSuccess}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5"
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
							class="h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							stroke-width="2"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
							/>
						</svg>
					{/if}
				</button>
			</div>
			<div class="text-base-content/60">
				<TranslatableTask
					{task}
					showTitle={false}
					showDescription={true}
					showToggle={false}
					descriptionClass="text-sm text-base-content/60 whitespace-pre-line line-clamp-2"
				/>
			</div>
		</div>

		<!-- Schedule and Budget -->
		<div class="flex w-full items-center justify-between">
			<!-- Left: Schedule -->
			<div class="flex items-center gap-2">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-base-content/60 h-4 w-4 shrink-0"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
				<div class="flex flex-col">
					{#if task.deadline}
						<small class="text-base-content/60 text-xs">
							{$t('dashboard.task.deadline.label')}
						</small>
						<span class="text-sm font-medium">
							{formatDateTimeReactive(task.deadline)}
						</span>
					{:else if task.dateRange}
						<small class="text-base-content/60 text-xs">
							{$t('dashboard.task_details_by_task.date_range')}
						</small>
						<span class="text-sm font-medium">
							{formatDateRangeReactive(task.dateRange.start, task.dateRange.end)}
						</span>
					{/if}
				</div>
			</div>

			<!-- Right: Budget -->
			<div class="">
				<div class="text-lg font-bold">
					${formatNumberWithTwoDecimals(task.budget.amount)}
					<div class="text-base-content/60 text-sm">
						{satsFromUsd(task.budget.amount, btcPrice)}
					</div>
				</div>
			</div>
		</div>

		<!-- Location -->
		<div class="flex w-full items-start gap-2">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="text-base-content/60 mt-1 h-4 w-4 shrink-0"
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
			<div class="flex min-w-0 flex-1 flex-col">
				<small class="text-base-content/60 text-xs">{$t('dashboard.task.location.details')}</small>
				<span class="line-clamp-2 text-sm font-medium">
					{#if task.dropOffLocation?.displayName}
						{task.dropOffLocation.displayName}
					{:else if task.pickupLocation?.displayName}
						{task.pickupLocation.displayName}
					{:else}
						{$t('dashboard.task.type.remote')}
					{/if}
				</span>
			</div>
		</div>

		<!-- Action Buttons -->
		<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: Empty space on larger screens, full width on mobile -->
			<div class="hidden md:block"></div>

			<!-- Right: Action Buttons -->
			<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
				{#each getActionButtons(task, activeFilter) as action}
					<button
						class="btn {action.class} w-full sm:w-auto"
						onclick={(e) => {
							action.onclick(e);
						}}
					>
						{#if action.icon === 'view_details'}
							<IconInformationOutline class="h-4 w-4" />
						{:else if action.icon === 'view_bids'}
							<IconEyeOutline class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
