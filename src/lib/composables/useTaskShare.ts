import type { Task, Attachment } from '$lib/types/task';
import { locale } from 'svelte-i18n';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { formatStandardDateShort, parseDateToLocalMidnight } from '$lib/utils/helpers/dateFormatter';
import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
import { copyToClipboard } from '$lib/utils/helpers/clipboard';
import { appStore } from '$lib/stores/app.store';
import { currentUserLanguage } from '$lib/stores/translation.store';
import { taskTranslationService } from '$lib/services/task-translation.service';
import { TaskTypeEnum } from '$lib/utils/enums/task.enum';

/**
 * Helper function to detect video files
 */
function isVideoFile(url: string): boolean {
	const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov'];
	const urlLower = url.toLowerCase();
	return videoExtensions.some((ext) => urlLower.endsWith(ext));
}

/**
 * Helper function to truncate text to specified length at last complete word
 */
function truncateText(text: string, maxLength: number = 200): string {
	if (!text || text.length <= maxLength) return text;
	
	const truncated = text.substring(0, maxLength);
	const lastSpace = truncated.lastIndexOf(' ');
	
	if (lastSpace > 0) {
		return truncated.substring(0, lastSpace) + '...';
	}
	return truncated + '...';
}

/**
 * Helper function to format date with time for sharing
 */
function formatDateTimeForShare(dateString: string): string {
	const date = parseDateToLocalMidnight(dateString) || new Date(dateString);
	if (!date || isNaN(date.getTime())) return '';
	
	const localeToUse = get(locale) || 'en';
	const formattedDate = formatStandardDateShort(date, localeToUse);
	const formattedTime = date.toLocaleTimeString(localeToUse, {
		hour: 'numeric',
		minute: '2-digit',
		hour12: true
	});
	return `${formattedDate} · ${formattedTime}`;
}

/**
 * Helper function to format date range for sharing
 */
function formatDateRangeForShare(startDateString: string, endDateString: string): string {
	const localeToUse = get(locale) || 'en';
	const startDate = new Date(startDateString);
	const endDate = new Date(endDateString);
	
	if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
		return '';
	}
	
	const start = formatStandardDateShort(startDate, localeToUse);
	const end = formatStandardDateShort(endDate, localeToUse);
	return `${start} - ${end}`;
}

/**
 * Helper function to format share text with task details
 * Uses translation based on user's selected language, not task's original language
 */
function formatShareText(task: Task): string {
	if (!task) return get(t)('common.share.check_out_task');
	
	// Get user's current language
	const userLang = get(currentUserLanguage) || 'en';
	
	// Get translated task content if available
	const translation = taskTranslationService.getStoredTranslation(task, userLang);
	
	// Use translated content if available, otherwise use original
	const description = translation?.translatedDescription || task.description || '';
	
	let text = '';
	
	// Add truncated description (translated if available)
	if (description) {
		text += truncateText(description, 200);
	} else {
		text += get(t)('common.share.check_out_task');
	}
	
	// Collect details
	const details: string[] = [];
	
	// Budget
	if (task.budget?.amount) {
		details.push(`💰 ${get(t)('common.share.budget')}:\n$${formatNumberWithTwoDecimals(task.budget.amount)}`);
	}
	
	// Deadline
	if (task.deadline) {
		const deadlineFormatted = formatDateTimeForShare(task.deadline);
		if (deadlineFormatted) {
			details.push(`📅 ${get(t)('common.share.deadline')}:\n${deadlineFormatted}`);
		}
	} else if (task.dateRange) {
		const dateRangeFormatted = formatDateRangeForShare(task.dateRange.start, task.dateRange.end);
		if (dateRangeFormatted) {
			details.push(`📅 ${get(t)('common.share.deadline')}:\n${dateRangeFormatted}`);
		}
	}
	
	// Location
	if (task.dropOffLocation?.displayName) {
		details.push(`📍 ${get(t)('common.share.location')}:\n${task.dropOffLocation.displayName}`);
	} else if (task.pickupLocation?.displayName) {
		details.push(`📍 ${get(t)('common.share.location')}:\n${task.pickupLocation.displayName}`);
	} else if (task.taskType === TaskTypeEnum.REMOTE) {
		details.push(`📍 ${get(t)('common.share.location')}:\n${get(t)('dashboard.task_details_by_task.remote')}`);
	}
	
	// Add details if any exist
	if (details.length > 0) {
		text += '\n\n' + details.join('\n\n');
	}
	
	return text;
}

/**
 * Helper function to fetch first image attachment as File
 */
async function getFirstImageFile(task: Task): Promise<File | null> {
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

/**
 * Generate share link for a task
 * @param task - The task object
 * @param taskId - Optional task ID (if task object is not available yet)
 * @returns Share link URL
 */
export function getTaskShareLink(task: Task | null, taskId?: string): string {
	if (typeof window !== 'undefined') {
		if (task) {
			// Always use the uniqueId from the task object for stable URLs
			// This ensures URLs remain stable even if task is edited (event ID changes, but uniqueId stays the same)
			const taskIdentifier = (task as any).uniqueId || task.id;
			return `${window.location.origin}/tasks/${taskIdentifier}`;
		} else if (taskId) {
			return `${window.location.origin}/tasks/${taskId}`;
		}
	}
	return '';
}

/**
 * Handle share functionality
 * @param task - The task to share
 * @param onSuccess - Callback to update success state
 * @param event - Optional mouse event to stop propagation if needed
 */
export async function handleTaskShare(
	task: Task | null,
	onSuccess: (success: boolean) => void,
	event?: MouseEvent
): Promise<void> {
	if (event) {
		event.stopPropagation(); // Prevent card click
	}
	
	if (!task) return;
	
	const link = getTaskShareLink(task);
	if (!link) return;

	if (navigator.share) {
		try {
			// Prepare share data
			const shareData: ShareData = {
				title: task?.title || 'Task Details',
				text: formatShareText(task),
				url: link
			};
			
			// Try to add first image if available
			const imageFile = await getFirstImageFile(task);
			if (imageFile) {
				// Check if files can be shared
				if (navigator.canShare && navigator.canShare({ files: [imageFile] })) {
					shareData.files = [imageFile];
				}
			}
			
			await navigator.share(shareData);
			onSuccess(true);
			appStore.showSuccessToast(get(t)('common.toast.link_copied'));
			setTimeout(() => {
				onSuccess(false);
			}, 2000);
		} catch (error) {
				// User cancelled sharing or error occurred
				if ((error as Error).name !== 'AbortError') {
					console.log('Share cancelled or failed:', error);
					// Fallback to copy full text with task details if share fails
					const shareText = formatShareText(task);
					const fullText = `${shareText}\n\n${link}`;
					const success = await copyToClipboard(fullText);
					if (success) {
						onSuccess(true);
						appStore.showSuccessToast(get(t)('common.toast.link_copied'));
						setTimeout(() => {
							onSuccess(false);
						}, 2000);
					}
				}
			}
		} else {
			// Fallback: copy to clipboard with full task details
			const shareText = formatShareText(task);
			const fullText = `${shareText}\n\n${link}`;
			const success = await copyToClipboard(fullText);
			if (success) {
				onSuccess(true);
				appStore.showSuccessToast(get(t)('common.toast.link_copied'));
				setTimeout(() => {
					onSuccess(false);
				}, 2000);
			} else {
				appStore.showErrorToast(get(t)('common.toast.link_copy_failed'));
			}
		}
}

