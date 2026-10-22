<script lang="ts">
	import type { Task } from '$lib/types/task.d';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
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

	const statusBadge = $derived(getStatusBadge(task.status));
	const isSelected = $derived(selectedTask && selectedTask.id === task.id);
	const isOpen = $derived(task.status === TaskStatusEnum.OPEN);
	const isDeadlineExpired = $derived(() => {
		if (!task?.deadline) return false;
		const deadlineDate = new Date(task.deadline);
		const now = new Date();
		return now.toISOString().split('T')[0] > deadlineDate.toISOString().split('T')[0];
	});
	const canBid = $derived(isOpen && !hasBid);
	const showExpiredWarning = $derived(isDeadlineExpired() && isOpen);
	const taskId = $derived(task.id);
	const safeReportedEventId = $derived.by((): string | undefined => task.id ?? undefined);
	let resolvedCreatorName = $state<string | null>(null);
</script>

<div
	class="card bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg"
	class:bg-base-300={isSelected}
	class:border-primary={isSelected}
	class:border-2={isSelected}
	class:opacity-60={!isOpen}
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
						reportedEventId={safeReportedEventId}
						username={resolvedCreatorName ?? undefined}
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
				<UsdSatsDisplay amount={task.budget?.amount ?? 0} {btcPrice} />
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
				{#if showExpiredWarning}
					<span class="badge badge-warning badge-xs gap-1">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-3 w-3"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						{$t('dashboard.task_details_by_task.deadline_expired')}
					</span>
				{/if}
			</div>
			<div class="badge {statusBadge.color} badge-sm shrink-0 truncate">
				{$t(`common.status.${String(task.status ?? '').toLowerCase()}`) || statusBadge.text}
			</div>
		</div>

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
