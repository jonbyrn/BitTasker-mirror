<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import TranslatableTask from './TranslatableTask.svelte';
	import TaskShareButton from './TaskShareButton.svelte';
	import TaskDeadlineDisplay from './TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from './TaskLocationDisplay.svelte';
	import IconInformationOutline from '~icons/mdi/information-outline';
	import IconEyeOutline from '~icons/mdi/eye-outline';
	import IconMessageOutline from '~icons/mdi/message-outline';
	import IconFileSign from '~icons/mdi/file-sign';

	type TaskFilterCategory =
		| 'open'
		| 'tasks_in_progress'
		| 'tasks_completed'
		| 'tasks_disputed'
		| 'tasks_cancelled';

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
			onclick: (e: MouseEvent | KeyboardEvent) => void;
			icon: string;
		}>;
	}>();

	const statusBadge = $derived(getStatusBadge(task.status));
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body rounded-xl p-4 md:p-4">
		<!-- Top Row: Title + Status Badge + Price -->
		<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
			<!-- Left: Title (flexible, takes available space) -->
			<div class="min-w-0 flex-1 pr-2 md:pr-4">
				<TranslatableTask
					{task}
					showDescription={true}
					showDescriptionToggle={false}
					descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
					titleClass="card-title line-clamp-2 text-lg font-semibold"
				/>
			</div>
			<!-- Right: Status Badge + Share Button + Price (aligned right) -->
			<div class="flex shrink-0 flex-col items-end gap-2">
				<div class="flex items-center gap-2">
					<div class="badge {statusBadge.color} badge-sm max-w-[100px] truncate text-center">
						{$t(`common.status.${task.status.toLowerCase()}`) || statusBadge.text}
					</div>
					<span
						role="presentation"
						class="ml-2 shrink-0"
						onclick={(e) => e.stopPropagation()}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.stopPropagation();
							}
						}}
					>
						<TaskShareButton {task} variant="circle" class="btn-xs" />
					</span>
				</div>
				<div class="text-right text-xl font-bold">
					{#if typeof task.budget?.amount === 'number' && Number.isFinite(task.budget.amount)}
						${formatNumberWithTwoDecimals(task.budget.amount)}

						<div class="text-base-content/60 text-sm">
							{satsFromUsd(task.budget.amount, btcPrice)}
						</div>
					{:else}
						<span class="text-base-content/60 text-sm font-normal">—</span>
					{/if}
				</div>
			</div>
		</div>

		<!-- Second Row: Deadline + Location -->
		<div class="mb-3 flex flex-col gap-3">
			<!-- Deadline -->
			<TaskDeadlineDisplay
				deadline={task.deadline}
				dateRangeStart={task.dateRange?.start}
				dateRangeEnd={task.dateRange?.end}
			/>

			<!-- Location -->
			<TaskLocationDisplay
				dropOffLocation={task.dropOffLocation}
				pickupLocation={task.pickupLocation}
			/>
		</div>

		<!-- Bottom Row: Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: empty spacer on desktop to align with title -->
			<div class="hidden md:block"></div>

			<!-- Right: Action buttons side-by-side -->
			<div class="flex w-full items-center gap-2 md:w-auto">
				<!-- Action buttons - next to each other on all breakpoints -->
				{#each getActionButtons(task, activeFilter) as action (action.label)}
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
						{:else if action.icon === 'message'}
							<IconMessageOutline class="h-4 w-4" />
						{:else if action.icon === 'contract'}
							<IconFileSign class="h-4 w-4" />
						{/if}
						{action.label}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>
