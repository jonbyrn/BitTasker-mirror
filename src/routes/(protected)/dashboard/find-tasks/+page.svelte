<script lang="ts">
	import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDistanceToNow } from 'date-fns';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { tasksStore } from '$lib/stores/task.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import SaveSearchForm from '$lib/components/task/SaveSearchForm.svelte';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import RecommendedTasks from '$lib/components/recommendations/RecommendedTasks.svelte';
	import { calculateUsdtEstimate, formatBtcToSats } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';

	// Function to create initial search parameters
	function getInitialSearchParams(): SearchTasksParams {
		return {
			taskType: undefined,
			categories: [],
			skills: [],
			page: 1,
			limit: 10,
			budget: {
				tier: undefined,
				currency: undefined,
				type: undefined
			},
			search: ''
		};
	}

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());
	let searchQuery = $state('');
	let selectedTaskType = $state({ label: '', value: '' });

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Save search state
	let isSaveSearchOpen = $state(false);

	// Infinite scroll state
	let observer: IntersectionObserver | null = null;
	let scrollTarget = $state<HTMLElement | null>(null);

	// Bid drawer state
	let selectedTaskId = $state<string | null>(null);
	let isSidebarOpen = $state(false);

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);

	// Has active search parameters for save search button
	let hasActiveParams = $state(false);
	$effect(() => {
		// Check if there are any meaningful search parameters set
		hasActiveParams =
			!!searchParams.search ||
			!!searchParams.taskType ||
			!!searchParams.location ||
			(searchParams.status && searchParams.status.length > 0) ||
			(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			!!searchParams.budget?.tier ||
			!!searchParams.budget?.currency ||
			!!searchParams.budget?.type;
	});

	// BTC price for USDT conversion
	let btcPrice = $state<number>(120000); // Default fallback price

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	// Debounced function to update searchParams
	const debouncedSearch = debounce(async () => {
		const newParams: SearchTasksParams = {
			...searchParams,
			page: 1,
			search: searchQuery.trim()
		};

		searchParams = { ...searchParams, ...newParams };

		try {
			await findTasks(searchParams);
		} catch (err) {
			console.error('[FindTasks] Search fetch error:', err);
		}
	}, 1000);

	// Handle advanced filter drawer apply
	function handleFilterApply(filters: SearchTasksParams) {
		isFilterDrawerOpen = false;
		searchParams = {
			...searchParams,
			...filters,
			page: 1
		};

		// Update UI controls based on applied filters
		searchQuery = filters.search || '';
		selectedTaskType = filters.taskType
			? {
					label: filters.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In Person',
					value: filters.taskType
				}
			: { label: '', value: '' };

		findTasks(searchParams);
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedTaskType = { label: '', value: '' };

		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };
		findTasks(searchParams);
	}

	// Format date
	function formatTimeAgo(date: string): string {
		try {
			const parsedDate = new Date(date);
			if (isNaN(parsedDate.getTime())) {
				return 'Invalid date';
			}
			return formatDistanceToNow(parsedDate, { addSuffix: true });
		} catch (error) {
			console.error('[FindTasks] Error formatting date:', error);
			return 'Invalid date';
		}
	}

	// Load more tasks (for infinite scroll)
	async function loadMoreTasks() {
		if ($tasksStore.hasMore && !$tasksStore.loading) {
			const nextPage = $tasksStore.currentPage + 1;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];

			// Subtract 1 second from the last item's timestamp to exclude it from the next batch
			const untilTimestamp = lastItem.createdAt - 1;

			searchParams = {
				...searchParams,
				page: nextPage,
				until: untilTimestamp
			};
			await findTasks(searchParams);
		}
	}

	// Setup intersection observer for infinite scroll
	function setupInfiniteScroll() {
		if (!browser) return;

		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $tasksStore.hasMore && !$tasksStore.loading) {
						loadMoreTasks();
					}
				},
				{ rootMargin: '200px' }
			);

			if (scrollTarget) {
				observer.observe(scrollTarget);
			}
		}
	}

	// Cleanup observer
	function cleanupInfiniteScroll() {
		tasksStore.update((state) => {
			return {
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null
			};
		});
		if (observer && scrollTarget) {
			observer.unobserve(scrollTarget);
		}
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	}

	// Task type filter handler
	function toggleTaskType(type: TaskTypeEnum | undefined) {
		if (!type) {
			searchParams = { ...searchParams, taskType: undefined, page: 1 };
			return;
		}

		searchParams = {
			...searchParams,
			taskType: type,
			page: 1
		};

		findTasks(searchParams);
	}

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			// Fetch BTC price for USDT conversion
			fetchBtcPrice();

			// Load initial tasks
			findTasks(searchParams);

			// Setup infinite scroll - waiting for DOM to be ready
			setTimeout(() => {
				setupInfiniteScroll();
			}, 1000);
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			cleanupInfiniteScroll();
			cleanup();
		}
	});

	// Loading state management effect
	$effect(() => {
		// Update initial load flag
		if (isInitialLoad && (!$tasksStore.loading || $tasksStore.items.length > 0)) {
			isInitialLoad = false;
		}

		// Handle loading timeout
		let timer: ReturnType<typeof setTimeout> | undefined;
		if ($tasksStore.loading && searchParams.page === 1) {
			timer = setTimeout(() => {
				if ($tasksStore.loading && searchParams.page === 1) {
					loadingTimeout = true;
					console.error('[FindTasks] Query timeout - fetching took too long');
				}
			}, 10000); // 10 second timeout
		} else {
			loadingTimeout = false;
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	const onSelectTask = (task: Task) => {
		if (task.status === TaskStatusEnum.OPEN) {
			if (task?.npub === $user?.npub) {
				appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
			} else {
				selectedTaskId = task.id.toString();
				isSidebarOpen = true;
			}
		}
	};
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h1 class="mb-2 text-2xl font-bold">{$t('find_tasks.title')}</h1>
		<p class="text-base-content/70">{$t('find_tasks.description')}</p>
	</div>

	<!-- Search and Filter Controls -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<!-- Search Input -->
		<div class="relative w-full sm:flex-1">
			<input
				type="text"
				class="input input-bordered w-full pl-10"
				placeholder={$t('find_tasks.search_placeholder')}
				bind:value={searchQuery}
				oninput={debouncedSearch}
			/>
			<div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-5 w-5 text-gray-400"
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
			</div>
		</div>

		<!-- Task Type Quick Filters -->
		<div class="hidden gap-2 sm:flex">
			<button
				class="btn btn-sm"
				class:btn-primary={searchParams.taskType?.includes(TaskTypeEnum.REMOTE)}
				onclick={() => toggleTaskType(TaskTypeEnum.REMOTE)}
			>
				{$t('find_tasks.remote')}
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={searchParams.taskType?.includes(TaskTypeEnum.IN_PERSON)}
				onclick={() => toggleTaskType(TaskTypeEnum.IN_PERSON)}
			>
				{$t('find_tasks.in_person')}
			</button>
		</div>

		<!-- Advanced Filters Button -->
		<button class="btn btn-sm btn-primary" onclick={() => (isFilterDrawerOpen = true)}>
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
				/>
			</svg>
			{$t('find_tasks.filters')}
		</button>

		<!-- Save Search Button -->
		<button
			class="btn btn-sm btn-primary gap-2"
			onclick={() => (isSaveSearchOpen = true)}
			disabled={!hasActiveParams}
			title={!hasActiveParams ? $t('find_tasks.save_search_tooltip_disabled') : $t('find_tasks.save_search_tooltip_enabled')}
		>
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
					d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
				/>
			</svg>
			{$t('find_tasks.save_search')}
		</button>
	</div>

	<!-- Error Message -->
	{#if $tasksStore.error}
		<div class="alert alert-error alert-outline mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0 stroke-current"
				fill="none"
				viewBox="0 0 24 24"
				><path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/></svg
			>
			<span>{$t('find_tasks.error_loading').replace('{error}', $tasksStore.error)}</span>
		</div>
	{/if}

	<RecommendedTasks {onSelectTask} />

	<!-- Task List -->
	{#if (isInitialLoad || ($tasksStore.loading && searchParams.page === 1)) && !loadingTimeout}
		<!-- Shimmer/Loading Placeholder -->
		<div class="card bg-base-100 space-y-4 rounded-xl shadow-md">
			{#each Array(4) as _}
				<div class="card-body animate-pulse">
					<!-- Skeleton structure -->
					<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
						<div class="bg-base-300 h-7 w-3/4 rounded"></div>
						<div class="bg-base-300 h-6 w-32 rounded"></div>
					</div>
					<div class="my-4 grid grid-cols-1 gap-4 md:grid-cols-3">
						<div>
							<div class="bg-base-300 mb-2 h-4 w-16 rounded"></div>
							<div class="bg-base-300 h-6 w-28 rounded"></div>
						</div>
						<div>
							<div class="bg-base-300 mb-2 h-4 w-24 rounded"></div>
							<div class="bg-base-300 h-6 w-36 rounded"></div>
						</div>
						<div>
							<div class="bg-base-300 mb-2 h-4 w-20 rounded"></div>
							<div class="bg-base-300 h-6 w-32 rounded"></div>
						</div>
					</div>
					<div class="mb-4 flex flex-wrap gap-2">
						<div class="bg-base-300 h-6 w-20 rounded"></div>
						<div class="bg-base-300 h-6 w-24 rounded"></div>
						<div class="bg-base-300 h-6 w-16 rounded"></div>
					</div>
					<div class="card-actions mt-4 flex items-center justify-between">
						<div class="bg-base-300 h-6 w-16 rounded"></div>
						<div class="bg-base-300 h-9 w-24 rounded"></div>
					</div>
				</div>
				<div class="divider mx-auto w-[90%]"></div>
			{/each}
		</div>
	{:else if loadingTimeout}
		<!-- Loading Timeout Warning -->
		<div class="alert alert-warning alert-outline mb-4 rounded-xl text-black">
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
					d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
				/>
			</svg>
			<div>
				<h3 class="font-bold">{$t('find_tasks.loading_timeout_title')}</h3>
				<div class="text-xs">{$t('find_tasks.loading_timeout_message')}</div>
			</div>
			<button class="btn btn-sm" onclick={() => window.location.reload()}> {$t('find_tasks.refresh')} </button>
		</div>
	{:else if $tasksStore.items && $tasksStore.items.length > 0}
		<h2 class="mb-4 text-xl font-bold">
			{$t('find_tasks.other_tasks')}
			<span class="text-base-content/70 ml-2 text-sm font-normal">
				{#if $tasksStore.loading && searchParams.page === 1}
					<span class="bg-base-300 inline-block h-4 w-48 animate-pulse rounded"></span>
				{:else if $tasksStore.items.length > 0}
					({$t('find_tasks.showing_tasks').replace('{count}', $tasksStore.items.length.toString())})
				{/if}
			</span>
		</h2>

		<div class="card bg-base-100 space-y-4 rounded-xl shadow-md transition-shadow hover:shadow-lg">
			{#each $tasksStore.items as task, index}
				<div class="card-body">
					<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
						<h3 class="card-title text-lg md:text-xl">{task.title}</h3>
						<div class="flex items-center justify-between gap-2 text-sm">
							<div class="flex flex-col items-start">
								<span class="font-semibold">{formatBtcToSats(task.budget.amount)}</span>
								<span class="text-info text-xs"
									>≈ {calculateUsdtEstimate(task.budget.amount, btcPrice)} USDT</span
								>
							</div>
							<span class="badge badge-outline">{task.status}</span>
						</div>
					</div>

					<p class="text-base-content/80 my-2 line-clamp-2">{task.description}</p>

					<div class="mt-2 mb-4">
						<div class="flex flex-wrap gap-4">
							{#if task.deadline}
								<div>
									<p class="text-base-content/60 text-sm">{$t('find_tasks.deadline')}</p>
									<p class="font-medium">{formatTimeAgo(task.deadline)}</p>
								</div>
							{:else if task.dateRange?.start && task.dateRange?.end}
								<div>
									<p class="text-base-content/60 text-sm">{$t('find_tasks.date_range')}</p>
									<p class="font-medium">
										{new Date(task.dateRange.start).toLocaleDateString()} -
										{new Date(task.dateRange.end).toLocaleDateString()}
									</p>
								</div>
							{/if}

							<div>
								<p class="text-base-content/60 text-sm">{$t('find_tasks.posted_by')}</p>
								<p class="font-medium">{task?.creator?.username || $t('find_tasks.not_available')}</p>
							</div>
						</div>
					</div>

					{#if task.skills && task.skills.length > 0}
						<div class="mb-4 flex flex-wrap gap-2">
							{#each task.skills as skill, index}
								{#if skill}
									<span class="badge badge-primary badge-outline">{skill}</span>
								{/if}
							{/each}
						</div>
					{/if}

					<div class="card-actions mt-4 flex items-center justify-between">
						<div class="flex items-center gap-2">
							<div class="badge badge-info gap-1">
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
										d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"
									/>
								</svg>
								{task.bids?.length ?? 0} {$t('find_tasks.bids')}
							</div>
						</div>

						<button
							class="btn btn-primary btn-sm"
							class:btn-disabled={task.status !== TaskStatusEnum.OPEN || task?.npub === $user?.npub}
							onclick={() => onSelectTask(task)}
							aria-label={$t('find_tasks.bid_on_task')}
						>
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="h-5 w-5"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M12 4v16m8-8H4"
								/>
							</svg>
							{task.status === TaskStatusEnum.OPEN ? $t('find_tasks.bid_now') : $t('find_tasks.bidding_closed')}
						</button>
					</div>
				</div>

				{#if index < $tasksStore.items.length - 1}
					<div class="divider mx-auto w-[90%]"></div>
				{/if}
			{/each}
		</div>

		<!-- Infinite Scroll Target -->
		<div bind:this={scrollTarget} class="mt-2">
			{#if $tasksStore.loading && searchParams.page && searchParams.page > 1}
				<div class="flex justify-center py-2">
					<span class="loading loading-spinner loading-md"></span>
				</div>
			{/if}
		</div>
	{:else if !$tasksStore.loading}
		<div class="py-12 text-center">
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
					d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<h3 class="mt-4 text-lg font-semibold">{$t('find_tasks.no_tasks_found')}</h3>
			<p class="text-base-content/60 mt-1">{$t('find_tasks.no_tasks_message')}</p>
			<button class="btn btn-primary mt-4" onclick={clearFilters}>{$t('find_tasks.clear_filters')}</button>
		</div>
	{/if}
</div>

<!-- Advanced Filter Drawer Component -->
<FilterDrawer
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
/>

<TaskDetailsBidDrawer
	taskId={selectedTaskId}
	onClose={() => (isSidebarOpen = false)}
	isOpen={isSidebarOpen}
/>

<SaveSearchForm
	isOpen={isSaveSearchOpen}
	{searchParams}
	onClose={() => (isSaveSearchOpen = false)}
	onSaved={() => {}}
/>
