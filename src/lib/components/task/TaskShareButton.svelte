<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { get } from 'svelte/store';
	import { locale } from 'svelte-i18n';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { taskBudgetAmount } from '$lib/utils/helpers/taskBudget';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import EntityShareButton from '$lib/components/shared/EntityShareButton.svelte';
	import type { EntitySharePayload } from '$lib/components/shared/entity-share';

	let {
		task,
		variant = 'default',
		class: className = ''
	} = $props<{
		task: Task | null;
		variant?: 'default' | 'circle' | 'icon-only';
		class?: string;
	}>();

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
		if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return '';
		return `${formatStandardDateShort(startDate, localeToUse)} - ${formatStandardDateShort(endDate, localeToUse)}`;
	}

	function formatShareText(task: Task): string {
		if (!task) return get(t)('common.share.check_out_task');
		const userLang = get(currentUserLanguage) || 'en';
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		const description = translation?.translatedDescription || task.description || '';
		let text = description ? truncateText(description, 200) : get(t)('common.share.check_out_task');
		const details: string[] = [];
		const budgetAmount = taskBudgetAmount(task);
		if (budgetAmount != null) {
			details.push(
				`💰 ${get(t)('common.share.budget')}:\n$${formatNumberWithTwoDecimals(budgetAmount)}`
			);
		}
		if (task.deadline) {
			const deadlineFormatted = formatDateTimeForShare(task.deadline);
			if (deadlineFormatted)
				details.push(`📅 ${get(t)('common.share.deadline')}:\n${deadlineFormatted}`);
		} else if (task.dateRange) {
			const dateRangeFormatted = formatDateRangeForShare(task.dateRange.start, task.dateRange.end);
			if (dateRangeFormatted)
				details.push(`📅 ${get(t)('common.share.deadline')}:\n${dateRangeFormatted}`);
		}
		if (task.dropOffLocation?.displayName) {
			details.push(`📍 ${get(t)('common.share.location')}:\n${task.dropOffLocation.displayName}`);
		} else if (task.pickupLocation?.displayName) {
			details.push(`📍 ${get(t)('common.share.location')}:\n${task.pickupLocation.displayName}`);
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

	function getTaskSharePayload(): EntitySharePayload | null {
		if (!task) return null;
		const link = getTaskShareLink(task);
		if (!link) return null;
		const userLang = get(currentUserLanguage) || 'en';
		const translation = taskTranslationService.getStoredTranslation(task, userLang);
		const shareTitle =
			translation?.translatedTitle || task?.title || get(t)('dashboard.task_details_by_task.title');
		return {
			title: shareTitle,
			text: formatShareText(task),
			url: link
		};
	}
</script>

<EntityShareButton
	{variant}
	class={className}
	presentation="task"
	getSharePayload={getTaskSharePayload}
	title={$t('dashboard.task_details_by_task.share_task')}
	ariaLabel={$t('dashboard.task_details_by_task.share_task')}
	buttonText={variant === 'default' ? $t('dashboard.task_details_by_task.share') : null}
	successToast={$t('common.toast.link_copied')}
	errorToast={$t('common.toast.link_copy_failed')}
/>
