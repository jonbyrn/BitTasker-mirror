<script lang="ts">
	import type { Task } from '$lib/types/task.d';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { getTaskId } from '$lib/utils/helpers/task-id';
	import TaskShareButton from '$lib/components/task/TaskShareButton.svelte';
	import type { Component } from 'svelte';
	
	// Icon imports
	import IconMapMarker from '~icons/mdi/map-marker';
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconPlus from '~icons/mdi/plus';
	import IconEye from '~icons/mdi/eye';
	import IconAccount from '~icons/mdi/account';
	import IconStar from '~icons/mdi/star';

	let {
		task,
		selectedTask,
		btcPrice,
		formatDateTimeReactive,
		formatDateRangeReactive,
		onSelectTask,
		onViewTask,
		drawersLoaded,
		loadDrawerComponents
	} = $props<{
		task: Task;
		selectedTask: Task | null;
		btcPrice: number;
		formatDateTimeReactive: (dateString: string) => string;
		formatDateRangeReactive: (start: string, end: string) => string;
		onSelectTask: (task: Task) => Promise<void>;
		onViewTask: (task: Task) => Promise<void>;
		drawersLoaded: boolean;
		loadDrawerComponents: () => Promise<void>;
	}>();

	const statusBadge = $derived(getStatusBadge(task.status));
	const isSelected = $derived(selectedTask && getTaskId(selectedTask) === getTaskId(task));
	const isOpen = $derived(task.status === TaskStatusEnum.OPEN);
	const taskId = $derived(getTaskId(task));
</script>

<div
	class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	class:opacity-60={!isOpen}
	role="button"
	tabindex={isOpen ? 0 : -1}
	aria-label={$t('find_tasks.view_task')}
	aria-pressed={isSelected}
	aria-current={isSelected}
	aria-disabled={!isOpen}
	data-task-id={taskId}
	onclick={() => {
		if (isOpen) {
			onSelectTask(task).catch(() => {
				// Error handling is done in onSelectTask
			});
		}
	}}
	onkeydown={(e) => {
		if ((e.key === 'Enter' || e.key === ' ') && isOpen) {
			e.preventDefault();
			onSelectTask(task).catch(() => {
				// Error handling is done in onSelectTask
			});
		}
	}}
>
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
								{formatDateTimeReactive(task.deadline)}
							</span>
						{:else if task.dateRange}
							<span class="line-clamp-2 text-sm font-medium">
								{formatDateRangeReactive(task.dateRange.start, task.dateRange.end)}
							</span>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Location -->
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
			</div>
		</div>

		<!-- Bottom Row: Avatar + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: Avatar, Username, Review Stars, and Share Button (mobile) -->
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<!-- Avatar -->
				<div class="avatar">
					<div class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full">
						{#if task.creator?.avatar}
							<img
								src={task.creator.avatar}
								alt={$t('dashboard.find_tasks.avatar_alt') || 'Avatar'}
								class="h-8 w-8 rounded-full object-cover"
							/>
						{:else}
							<div
								class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center"
							>
								{#if task.creator?.username}
									<span class="text-lg font-semibold">
										{task.creator.username.charAt(0).toUpperCase()}
									</span>
								{:else}
									<IconAccount class="text-base-content/60 h-6 w-6" />
								{/if}
							</div>
						{/if}
					</div>
				</div>

				<!-- Username and Review Stars -->
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate text-sm font-medium">
						{task.creator?.username || $t('dashboard.task_details_by_task.anonymous')}
					</span>
					<!-- Review Stars -->
					<div class="flex items-center">
						{#each Array(5) as _, i}
							<IconStar
								class="h-3 w-3 {i < (task.creator?.rating || 0)
									? 'text-yellow-400'
									: 'text-base-content/30'}"
							/>
						{/each}
						<span class="text-base-content/60 ml-1 text-xs">{task.creator?.rating || 0}</span>
					</div>
				</div>
				<!-- Share Button - Mobile Only (right side of row) -->
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

			<!-- Right: Share Button (tablet/desktop) + Action Buttons -->
			<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
				<!-- Share Button - Tablet/Desktop Only -->
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
				<button
					class="btn btn-primary btn-sm flex-1 md:flex-none"
					class:btn-disabled={!isOpen}
					disabled={!isOpen}
					onclick={async (e) => {
						e.stopPropagation();
						if (isOpen) {
							await onSelectTask(task);
						}
					}}
					aria-label={$t('dashboard.find_tasks.sign_up_to_bid_aria') ||
						'Sign up to bid on this task'}
				>
					<IconPlus class="h-4 w-4" />
					{isOpen
						? $t('dashboard.find_tasks.sign_up_to_bid') || 'Bid'
						: $t('dashboard.find_tasks.bidding_closed') || 'Bidding closed'}
				</button>

				<button
					class="btn btn-secondary btn-sm flex-1 md:flex-none"
					onclick={async (e) => {
						e.stopPropagation();
						if (!drawersLoaded) {
							await loadDrawerComponents();
						}
						await onViewTask(task);
					}}
					aria-label={$t('find_tasks.view_task')}
				>
					<IconEye class="h-4 w-4" />
					{$t('find_tasks.view_task')}
				</button>
			</div>
		</div>
	</div>
</div>
