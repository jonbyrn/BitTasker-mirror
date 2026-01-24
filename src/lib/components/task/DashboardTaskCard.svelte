<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import TranslatableTask from './TranslatableTask.svelte';
	import TaskShareButton from './TaskShareButton.svelte';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconMapMarker from '~icons/mdi/map-marker';

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
		getActionButtons: (task: Task, category: TaskFilterCategory) => Array<{
			label: string;
			class: string;
			onclick: (e: any) => void;
			icon: string;
		}>;
	}>();

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDate: Date, endDate: Date) {
		const start = formatStandardDateShort(startDate, $locale || 'en');
		const end = formatStandardDateShort(endDate, $locale || 'en');
		return `${start} - ${end}`;
	}

	const statusBadge = $derived(getStatusBadge(task.status));
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title (flexible, takes available space) -->
			<div class="flex-1 min-w-0 pr-2 md:pr-4">
				<TranslatableTask
					{task}
					showDescription={true}
					showDescriptionToggle={false}
					descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
					titleClass="card-title line-clamp-2 text-lg font-semibold"
				/>
			</div>
			<!-- Right: Status Badge + Price (fixed width, aligned right) -->
			<div class="flex shrink-0 flex-col items-end justify-between gap-4 w-[min(30%,120px)]">
				<div class="badge {statusBadge.color} badge-outline badge-sm">
					{$t(`common.status.${task.status.toLowerCase()}`) || statusBadge.text}
				</div>
				<div class="text-right text-xl font-bold mt-2">
					${formatNumberWithTwoDecimals(task.budget.amount)}

					<div class="text-base-content/60 text-sm">
						{satsFromUsd(task.budget.amount, btcPrice)}
					</div>
				</div>
			</div>
		</div>

		<!-- Second Row: Deadline + Location -->
		<div class="mb-3 flex flex-col gap-3">
			<!-- Deadline -->
			{#if task.deadline || task.dateRange}
				<div class="flex items-center gap-2">
					<IconClockOutline class="text-primary h-8 w-8 shrink-0" />
					<div class="flex min-w-0 flex-1">
						{#if task.deadline}
							<span class="line-clamp-2 text-sm font-medium">
								{formatDateTimeReactive(new Date(task.deadline))}
							</span>
						{:else if task.dateRange}
							<span class="line-clamp-2 text-sm font-medium">
								{formatDateRangeReactive(new Date(task.dateRange.start), new Date(task.dateRange.end))}
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Location + mobile share icon -->
			<div class="flex items-center gap-2">
				<IconMapMarker class="text-primary h-8 w-8 shrink-0" />
				<div class="flex min-w-0 flex-1">
					<span class="line-clamp-2 text-sm font-medium">
						{#if task.dropOffLocation?.displayName}
							{task.dropOffLocation.displayName}
						{:else if task.pickupLocation?.displayName}
							{task.pickupLocation.displayName}
						{:else}
							{$t('dashboard.task_details_by_task.remote')}
						{/if}
					</span>
				</div>
				<!-- Share button - mobile: on same row as location -->
				<span
					role="presentation"
					class="inline-block md:hidden shrink-0"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.stopPropagation();
						}
					}}
				>
					<TaskShareButton task={task} variant="icon-only" />
				</span>
			</div>
		</div>

		<!-- Bottom Row: Action Buttons with Share Button -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: empty spacer on desktop to align with title -->
			<div class="hidden md:block"></div>

			<!-- Right: Share button + Action buttons side-by-side -->
			<div class="flex w-full items-center gap-2 md:w-auto">
				<!-- Share button - tablet/desktop: to the left of action buttons -->
				<span
					role="presentation"
					class="hidden md:inline-block"
					onclick={(e) => e.stopPropagation()}
					onkeydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							e.stopPropagation();
						}
					}}
				>
					<TaskShareButton task={task} variant="icon-only" />
				</span>

				<!-- Action buttons - next to each other on all breakpoints -->
				{#each getActionButtons(task, activeFilter) as action}
					<button
						class="btn {action.class} flex-1 md:flex-none"
						onclick={(e) => {
							e.stopPropagation();
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
