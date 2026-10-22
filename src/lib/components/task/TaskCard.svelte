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
	import { resolve } from '$app/paths';
	import { prefetchTask } from '$lib/utils/tasks/task-detail-cache';
	import { taskDetailsPath } from '$lib/utils/tasks/task-path';

	let {
		task,
		selectedTask,
		btcPrice,
		onSelectTask,
		onViewTask,
		onSelectTaskForMap: _onSelectTaskForMap,
		isMapVisible: _isMapVisible,
		hasBid = false,
		onMuted
	} = $props<{
		task: Task;
		selectedTask: Task | null;
		btcPrice: number;
		onSelectTask: (task: Task) => Promise<void>;
		onViewTask: (task: Task) => Promise<void>;
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

	function categoryLabel(category: unknown): string {
		if (typeof category === 'string') return category;
		if (category && typeof category === 'object' && 'name' in category) {
			const name = (category as { name?: unknown }).name;
			return typeof name === 'string' ? name : '';
		}
		return '';
	}

	function categoryEachKey(category: unknown, index: number): string {
		if (typeof category === 'string') return `cat-${index}-${category}`;
		if (category && typeof category === 'object') {
			const record = category as { id?: unknown; name?: unknown };
			const id =
				typeof record.id === 'string' || typeof record.id === 'number' ? String(record.id) : '';
			const name = typeof record.name === 'string' ? record.name : '';
			return `cat-${index}-${id || name}`;
		}
		return `cat-${index}`;
	}
</script>

<div
	class="card bg-base-100 relative rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	class:opacity-60={!biddingOpen}
	data-task-id={taskId}
>
	<div class="card-body flex flex-col gap-2 rounded-xl p-4 md:p-4">
		<!-- Row 1: Title (left, top-aligned) | Share + ActionsMenu (right) -->
		<div class="flex items-start justify-between gap-2">
			<a
				href={resolve(taskDetailsPath(task.id) as '/')}
				class="card-surface-link focus-visible:ring-primary min-w-0 flex-1 rounded-sm focus-visible:ring-2 focus-visible:outline-none"
				data-testid="task-card-link"
				onpointerenter={() => prefetchTask(task)}
				onfocus={() => prefetchTask(task)}
			>
				<TranslatableTask
					{task}
					showDescription={false}
					titleClass="card-title line-clamp-2 text-lg font-semibold"
				/>
			</a>
			<span
				role="presentation"
				class="card-control flex shrink-0 items-center gap-1"
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
				{#each task.categories ?? [] as category, index (categoryEachKey(category, index))}
					<span class="badge badge-sm badge-info badge-outline">{categoryLabel(category)}</span>
				{/each}
				{#each task.tags ?? [] as tag, index (`tag-${index}-${String(tag)}`)}
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
			<div class="card-control flex min-w-0 flex-1 items-center gap-3">
				<UserInfoDisplay
					avatar={task.creator?.avatar}
					username={task.creator?.username}
					size="md"
					pubkey={task.npub}
					onResolvedName={(name) => (resolvedCreatorName = name)}
				/>
			</div>
			<div class="card-control flex w-full shrink-0 items-center gap-2 md:w-auto">
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
					onpointerenter={() => prefetchTask(task)}
					onfocus={() => prefetchTask(task)}
					onclick={(e) => {
						e.stopPropagation();
						onViewTask(task);
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

<style>
	/* One link covers the card. Controls sit above it so they are not inside the link. */
	.card-surface-link::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
	}

	.card-control {
		position: relative;
		z-index: 2;
	}
</style>
