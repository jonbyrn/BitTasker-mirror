<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { myTasksStore, TASKS_PER_PAGE } from '$lib/stores/task.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { findMyTasks } from '$lib/nostr/findMyTasks';
	import { goto } from '$app/navigation';
	import { appStore } from '$lib/stores/app.store';
	import TaskCard from './TaskCard.svelte';

	// MDI Icons for filters
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheck from '~icons/mdi/check';
	import IconRefresh from '~icons/mdi/refresh';
	// import { getBidsForTask } from '$lib/utils/nostr-bid';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
	}>();

	// Task filter categories
	type TaskFilterCategory =
		| 'waiting_for_bids' // OPEN with no bids
		| 'bids_received' // OPEN with bids
		| 'tasks_in_progress' // Active work
		| 'tasks_completed' // Terminal states
		| 'tasks_disputed'; // Dispute states

	let activeFilter = $state<TaskFilterCategory>('waiting_for_bids');
	let btcPrice = $state<number>(0);
	let isDropdownOpen = $state<boolean>(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Background bid checking state
	let bidStatusMap = $state<Map<string, boolean>>(new Map());
	let isCheckingBids = $state(false);
	let lastBidCheckTime = $state<number>(0);
	let lastCheckedTaskIds = $state<Set<string>>(new Set());
	const BID_CHECK_INTERVAL = 5000; // 5 seconds minimum between checks (reduced from 30s)

	// Pagination state
	let currentPage = $state(1);
	let pageSize = $state(20);

	// Filter options - reactive to language changes
	const filterOptions = $derived([
		{
			id: 'waiting_for_bids',
			label: $t('task.filters.waiting_for_bids'),
			icon: IconClockOutline
		},
		// {
		// 	id: 'bids_received',
		// 	label: $t('task.filters.bids_received'),
		// 	icon: IconClockCheckOutline
		// },
		{
			id: 'tasks_in_progress',
			label: $t('task.filters.in_progress'),
			icon: IconLightningBolt
		},
		{
			id: 'tasks_completed',
			label: $t('task.filters.completed'),
			icon: IconCheckCircle
		},
		{
			id: 'tasks_disputed',
			label: $t('task.filters.disputed'),
			icon: IconAlertCircleOutline
		}
	] as const);

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	/**
	 * TODO: Implement later in seperate file to avoid accidental use
	 * IMPORTATN: Func calls for nostr-bid which requires passkey prompts
	 * Background bid checking (non-blocking)
	 * Smart debouncing: only checks when task IDs actually change
	 */
	async function checkBidsInBackground(force: boolean = false) {
		const now = Date.now();

		// Prevent rapid successive calls (unless forced)
		if (isCheckingBids) return;
		if (!force && now - lastBidCheckTime < BID_CHECK_INTERVAL) return;

		const openTasks = $myTasksStore.items.filter((t) => t.status === TaskStatusEnum.OPEN);
		if (openTasks.length === 0) {
			lastCheckedTaskIds.clear();
			return;
		}

		// Get current task IDs
		const currentTaskIds = new Set(openTasks.map((t) => t.id));

		// Check if task IDs have actually changed (unless forced)
		if (!force) {
			const taskIdsChanged =
				currentTaskIds.size !== lastCheckedTaskIds.size ||
				Array.from(currentTaskIds).some((id) => !lastCheckedTaskIds.has(id)) ||
				Array.from(lastCheckedTaskIds).some((id) => !currentTaskIds.has(id));

			// If no meaningful change and we've checked recently, skip
			if (!taskIdsChanged && lastBidCheckTime > 0) {
				return;
			}
		}

		isCheckingBids = true;
		lastBidCheckTime = now;
		lastCheckedTaskIds = new Set(currentTaskIds);

		try {
			// Batch check all bids
			/* const { getBidsForTask } = await import('$lib/utils/nostr-bid');
			const allBids = await getBidsForTask(taskId);

			// Create map of task IDs with bids
			const tasksWithBids = new Set<string>();
			for (const bid of allBids) {
				if (bid?.taskId) {
					tasksWithBids.add(bid.taskId);
				}
			}

			// Update bid status map - only for current task IDs
			// First, remove entries for tasks that no longer exist
			for (const [taskId] of bidStatusMap) {
				if (!currentTaskIds.has(taskId)) {
					bidStatusMap.delete(taskId);
				}
			}
			
			// Then, update entries for current tasks
			for (const taskId of currentTaskIds) {
				bidStatusMap.set(taskId, tasksWithBids.has(taskId));
			} */
		} catch (error) {
			console.error('Error checking bids in background:', error);
		} finally {
			isCheckingBids = false;
		}
	}

	// Simple synchronous filtering
	let filteredTasks = $derived.by(() => {
		let filtered = $myTasksStore.items;

		// Filter by status category (synchronous)
		switch (activeFilter) {
			case 'waiting_for_bids':
				// Filter OPEN tasks - "waiting for bids" means all OPEN tasks regardless of bid status
				// This filter shows tasks that are open and waiting to receive bids
				return filtered.filter((t) => t.status === TaskStatusEnum.OPEN);

			case 'bids_received':
				// Filter OPEN tasks with bids
				return filtered.filter(
					(t) => t.status === TaskStatusEnum.OPEN && bidStatusMap.get(t.id) === true // Has bids
				);

			case 'tasks_in_progress':
				return filtered.filter(
					(t) =>
						t.status === TaskStatusEnum.IN_PROGRESS ||
						t.status === TaskStatusEnum.BID_ACCEPTED ||
						t.status === TaskStatusEnum.ESCROW_FUNDED ||
						t.status === TaskStatusEnum.RESCOPED ||
						t.status === TaskStatusEnum.RESCOPE_ACCEPTED
				);

			case 'tasks_completed':
				return filtered.filter(
					(t) =>
						t.status === TaskStatusEnum.COMPLETED ||
						t.status === TaskStatusEnum.CANCELLED ||
						t.status === TaskStatusEnum.REFUNDED
				);

			case 'tasks_disputed':
				return filtered.filter(
					(t) =>
						t.status === TaskStatusEnum.DISPUTED || t.status === TaskStatusEnum.DISPUTE_PROPOSAL
				);

			default:
				return filtered;
		}
	});

	// Paginated tasks
	let totalTasks = $derived(filteredTasks.length);
	let totalPages = $derived(Math.ceil(totalTasks / pageSize));
	let paginatedTasks = $derived.by(() => {
		const start = (currentPage - 1) * pageSize;
		const end = start + pageSize;
		return filteredTasks.slice(start, end);
	});

	// Navigation functions
	function goToPage(page: number) {
		if (page >= 1 && page <= totalPages) {
			currentPage = page;
			// Scroll to top
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}

	function nextPage() {
		if (currentPage < totalPages) {
			goToPage(currentPage + 1);
		}
	}

	function prevPage() {
		if (currentPage > 1) {
			goToPage(currentPage - 1);
		}
	}

	// Reset to page 1 when filter changes
	$effect(() => {
		activeFilter; // Watch filter changes
		currentPage = 1;
	});

	/**
	 * Select filter option
	 */
	function selectFilter(optionId: TaskFilterCategory) {
		activeFilter = optionId;
		isDropdownOpen = false;
	}

	/**
	 * Toggle dropdown
	 */
	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	/**
	 * Close dropdown when clicking outside
	 */
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const dropdownContainer = target.closest('.status-dropdown-container');
		if (!dropdownContainer && isDropdownOpen) {
			isDropdownOpen = false;
		}
	}

	/**
	 * Load tasks
	 */
	async function loadTasks() {
		try {
			isLoading = true;
			error = null;

			// Clear bid status map before loading to avoid stale data
			bidStatusMap.clear();
			lastCheckedTaskIds.clear();

			await findMyTasks({ page: 1, limit: TASKS_PER_PAGE });
			// Check bids in background after loading tasks
			await checkBidsInBackground(true);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Failed to load tasks';
			console.error('Error loading tasks:', err);
		} finally {
			isLoading = false;
		}
	}

	async function handleRefresh() {
		try {
			isLoading = true;
			error = null;

			// Clear bid status map before reloading to avoid stale data
			bidStatusMap.clear();
			lastCheckedTaskIds.clear();

			await findMyTasks({ page: 1, limit: TASKS_PER_PAGE });
			await checkBidsInBackground(true);
			// Show success message only if no error occurred
			if (!error) {
				appStore.showSuccessToast($t('dashboard.tasks.refresh_success'), 3000);
			} else {
				appStore.showErrorToast($t('dashboard.tasks.refresh_error'), 3000);
			}
		} catch (err) {
			console.error('Error refreshing tasks:', err);
			error = err instanceof Error ? err.message : 'Failed to refresh tasks';
			appStore.showErrorToast($t('dashboard.tasks.refresh_error'), 3000);
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Get action buttons for each category
	 */
	function getActionButtons(task: Task, category: TaskFilterCategory) {
		switch (category) {
			case 'waiting_for_bids':
			case 'bids_received':
				return [
					{
						label: $t('task.actions.view_details'),
						class: 'btn-primary btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							openTaskDrawer(task, 'details');
						},
						icon: 'view_details'
					},
					{
						label: $t('task.actions.view_bids'),
						class: 'btn-outline btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							goto(`/dashboard/task/${task.id}/bids`);
						},
						icon: 'view_bids'
					}
				];

			case 'tasks_in_progress':
				return [
					{
						label: $t('task.actions.mark_as_done'),
						class: 'btn-success btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							// TODO: Implement mark as done functionality
						},
						icon: 'mark_as_done'
					},
					{
						label: $t('task.actions.rescope'),
						class: 'btn-info btn-outline btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							// TODO: Implement rescope functionality
						},
						icon: 'rescope'
					}
				];

			case 'tasks_completed':
			case 'tasks_disputed':
				return [
					{
						label: $t('task.actions.view_details'),
						class: 'btn-primary btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							openTaskDrawer(task, 'details');
						},
						icon: 'view_details'
					}
				];

			default:
				return [];
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);

		// Load tasks and BTC price
		(async () => {
			await loadTasks();
			await fetchBtcPrice();
		})();

		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<div class="space-y-6">
	<!-- Status filter + refresh -->
	<div class="border-base-300/60 bg-base-100/40 rounded-3xl border p-4 mt-2 shadow-sm">
		<!-- Header with title and refresh button -->
		<div class="mb-3 flex items-center justify-between gap-2">
			<div class="space-y-1">
				<p class="text-base-content/70 text-xs font-semibold tracking-wide uppercase">
					{$t('dashboard.tasks.status_heading')}
				</p>
				<p class="text-base-content/70 hidden text-sm sm:block">
					{$t('dashboard.tasks.status_subheading')}
				</p>
			</div>

			<!-- Refresh button: icon only on mobile, with text on desktop -->
			<button
				class="btn btn-ghost btn-sm sm:btn-outline  gap-2"
				onclick={handleRefresh}
				disabled={isLoading}
				aria-label={$t('dashboard.tasks.refresh')}
			>
				{#if isLoading}
					<span class="loading loading-spinner loading-xs"></span>
					<span class="hidden sm:inline">{$t('dashboard.tasks.refreshing')}</span>
				{:else}
					<IconRefresh class="h-5 w-5" />
					<span class="hidden sm:inline">{$t('dashboard.tasks.refresh')}</span>
					{' '}
				{/if}
			</button>
		</div>

		<!-- Mobile: Subheading and dropdown -->
		<div class="mb-3 sm:hidden">
			<p class="text-base-content/70 mb-3 text-sm">
				{$t('dashboard.tasks.status_subheading')}
			</p>
			<div class="status-dropdown-container relative">
				<button
					class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full items-center justify-between rounded-3xl border px-4 py-2 transition-all duration-200"
					onclick={toggleDropdown}
				>
					<div class="flex items-center gap-2">
						{#each filterOptions as option}
							{#if activeFilter === option.id}
								{@const IconComponent = option.icon}
								<IconComponent class="h-5 w-5" />
							{/if}
						{/each}
						<span class="font-medium">
							{filterOptions.find((opt) => opt.id === activeFilter)?.label}
						</span>
					</div>
					<IconChevronDown
						class="h-5 w-5 transition-transform duration-200 {isDropdownOpen ? 'rotate-180' : ''}"
					/>
				</button>

				{#if isDropdownOpen}
					<div
						class="border-base-300 bg-base-100 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
					>
						{#each filterOptions as option}
							{@const IconComponent = option.icon}
							<button
								class="hover:bg-base-200 flex w-full items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {activeFilter ===
								option.id
									? 'bg-primary/10 text-primary'
									: 'text-base-content'}"
								onclick={() => selectFilter(option.id)}
							>
								<IconComponent
									class="h-5 w-5 {activeFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
								/>
								<span class="font-medium">{option.label}</span>
								{#if activeFilter === option.id}
									<IconCheck class="text-primary ml-auto h-5 w-5" />
								{/if}
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<!-- Desktop filters -->
		<div class="mt-4 hidden sm:block">
			<div class="flex flex-col gap-3 sm:flex-row">
				{#each filterOptions as option}
					{@const IconComponent = option.icon}
					<button
						class="flex btn btn-sm py-4 flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl text-center transition-all duration-200 {activeFilter ===
						option.id
							? 'text-primary bg-primary/10 border-primary/30 border'
							: 'bg-base-100/40 hover:bg-base-100/60 text-base-content/70'}"
						onclick={() => selectFilter(option.id)}
						aria-label={option.label}
					>
						<IconComponent class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}" />
						<span class="font-medium">{option.label}</span>
					</button>
				{/each}
			</div>
		</div>
	</div>

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex justify-center py-12">
			<div class="flex items-center gap-3">
				<span class="loading loading-spinner loading-md"></span>
				<span>{$t('dashboard.tasks.loading')}</span>
			</div>
		</div>
	{/if}

	<!-- Error State -->
	{#if error}
		<div class="alert alert-outline alert-error">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">{$t('dashboard.tasks.error_title')}</h3>
				<div class="text-xs">{error}</div>
			</div>
			<button class="btn btn-sm  btn-outline" onclick={loadTasks}>
				{$t('dashboard.tasks.retry')}
			</button>
		</div>
	{/if}

	<!-- Tasks List -->
	{#if !isLoading && !error}
		{#if filteredTasks.length === 0}
			<div class="py-12 text-center">
				<div class="mb-4">
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="text-base-content/30 mx-auto h-12 w-12"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
						/>
					</svg>
				</div>
				<h3 class="mb-2 text-lg font-semibold">
					{$myTasksStore.items.length === 0
						? $t('dashboard.tasks.no_tasks')
						: $t('dashboard.tasks.no_filtered_tasks')}
				</h3>
				<p class="text-base-content/70">
					{$myTasksStore.items.length === 0
						? $t('dashboard.tasks.no_tasks_description')
						: $t('dashboard.tasks.try_different_filters')}
				</p>
			</div>
		{:else}
			<div class="grid grid-cols-1 gap-5">
				{#each paginatedTasks as task (task.id)}
					<TaskCard
						{task}
						{btcPrice}
						{activeFilter}
						{getActionButtons}
					/>
				{/each}
			</div>

			<!-- Pagination Controls -->
			{#if totalPages > 1}
				<div class="flex items-center justify-center gap-2 py-6">
					<button class="btn btn-sm btn-ghost" onclick={prevPage} disabled={currentPage === 1}>
						{$t('common.pagination.previous')}
					</button>

					<div class="flex gap-1">
						{#each Array(totalPages) as _, i}
							{@const page = i + 1}
							<button
								class="btn btn-sm {currentPage === page ? 'btn-primary' : 'btn-ghost'}"
								onclick={() => goToPage(page)}
							>
								{page}
							</button>
						{/each}
					</div>

					<button
						class="btn btn-sm btn-ghost"
						onclick={nextPage}
						disabled={currentPage === totalPages}
					>
						{$t('common.pagination.next')}
					</button>
				</div>
			{/if}
		{/if}
	{/if}
</div>
