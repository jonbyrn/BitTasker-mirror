<script lang="ts">
	import type { Task } from '$lib/types/task.d';
	import { t } from 'svelte-i18n';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { canBidOnTask, getEffectiveStatus, isTaskExpired } from '$lib/utils/helpers/taskExpiry';
	import { authState } from '$lib/stores/auth.store';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import TaskShareButton from '$lib/components/task/TaskShareButton.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import IconPlus from '~icons/mdi/plus';
	import IconEye from '~icons/mdi/eye';

	let {
		task,
		selectedTask,
		btcPrice,
		onSelectTask,
		onViewTask,
		drawersLoaded,
		loadDrawerComponents,
		onSelectTaskForMap,
		isMapVisible,
		hasBid = false,
		onMuted
	} = $props<{
		task: Task;
		selectedTask: Task | null;
		btcPrice: number;
		onSelectTask: (task: Task) => Promise<void>;
		onViewTask: (task: Task) => Promise<void>;
		drawersLoaded: boolean;
		loadDrawerComponents: () => Promise<void>;
		onSelectTaskForMap?: (task: Task) => void;
		isMapVisible?: boolean;
		hasBid?: boolean;
		onMuted?: (removedCount: number) => void;
	}>();

	const effectiveStatus = $derived(getEffectiveStatus(task));
	const statusBadge = $derived(getStatusBadge(effectiveStatus));
	const budgetAmount = $derived(
		typeof task.budget?.amount === 'number' && Number.isFinite(task.budget.amount)
			? task.budget.amount
			: 0
	);
	const statusKey = $derived(effectiveStatus ? effectiveStatus.toLowerCase() : '');
	const isSelected = $derived(selectedTask && selectedTask.id === task.id);
	const biddingOpen = $derived(canBidOnTask(task));
	const expired = $derived(isTaskExpired(task));
	const canBid = $derived(biddingOpen && !hasBid);
	const taskId = $derived(task.id);
	let resolvedCreatorName = $state<string | null>(null);
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	class:opacity-60={!biddingOpen}
	class:cursor-pointer={isMapVisible}
	data-task-id={taskId}
	{...isMapVisible ? { role: 'button', tabindex: 0 } : {}}
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
	<div class="card-body flex flex-col gap-2 rounded-xl p-4 md:p-4">
		<!-- Row 1: Title (left, top-aligned) | Share + ActionsMenu (right) -->
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<TranslatableTask
					{task}
					showDescription={false}
					titleClass="card-title line-clamp-2 text-lg font-semibold"
				/>
			</div>
			<span
				role="presentation"
				class="flex shrink-0 items-center gap-1"
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.stopPropagation();
					}
				}}
			>
				<TaskShareButton {task} variant="circle" class="btn-xs" />
				{#if $authState.isAuthenticated && task.npub}
					<ActionsMenu
						contentType="task"
						reportedPubkey={task.npub}
						reportedEventId={taskId}
						username={resolvedCreatorName}
						{onMuted}
					/>
				{/if}
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
			<div class="shrink-0 text-right">
				<UsdSatsDisplay amount={budgetAmount} {btcPrice} />
			</div>
		</div>

		<!-- Row 3: Deadline (left) | Badge (right) -->
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2">
				<TaskDeadlineDisplay
					deadline={task.deadline}
					dateRangeStart={task.dateRange?.start}
					dateRangeEnd={task.dateRange?.end}
					showYear={false}
				/>
			</div>
			<div
				class="badge {statusBadge.color} badge-sm shrink-0 truncate"
				data-testid="task-status-badge"
			>
				{$t(`common.status.${statusKey}`) || statusBadge.text}
			</div>
		</div>

		{#if (task.categories?.length ?? 0) > 0 || (task.tags?.length ?? 0) > 0}
			<div class="flex max-h-12 flex-wrap gap-1.5 overflow-hidden">
				{#each task.categories ?? [] as category (category.id || category.name)}
					<span class="badge badge-sm badge-info badge-outline">{category.name}</span>
				{/each}
				{#each task.tags ?? [] as tag (tag)}
					<span class="badge badge-sm badge-ghost">{tag}</span>
				{/each}
			</div>
		{/if}

		<!-- Row 4: Location -->
		<div>
			<TaskLocationDisplay
				dropOffLocation={task.dropOffLocation}
				pickupLocation={task.pickupLocation}
			/>
		</div>

		<!-- Row 5: Creator info + Action Buttons -->
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="flex min-w-0 flex-1 items-center gap-3">
				<UserInfoDisplay
					avatar={task.creator?.avatar}
					username={task.creator?.username}
					size="md"
					pubkey={task.npub}
					onResolvedName={(name) => (resolvedCreatorName = name)}
				/>
			</div>
			<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
				<button
					class="btn btn-primary btn-sm flex-1 md:flex-none"
					class:btn-disabled={!canBid}
					disabled={!canBid}
					data-testid="bid-now"
					onclick={async (e) => {
						e.stopPropagation();
						if (!canBidOnTask(task) || !canBid) return;
						await onSelectTask(task);
					}}
					aria-label={expired
						? $t('dashboard.find_tasks.bidding_closed')
						: $t('dashboard.find_tasks.sign_up_to_bid_aria') || 'Sign up to bid on this task'}
				>
					<IconPlus class="h-4 w-4" />
					{hasBid
						? $t('dashboard.find_tasks.bid_sent') || 'Bid sent'
						: expired
							? $t('dashboard.find_tasks.bidding_closed')
							: $t('dashboard.find_tasks.sign_up_to_bid') || 'Bid'}
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
