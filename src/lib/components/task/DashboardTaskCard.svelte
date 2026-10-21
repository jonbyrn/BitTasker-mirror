<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { getEffectiveStatus } from '$lib/utils/helpers/taskExpiry';
	import TranslatableTask from './TranslatableTask.svelte';
	import { taskDetailsPath } from '$lib/utils/tasks/task-path';
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

	const effectiveStatus = $derived(getEffectiveStatus(task));
	const statusBadge = $derived(getStatusBadge(effectiveStatus));
</script>

<div class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
	<div class="card-body flex flex-col gap-2 rounded-xl p-4 md:p-4">
		<!-- Row 1: Title (left, top-aligned) | Share (right) -->
		<div class="flex items-start justify-between gap-2">
			<a href={taskDetailsPath(task.id)} class="min-w-0 flex-1">
				<TranslatableTask
					{task}
					showDescription={false}
					titleClass="card-title line-clamp-2 text-lg font-semibold"
				/>
			</a>
			<span
				role="presentation"
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

		<!-- Row 2: Description + Price (same row, aligned top) -->
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<TranslatableTask
					{task}
					showTitle={false}
					showDescription={true}
					showDescriptionToggle={false}
					descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-3"
				/>
			</div>
			<div class="shrink-0 text-right text-xl font-bold">
				${formatNumberWithTwoDecimals(task.budget.amount)}
				<div class="text-base-content/60 text-sm">
					{satsFromUsd(task.budget.amount, btcPrice)}
				</div>
			</div>
		</div>

		<!-- Row 3: Deadline (left) | Badge (right) -->
		<div class="flex items-center justify-between gap-3">
			<TaskDeadlineDisplay
				deadline={task.deadline}
				dateRangeStart={task.dateRange?.start}
				dateRangeEnd={task.dateRange?.end}
				showYear={false}
			/>
			<div class="badge {statusBadge.color} badge-sm shrink-0 truncate">
				{$t(`common.status.${effectiveStatus.toLowerCase()}`) || statusBadge.text}
			</div>
		</div>

		<!-- Row 4: Location -->
		<div>
			<TaskLocationDisplay
				dropOffLocation={task.dropOffLocation}
				pickupLocation={task.pickupLocation}
			/>
		</div>

		<!-- Row 5: Action Buttons -->
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
