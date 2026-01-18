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
	import TaskShareButton from './TaskShareButton.svelte';

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
		
		// Parse dates
		const startDate = new Date(startDateString);
		const endDate = new Date(endDateString);
		
		if (!startDate || !endDate || isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
			return '';
		}
		
		// Format with short month name and no time using formatStandardDateShort
		const start = formatStandardDateShort(startDate, localeToUse);
		const end = formatStandardDateShort(endDate, localeToUse);
		
		return `${start} - ${end}`;
	}

</script>

<div
	class="card bg-base-100 shadow-xl transition-shadow hover:shadow-lg"
>
	<div class="card-body">
		<!-- Task Title and Description -->
		<div class="flex flex-col justify-between gap-2">
			<div class="card-title line-clamp-1 text-lg flex items-center justify-between gap-2">
				<div class="flex-1 min-w-0">
					<button
						class="hover:text-primary cursor-pointer text-left transition-colors inline-block"
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
				</div>
				<!-- Share Button -->
				<TaskShareButton {task} variant="circle" />
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
