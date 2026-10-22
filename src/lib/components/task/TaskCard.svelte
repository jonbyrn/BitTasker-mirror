<script lang="ts">
	import type { Task } from '$lib/types/task.d';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { displayTaskStatus } from '$lib/utils/helpers/taskDeadline';
	import { authState } from '$lib/stores/auth.store';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import UsdSatsDisplay from '$lib/components/shared/UsdSatsDisplay.svelte';
	import TaskShareButton from '$lib/components/task/TaskShareButton.svelte';
	import ActionsMenu from '$lib/components/moderation/ActionsMenu.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import UserInfoDisplay from '$lib/components/user/UserInfoDisplay.svelte';
	import { listingImage } from '$lib/utils/helpers/listing-image';
	import { MISSING_TASK_BUDGET, taskBudgetAmount } from '$lib/utils/helpers/taskBudget';
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

	const shownStatus = $derived(displayTaskStatus(task));
	const statusBadge = $derived(getStatusBadge(shownStatus));
	const isSelected = $derived(selectedTask && selectedTask.id === task.id);
	const isOpen = $derived(task.status === TaskStatusEnum.OPEN);
	const isExpired = $derived(shownStatus === 'EXPIRED');
	const canBid = $derived(isOpen && !hasBid && !isExpired);
	const showExpiredWarning = $derived(isExpired);
	const taskId = $derived(task.id);
	const cover = $derived(listingImage(task.attachments));
	const budgetAmount = $derived(taskBudgetAmount(task));
	const safeReportedEventId = $derived.by((): string | undefined => task.id ?? undefined);
	let resolvedCreatorName = $state<string | null>(null);
</script>

<div
	class="card bt-card bg-base-100 w-full max-w-full min-w-0 overflow-hidden rounded-xl shadow-md"
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
	{#if cover}
		<img
			src={cover}
			alt=""
			class="h-36 w-full object-cover"
			loading="lazy"
			data-testid="listing-thumbnail"
		/>
	{/if}
	<div class="card-body flex min-w-0 flex-col gap-2 rounded-xl p-4 md:p-4">
		<!-- Row 1: Title (left, top-aligned) | Share + ActionsMenu (right) -->
		<div class="flex min-w-0 items-start justify-between gap-2">
			<div class="min-w-0 flex-1">
				<TranslatableTask
					{task}
					showDescription={false}
					titleClass="card-title line-clamp-2 min-w-0 whitespace-normal text-lg font-semibold"
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

		<!-- Row 2: Description, then price underneath on a phone -->
		<div class="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
			<div class="min-w-0 flex-1">
				<TranslatableTask
					{task}
					showTitle={false}
					showDescription={true}
					showDescriptionToggle={false}
					descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-3"
				/>
			</div>
			<div class="min-w-0 sm:shrink-0 sm:text-right">
				{#if budgetAmount != null}
					<UsdSatsDisplay amount={budgetAmount} {btcPrice} />
				{:else}
					<span class="text-base-content/60 text-sm">{MISSING_TASK_BUDGET}</span>
				{/if}
			</div>
		</div>

		<!-- Row 3: Deadline (left) | Badge (right) -->
		<div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
			<div class="flex min-w-0 items-center gap-2">
				<TaskDeadlineDisplay
					deadline={task.deadline}
					dateRangeStart={task.dateRange?.start}
					dateRangeEnd={task.dateRange?.end}
					showYear={false}
				/>
			</div>
			<div class="badge {statusBadge.color} badge-sm max-w-full whitespace-normal">
				{$t(`common.status.${shownStatus.toLowerCase()}`) || statusBadge.text}
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
			<div class="flex w-full min-w-0 flex-wrap items-center gap-2 md:w-auto">
				{#if !showExpiredWarning}
					<button
						class="btn btn-primary btn-sm min-w-0 flex-1 whitespace-normal md:flex-none"
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
						<IconPlus class="h-4 w-4 shrink-0" />
						{hasBid
							? $t('dashboard.find_tasks.bid_sent') || 'Bid sent'
							: $t('dashboard.find_tasks.sign_up_to_bid') || 'Bid'}
					</button>
				{/if}
				<button
					class="btn btn-secondary btn-sm min-w-0 flex-1 whitespace-normal md:flex-none"
					onclick={async (e) => {
						e.stopPropagation();
						if (!drawersLoaded) {
							await loadDrawerComponents();
						}
						await onViewTask(task);
					}}
					aria-label={$t('find_tasks.view_task')}
				>
					<IconEye class="h-4 w-4 shrink-0" />
					{$t('find_tasks.view_task')}
				</button>
			</div>
		</div>
	</div>
</div>
