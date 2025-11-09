<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { myTasksStore } from '$lib/stores/task.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import { formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { browser } from '$app/environment';
	import { onDestroy } from 'svelte';
	import { findMyTasks } from '$lib/nostr/findMyTasks';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	// MDI Icons for filters
	import IconClockOutline from '~icons/mdi/clock-outline';
	import IconClockCheckOutline from '~icons/mdi/clock-check-outline';
	import IconLightningBolt from '~icons/mdi/lightning-bolt';
	import IconCheckCircle from '~icons/mdi/check-circle';
	import IconAlertCircleOutline from '~icons/mdi/alert-circle-outline';
	import IconChevronDown from '~icons/mdi/chevron-down';
	import IconCheck from '~icons/mdi/check';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
	}>();

	// Task filter categories
	type TaskFilterCategory = 
		| 'waiting_for_bids'      // OPEN with no bids
		| 'bids_received'         // OPEN with bids
		| 'tasks_in_progress'     // Active work
		| 'tasks_completed'       // Terminal states
		| 'tasks_disputed';       // Dispute states

	let activeFilter = $state<TaskFilterCategory>('waiting_for_bids');
	let btcPrice = $state<number>(0);
	let isDropdownOpen = $state<boolean>(false);
	
	// Cache for bid status per task
	let taskBidStatusCache = $state<Map<string, boolean>>(new Map());

	// Infinite scroll variables
	let infiniteScrollObserver: IntersectionObserver | null = null;
	// svelte-ignore non_reactive_update
		let scrollTarget: HTMLElement | null = null;

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDate: Date, endDate: Date) {
		const start = formatStandardDateShort(startDate, $locale || 'en');
		const end = formatStandardDateShort(endDate, $locale || 'en');
		return `${start} - ${end}`;
	}

	// Filter options - reactive to language changes
	const filterOptions = $derived([
		{ 
			id: 'waiting_for_bids', 
			label: $t('task.filters.waiting_for_bids'),  // "Waiting"
			icon: IconClockOutline
		},
		{ 
			id: 'bids_received', 
			label: $t('task.filters.bids_received'),      // "Bids"
			icon: IconClockCheckOutline
		},
		{ 
			id: 'tasks_in_progress', 
			label: $t('task.filters.in_progress'),        // "In Progress"
			icon: IconLightningBolt
		},
		{ 
			id: 'tasks_completed', 
			label: $t('task.filters.completed'),          // "Completed"
			icon: IconCheckCircle
		},
		{ 
			id: 'tasks_disputed', 
			label: $t('task.filters.disputed'),           // "Disputed"
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
			throw new Error('Unable to fetch Bitcoin price. Please try again later.');
		}
	}

	/**
	 * Check if task has bids (with caching)
	 */
	async function taskHasBids(taskId: string): Promise<boolean> {
		// Check cache first
		if (taskBidStatusCache.has(taskId)) {
			return taskBidStatusCache.get(taskId)!;
		}
		
		// Check bids
		try {
			const { getBidsForTaskOptimized } = await import('$lib/utils/nostr-bid');
			const bids = await getBidsForTaskOptimized(taskId);
			const hasBids = bids.length > 0;
			taskBidStatusCache.set(taskId, hasBids);
			return hasBids;
		} catch (error) {
			console.error('Error checking bids:', error);
			taskBidStatusCache.set(taskId, false);
			return false;
		}
	}

	/**
	 * Filter tasks based on selected category
	 * Now includes async bid checking for "waiting_for_bids" and "bids_received"
	 */
	async function getFilteredTasks(tasks: Task[], filter: TaskFilterCategory): Promise<Task[]> {
		switch (filter) {
			case 'waiting_for_bids':
				// OPEN tasks with no bids
				const waitingTasks = tasks.filter((task) => task.status === TaskStatusEnum.OPEN);
				const waitingResults = await Promise.all(
					waitingTasks.map(async (task) => ({
						task,
						hasBids: await taskHasBids(task.id)
					}))
				);
				return waitingResults
					.filter(({ hasBids }) => !hasBids)
					.map(({ task }) => task);
			
			case 'bids_received':
				// OPEN tasks with bids
				const bidTasks = tasks.filter((task) => task.status === TaskStatusEnum.OPEN);
				const bidResults = await Promise.all(
					bidTasks.map(async (task) => ({
						task,
						hasBids: await taskHasBids(task.id)
					}))
				);
				return bidResults
					.filter(({ hasBids }) => hasBids)
					.map(({ task }) => task);
			
			case 'tasks_in_progress':
				return tasks.filter((task) => 
					task.status === TaskStatusEnum.IN_PROGRESS ||
					task.status === TaskStatusEnum.BID_ACCEPTED ||
					task.status === TaskStatusEnum.ESCROW_FUNDED ||
					task.status === TaskStatusEnum.RESCOPED ||
					task.status === TaskStatusEnum.RESCOPE_ACCEPTED
				);
			
			case 'tasks_completed':
				// Include all terminal/final states
				return tasks.filter((task) => 
					task.status === TaskStatusEnum.COMPLETED ||
					task.status === TaskStatusEnum.CANCELLED ||
					task.status === TaskStatusEnum.REFUNDED
				);
			
			case 'tasks_disputed':
				return tasks.filter((task) => 
					task.status === TaskStatusEnum.DISPUTED ||
					task.status === TaskStatusEnum.DISPUTE_PROPOSAL
				);
			
			default:
				return tasks;
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
							markTaskAsDone(task);
						},
						icon: 'mark_as_done'
					},
					{
						label: $t('task.actions.rescope'),
						class: 'btn-info btn-outline btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							rescopeTask(task);
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

	/**
	 * Mark task as done
	 */
	function markTaskAsDone(task: Task) {
		// TODO: Implement mark as done functionality
		console.log('Mark as done:', task.id);
	}

	/**
	 * Rescope task
	 */
	function rescopeTask(task: Task) {
		// TODO: Implement rescope functionality
		console.log('Rescope task:', task.id);
	}

	/**
	 * Delete task
	 */
	function deleteTask(task: Task) {
		// TODO: Implement delete task functionality
		console.log('Delete task:', task.id);
	}

	/**
	 * Dispute task
	 */
	function disputeTask(task: Task) {
		// TODO: Implement dispute task functionality
		console.log('Dispute task:', task.id);
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
		const dropdownContainer = target.closest('.dropdown-container');
		if (!dropdownContainer && isDropdownOpen) {
			isDropdownOpen = false;
		}
	}

	/**
	 * Select filter option
	 */
	function selectFilter(optionId: TaskFilterCategory) {
		activeFilter = optionId;
		isDropdownOpen = false;
		// Clear bid cache when switching filters to ensure fresh data
		taskBidStatusCache.clear();
	}

	/**
	 * Load more my tasks (for infinite scroll)
	 */
	async function loadMoreMyTasks() {
		if ($myTasksStore.hasMore && !$myTasksStore.loading) {
			const nextPage = $myTasksStore.currentPage + 1;
			const lastItem = $myTasksStore.items[$myTasksStore.items.length - 1];

			// Subtract 1 second from the last item's timestamp to exclude it from the next batch
			const untilTimestamp = lastItem.createdAt - 1;

			await findMyTasks({
				page: nextPage,
				limit: 20,
				until: untilTimestamp
			});
		}
	}

	/**
	 * Setup intersection observer for infinite scroll
	 */
	function setupInfiniteScroll() {
		if (!browser) return;

		if ('IntersectionObserver' in window) {
			infiniteScrollObserver = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $myTasksStore.hasMore && !$myTasksStore.loading) {
						loadMoreMyTasks();
					}
				},
				{ rootMargin: '200px' }
			);

			if (scrollTarget) {
				infiniteScrollObserver.observe(scrollTarget);
			}
		}
	}

	/**
	 * Cleanup infinite scroll observer
	 */
	function cleanupInfiniteScroll() {
		if (infiniteScrollObserver && scrollTarget) {
			infiniteScrollObserver.unobserve(scrollTarget);
		}
		if (infiniteScrollObserver) {
			infiniteScrollObserver.disconnect();
			infiniteScrollObserver = null;
		}
	}

	// Reactive statement to get filtered tasks (now async)
	let filteredTasks = $state<Task[]>([]);
	let isFiltering = $state(false);

	// Watch for filter or task changes
	$effect(() => {
		// Track dependencies
		$myTasksStore.items;
		activeFilter;
		
		// Call async function inside effect
		(async () => {
			if (!$myTasksStore.items) {
				filteredTasks = [];
				return;
			}
			
			isFiltering = true;
			try {
				filteredTasks = await getFilteredTasks($myTasksStore.items, activeFilter);
			} catch (error) {
				console.error('Error filtering tasks:', error);
				filteredTasks = [];
			} finally {
				isFiltering = false;
			}
		})();
	});

	onMount(() => {
		// Add click outside listener for dropdown
		document.addEventListener('click', handleClickOutside);

		// Load tasks and BTC price asynchronously
		(async () => {
			try {
				// Load first page of tasks
				await findMyTasks({ page: 1, limit: 20 });
			} catch (err) {
				console.error('Error loading tasks:', err);
				$myTasksStore.error = $t('task.error.loading');
			}

			// Fetch BTC price in background (non-blocking)
			if (typeof requestIdleCallback !== 'undefined') {
				requestIdleCallback(
					() => {
						fetchBtcPrice();
					},
					{ timeout: 2000 }
				);
			} else {
				// Fallback for browsers without requestIdleCallback
				setTimeout(() => {
					fetchBtcPrice();
				}, 100);
			}
		})();

		// Setup infinite scroll - waiting for DOM to be ready
		setTimeout(() => {
			setupInfiniteScroll();
		}, 1000);

		// Cleanup on unmount
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			cleanupInfiniteScroll();
		}
	});
