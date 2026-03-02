<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { locale } from 'svelte-i18n';
	import { formatStandardDateShort, parseDateToLocalMidnight } from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { copyToClipboard } from '$lib/utils/helpers/clipboard';
	import { appStore } from '$lib/stores/app.store';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import { Capacitor } from '@capacitor/core';

	let { task, variant = 'default', class: className = '' } = $props<{
		task: Task | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

	let shareSuccess = $state(false);

	function truncateText(text: string, maxLength = 200): string {
		if (!text || text.length <= maxLength) return text;
		const truncated = text.substring(0, maxLength);
		const lastSpace = truncated.lastIndexOf(' ');
		if (lastSpace > 0) return truncated.substring(0, lastSpace) + '...';
		return truncated + '...';
	}

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

	function formatDateRangeForShare(startDateString: string, endDateString: string): string {
		const localeToUse = get(locale) || 'en';
		const startDate = new Date(startDateString);
		const endDate = new Date(endDateString);
		if (
			!startDate ||
			!endDate ||
			isNaN(startDate.getTime()) ||
			isNaN(endDate.getTime())
		)
			return '';
		return `${formatStandardDateShort(startDate, localeToUse)} - ${formatStandardDateShort(endDate, localeToUse)}`;
	}

	function formatShareText(task: Task): string {
		if (!task) return get(t)('common.share.check_out_task');
		const userLang = get(currentUserLanguage) || 'en';
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		const description = translation?.translatedDescription || task.description || '';
		let text = description ? truncateText(description, 200) : get(t)('common.share.check_out_task');
		const details: string[] = [];
		if (task.budget?.amount) {
			details.push(
				`💰 ${get(t)('common.share.budget')}:\n$${formatNumberWithTwoDecimals(task.budget.amount)}`
			);
		}
		if (task.deadline) {
			const deadlineFormatted = formatDateTimeForShare(task.deadline);
			if (deadlineFormatted)
				details.push(`📅 ${get(t)('common.share.deadline')}:\n${deadlineFormatted}`);
		} else if (task.dateRange) {
			const dateRangeFormatted = formatDateRangeForShare(
				task.dateRange.start,
				task.dateRange.end
			);
			if (dateRangeFormatted)
				details.push(`📅 ${get(t)('common.share.deadline')}:\n${dateRangeFormatted}`);
		}
		if (task.dropOffLocation?.displayName) {
			details.push(
				`📍 ${get(t)('common.share.location')}:\n${task.dropOffLocation.displayName}`
			);
		} else if (task.pickupLocation?.displayName) {
			details.push(
				`📍 ${get(t)('common.share.location')}:\n${task.pickupLocation.displayName}`
			);
		} else if (task.taskType === TaskTypeEnum.REMOTE) {
			details.push(
				`📍 ${get(t)('common.share.location')}:\n${get(t)('dashboard.task_details_by_task.remote')}`
			);
		}
		if (details.length > 0) text += '\n\n' + details.join('\n\n');
		return text;
	}

	function getTaskShareLink(task: Task | null, taskId?: string): string {
		if (typeof window !== 'undefined') {
			if (task) return `${window.location.origin}/tasks/${task.id}`;
			if (taskId) return `${window.location.origin}/tasks/${taskId}`;
		}
		return '';
	}

	async function handleTaskShare(
		task: Task | null,
		onSuccess: (success: boolean) => void,
		event?: MouseEvent
	): Promise<void> {
		if (event) event.stopPropagation();
		if (!task) return;
		const link = getTaskShareLink(task);
		if (!link) return;
		const userLang = get(currentUserLanguage) || 'en';
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		const shareTitle =
			translation?.translatedTitle ||
			task?.title ||
			get(t)('dashboard.task_details_by_task.title');
		const shareText = formatShareText(task);

		if (Capacitor.isNativePlatform()) {
			try {
				const { Share } = await import('@capacitor/share');
				await Share.share({
					title: shareTitle,
					text: shareText,
					url: link,
					dialogTitle: shareTitle
				});
				onSuccess(true);
				appStore.showSuccessToast(get(t)('common.toast.link_copied'));
				setTimeout(() => onSuccess(false), 2000);
				return;
			} catch (error) {
				if (
					(error as Error).name !== 'AbortError' &&
					!(error as Error).message?.includes('cancel')
				) {
					/* fall through to Web Share API */
				}
			}
		}

		if (typeof navigator !== 'undefined' && navigator.share) {
			try {
				await navigator.share({
					title: shareTitle,
					text: shareText,
					url: link
				});
				onSuccess(true);
				appStore.showSuccessToast(get(t)('common.toast.link_copied'));
				setTimeout(() => onSuccess(false), 2000);
				return;
			} catch (error) {
				if ((error as Error).name !== 'AbortError') {
					/* fall through to copy */
				}
			}
		}

		const fullText = `${shareText}\n\n${link}`;
		const success = await copyToClipboard(fullText);
		if (success) {
			onSuccess(true);
			appStore.showSuccessToast(get(t)('common.toast.link_copied'));
			setTimeout(() => onSuccess(false), 2000);
		} else {
			appStore.showErrorToast(get(t)('common.toast.link_copy_failed'));
		}
	}

	const handleClick = async (e: MouseEvent) => {
		await handleTaskShare(task, (success) => {
			shareSuccess = success;
		}, e);
	};

	// Determine button classes based on variant
	const buttonClasses = $derived(() => {
		const baseClasses = 'btn transition-all duration-200';
		const successClass = shareSuccess ? 'btn-success' : '';
		
		if (variant === 'circle') {
			return `${baseClasses} btn-ghost btn-sm btn-circle shrink-0 ${successClass} ${className}`;
		} else if (variant === 'icon-only') {
			return `${baseClasses} btn-ghost btn-sm ${successClass} ${className}`;
		} else {
			// default variant - button with text
			return `${baseClasses} btn-primary btn-sm min-h-[40px] flex-1 sm:flex-none gap-2 ${successClass} ${className}`;
		}
	});
</script>

<button
	class={buttonClasses()}
	onclick={handleClick}
	title={$t('dashboard.task_details_by_task.share_task')}
	aria-label={$t('dashboard.task_details_by_task.share_task')}
>
	{#if shareSuccess}
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="h-5 w-5 {variant === 'default' ? '' : variant === 'circle' ? '' : 'mr-1 h-4 w-4 shrink-0'}"
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
			class="h-5 w-5 {variant === 'default' ? '' : variant === 'circle' ? '' : 'mr-1 h-4 w-4 shrink-0'}"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
			stroke-width={variant === 'default' ? '2' : '2'}
		>
			{#if variant === 'circle' || variant === 'icon-only'}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.935-2.186 2.25 2.25 0 00-3.935 2.186z"
				/>
			{:else}
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
				/>
			{/if}
		</svg>
	{/if}
	{#if variant === 'default'}
		<span>{$t('dashboard.task_details_by_task.share')}</span>
	{/if}
</button>

