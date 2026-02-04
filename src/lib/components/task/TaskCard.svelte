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
	import IconPlus from '~icons/mdi/plus';
	
	// Reusable display components
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconEye from '~icons/mdi/eye';

	let {
		task,
		selectedTask,
		btcPrice,
		formatDateTimeReactive,
		formatDateRangeReactive,
		onSelectTask,
		onViewTask,
		drawersLoaded,
		loadDrawerComponents,
		onSelectTaskForMap,
		isMapVisible,
		hasBid = false
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
		onSelectTaskForMap?: (task: Task) => void;
		isMapVisible?: boolean;
		hasBid?: boolean;
	}>();

	const statusBadge = $derived(getStatusBadge(task.status));
	const isSelected = $derived(selectedTask && getTaskId(selectedTask) === getTaskId(task));
	const isOpen = $derived(task.status === TaskStatusEnum.OPEN);
	const canBid = $derived(isOpen && !hasBid);
	const taskId = $derived(getTaskId(task));
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	class:opacity-60={!isOpen}
	class:cursor-pointer={isMapVisible}
	data-task-id={taskId}
	{...(isMapVisible ? { role: 'button', tabindex: 0 } : {})}
	onclick={(e) => {
		// Only handle card click if map is visible and click didn't come from a button
		if (isMapVisible && onSelectTaskForMap && !(e.target as HTMLElement).closest('button')) {
			onSelectTaskForMap(task);
		}
	}}
	onkeydown={(e) => {
		// Handle keyboard interaction when map is visible
		if (isMapVisible && onSelectTaskForMap && (e.key === 'Enter' || e.key === ' ')) {
			e.preventDefault();
			if (!(e.target as HTMLElement).closest('button')) {
				onSelectTaskForMap(task);
			}
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
				<div class="badge {statusBadge.color} badge-sm max-w-full truncate text-center">
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

		<!-- Bottom Row: Avatar + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<!-- Left: Avatar, Username, Review Stars, and Share Button (mobile) -->
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<UserInfoDisplay
					avatar={task.creator?.avatar}
					username={task.creator?.username}
					rating={task.creator?.rating || 0}
					size="md"
					pubkey={task.npub}
					memberSince={task.createdAt}
				/>
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
					class:btn-disabled={!canBid}
					disabled={!canBid}
					onclick={async (e) => {
						e.stopPropagation();
						if (canBid) {
							await onSelectTask(task);
						}
					}}
					aria-label={$t('dashboard.find_tasks.sign_up_to_bid_aria') ||
						'Sign up to bid on this task'}
				>
					<IconPlus class="h-4 w-4" />
					{hasBid
						? $t('dashboard.find_tasks.bid_sent') || 'Bid sent'
						: isOpen
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