</script>

<!-- Task Category Filters - Responsive -->
<div class="mb-6 max-w-4xl">
	<!-- Desktop: Button filters -->
	<div class="hidden sm:block">
		<div class="mt-3 flex flex-col gap-3 sm:flex-row">
			{#each filterOptions as option}
				{@const IconComponent = option.icon}
				<button
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-2 text-center transition-all duration-200 {activeFilter === option.id
						? 'text-primary bg-primary/10'
						: 'bg-base-100/40 hover:bg-base-100/50'}"
					onclick={() => {
						activeFilter = option.id;
						taskBidStatusCache.clear();
					}}
				>
					<!-- MDI Icon Component -->
					<IconComponent 
						class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}"
					/>
					<span class="font-medium">{option.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Mobile: Custom dropdown -->
	<div class="block sm:hidden">
		<div class="dropdown-container relative mt-3">
			<button
				class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full cursor-pointer items-center justify-between rounded-3xl border px-4 py-1 transition-all duration-200"
				onclick={toggleDropdown}
			>
				<div class="flex items-center gap-2">
					<!-- MDI Icon Component for selected filter -->
					{#each filterOptions as option}
						{#if activeFilter === option.id}
							{@const IconComponent = option.icon}
							<IconComponent class="text-primary h-5 w-5" />
						{/if}
					{/each}
					<span class="font-medium">
						{filterOptions.find((opt) => opt.id === activeFilter)?.label}
					</span>
				</div>
				<!-- Dropdown arrow icon -->
				<IconChevronDown 
					class="text-primary h-5 w-5 transition-transform duration-200 {isDropdownOpen ? 'rotate-180' : ''}"
				/>
			</button>

			<!-- Dropdown menu -->
			{#if isDropdownOpen}
				<div
					class="border-base-300 bg-base-300 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
				>
					{#each filterOptions as option}
						{@const IconComponent = option.icon}
						<button
							class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {activeFilter === option.id
								? 'bg-primary/10 text-primary'
								: 'text-base-content'}"
							onclick={() => selectFilter(option.id)}
						>
							<!-- MDI Icon Component -->
							<IconComponent 
								class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : 'text-base-content/60'}"
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
</div>

<!-- Loading State -->
{#if $myTasksStore.loading}
	<div class="space-y-2">
		{#each Array(1) as _}
			<div class="bg-base-100 animate-pulse rounded-xl shadow-md">
				<div class="card-body">
					<!-- Title and Description Section -->
					<div class="flex flex-col justify-between gap-2">
						<!-- Title skeleton -->
						<div class="bg-base-300 h-7 w-3/4 rounded"></div>
						<!-- Description skeleton -->
						<div class="bg-base-300 my-2 h-4 w-full rounded"></div>
						<div class="bg-base-300 mb-4 h-4 w-2/3 rounded"></div>
					</div>

					<!-- Deadline and Budget Section -->
					<div class="flex w-full items-center justify-between">
						<!-- Left: Schedule skeleton -->
						<div class="flex items-center gap-2">
							<div class="bg-base-300 h-4 w-4 rounded"></div>
							<div class="flex flex-col">
								<div class="bg-base-300 mb-1 h-3 w-16 rounded"></div>
								<div class="bg-base-300 h-4 w-24 rounded"></div>
							</div>
						</div>

						<!-- Right: Budget skeleton -->
						<div class="text-right">
							<div class="bg-base-300 h-6 w-20 rounded"></div>
							<div class="bg-base-300 mt-1 h-4 w-16 rounded"></div>
						</div>
					</div>

					<!-- Location Section -->
					<div class="flex w-full items-start gap-2">
						<div class="bg-base-300 mt-1 h-4 w-4 rounded"></div>
						<div class="flex min-w-0 flex-1 flex-col">
							<div class="bg-base-300 mb-1 h-3 w-24 rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 rounded"></div>
						</div>
					</div>

					<!-- Bottom Section: Avatar, Username, Rating, and Buttons -->
					<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<!-- Left: Avatar, Username, and Review Stars skeleton -->
						<div class="flex items-center gap-3">
							<!-- Avatar skeleton -->
							<div class="bg-base-300 h-8 w-8 rounded-full"></div>

							<!-- Username and Review Stars skeleton -->
							<div class="flex flex-col">
								<div class="bg-base-300 mb-1 h-4 w-16 rounded"></div>
								<!-- Review Stars skeleton -->
								<div class="flex items-center">
									{#each Array(5) as _}
										<div class="bg-base-300 mr-1 h-3 w-3 rounded"></div>
									{/each}
									<div class="bg-base-300 ml-1 h-3 w-8 rounded"></div>
								</div>
							</div>
						</div>

						<!-- Right: Action Buttons skeleton -->
						<div class="flex w-full items-center gap-2 md:w-auto">
							<div class="bg-base-300 h-9 w-28 rounded"></div>
							<div class="bg-base-300 h-9 w-24 rounded"></div>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Task List -->
{#if !$myTasksStore.loading && !isFiltering && filteredTasks.length > 0}
	<div class="grid grid-cols-1 gap-5">
		{#each filteredTasks as task}
			{#if task}
				<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex flex-col justify-between gap-2">
							<div class="card-title line-clamp-1 text-lg">
								<button
									class="hover:text-primary cursor-pointer transition-colors text-left"
									onclick={(e) => {
										e.stopPropagation();
										goto(`/dashboard/task/${task.id}`);
									}}
								>
									<TranslatableTask 
										{task} 
										showTitle={true}
										showDescription={false}
										showToggle={false}
										titleClass="text-lg font-semibold"
									/>
								</button>
							</div>
							<div class="text-base-content/60">
								<TranslatableTask 
									{task} 
									showTitle={false}
									showDescription={true}
									showToggle={false}
									descriptionClass="text-sm text-base-content/60 line-clamp-2"
								/>
							</div>
						</div>

						<div class="flex w-full items-center justify-between">
							<!-- Left: Schedule -->
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-base-content/60 h-4 w-4 shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div class="flex flex-col">
									{#if task.deadline}
										<small class="text-base-content/60 text-xs">
											{$t('dashboard.task.deadline.label')}
										</small>
										<span class="text-sm font-medium">
											{formatDateTimeReactive(new Date(task.deadline))}
										</span>
									{:else if task.dateRange}
										<small class="text-base-content/60 text-xs">
											{$t('dashboard.task.dateRange.label')}
										</small>
										<span class="text-sm font-medium">
											{formatDateRangeReactive(new Date(task.dateRange.start), new Date(task.dateRange.end))}
										</span>
									{/if}
								</div>
							</div>

							<!-- Right: Sats -->
							<div class="">
								<div class="text-lg font-bold">
									${formatNumberWithTwoDecimals(task.budget.amount)}

									<div class="text-base-content/60 text-sm">
										{satsFromUsd(task.budget.amount, btcPrice)}
									</div>
								</div>
							</div>
						</div>

						<div class="flex w-full items-start gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/60 mt-1 h-4 w-4 shrink-0"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
							<div class="flex min-w-0 flex-1 flex-col">
								<small class="text-base-content/60 text-xs">{$t('dashboard.task.location.details')}</small>
								<span class="line-clamp-2 text-sm font-medium">
									{#if task.dropOffLocation?.displayName}
										{task.dropOffLocation.displayName}
									{:else if task.pickupLocation?.displayName}
										{task.pickupLocation.displayName}
									{:else}
										{$t('dashboard.task.type.remote')}
									{/if}
								</span>
							</div>
						</div>

						<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<!-- Left: Empty space on larger screens, full width on mobile -->
							<div class="hidden md:block"></div>

							<!-- Right: Action Buttons -->
							<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
								{#each getActionButtons(task, activeFilter) as action}
									<button
										class="btn {action.class} w-full sm:w-auto"
										onclick={(e) => {
											e.stopPropagation();
											action.onclick(e);
										}}
									>
										{#if action.icon === 'view_details'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										{:else if action.icon === 'view_bids'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
												/>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
												/>
											</svg>
										{:else if action.icon === 'delete'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										{:else if action.icon === 'mark_as_done'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										{:else if action.icon === 'rescope'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
												/>
											</svg>
										{:else if action.icon === 'dispute'}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-4 w-4"
												fill="none"
												viewBox="0 0 24 24"
												stroke="currentColor"
											>
												<path
													stroke-linecap="round"
													stroke-linejoin="round"
													stroke-width="2"
													d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
												/>
											</svg>
										{/if}
										{action.label}
									</button>
								{/each}
							</div>
						</div>
					</div>
				</div>
			{/if}
		{/each}
		
		<!-- Infinite scroll trigger -->
		{#if $myTasksStore.hasMore}
			<div bind:this={scrollTarget} class="h-4 w-full">
				{#if $myTasksStore.loading}
					<div class="flex justify-center py-4">
						<span class="loading loading-spinner loading-md"></span>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{:else if !$myTasksStore.loading && !isFiltering && !$myTasksStore.error}
	<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
		<svg
			xmlns="http://www.w3.org/2000/svg"
			class="text-primary mx-auto mb-3 h-12 w-12"
			fill="none"
			viewBox="0 0 24 24"
			stroke="currentColor"
		>
			<path
				stroke-linecap="round"
				stroke-linejoin="round"
				stroke-width="2"
				d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
			/>
		</svg>
		<span class="text-xl font-semibold">{$t('task.empty.no_tasks')}</span>
		<p class="mb-4 text-gray-500">{$t('task.empty.no_tasks_description')}</p>
	</div>
{/if}

{#if $myTasksStore.error}
	<div class="py-12 text-center">
		<h4 class="mt-4 text-lg font-semibold">{$t('task.error.loading')}</h4>
	</div>
{/if}
