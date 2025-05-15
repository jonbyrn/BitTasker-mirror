<script lang="ts">
	import type { SearchTasksParams, TaskData } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDistanceToNow } from 'date-fns';
	import { SearchTasksStore, type SearchTasksDto } from '$houdini';
	import {
		TaskStatusEnum,
		TaskTypeEnum,
		SortByEnum,
		SortOrderEnum
	} from '$lib/utils/enums/task.enum';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import SaveSearchButton from '$lib/components/saved-searches/SaveSearchButton.svelte';
	import SavedSearchList from '$lib/components/saved-searches/SavedSearchList.svelte';
	import recommendationsService from '$lib/api/services/recommendations.service';
	import RecommendedTasks from '$lib/components/recommendations/RecommendedTasks.svelte';

	// Function to create initial search parameters conforming to SearchTasksDto
	function getInitialSearchParams(): Partial<SearchTasksDto> {
		return {
			taskType: undefined,
			minBudget: undefined,
			maxBudget: undefined,
			budgetType: undefined,
			categoryIds: [],
			skillIds: [],
			page: 1,
			limit: 10,
			sortBy: SortByEnum.CREATED_AT,
			sortOrder: SortOrderEnum.DESC
		};
	}

	// Reactive state for search parameters and UI controls
	let searchParams = $state<Partial<SearchTasksDto>>(getInitialSearchParams());
	let searchQuery = $state('');
	let selectedCategory = $state({ label: '', value: '' });
	let selectedTaskType = $state({ label: '', value: '' });
	let sortBy = $state({ label: 'Created Date', value: SortByEnum.CREATED_AT });
	let sortOrder = $state({ label: 'Descending', value: SortOrderEnum.DESC });
	let minBudget = $state('');
	let maxBudget = $state('');

	// Houdini Query Store
	const searchTasksQuery = new SearchTasksStore();

	// Recommendations state
	let recommendedTasks = $state<TaskData[]>([]);
	let showAllRecommendations = $state(false);
	let loadingRecommendations = $state(false);

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);
	let showRecommendations = $state(true);
	let showSavedSearches = $state(true);
	let showHistorySuggestions = $state(true);

	// Infinite scroll state
	let observer: IntersectionObserver | null = null;
	let scrollTarget = $state<HTMLElement | null>(null);

	// Bid drawer state
	let selectedTaskId = $state<string | null>(null);
	let isSidebarOpen = $state(false);

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);
	let recommendationsLoaded = $state(false);

	// Load more tasks (for infinite scroll)
	async function loadMoreTasks() {
		if ($searchTasksQuery.data?.tasks.meta?.hasNextPage && !$searchTasksQuery.fetching) {
			const nextPage = ($searchTasksQuery.data?.tasks.meta?.currentPage ?? 0) + 1;
			searchParams = { ...searchParams, page: nextPage };
			// Fetch with updated page param
			await searchTasksQuery.fetch({ variables: { input: searchParams } });
		}
	}

	// Load recommendations
	async function loadRecommendations() {
		if (recommendationsLoaded || !browser) return;

		try {
			loadingRecommendations = true;
			const response = await recommendationsService.getRecommendations(10);
			recommendedTasks = response.recommendations.map((r) => r.task);
			recommendationsLoaded = true;
		} catch (err) {
			console.error('Error loading recommendations:', err);
			recommendedTasks = [];
		} finally {
			loadingRecommendations = false;
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
	const debouncedUpdateSearchParams = debounce(async () => {
		const currentPageValue = 1;
		const limitValue = searchParams.limit;
		const sortByValue = sortBy.value;
		const sortOrderValue = sortOrder.value;
		const searchQueryValue = searchQuery.trim() || undefined;
		const categoryId = selectedCategory.value ? parseInt(selectedCategory.value, 10) : undefined;
		const taskTypeValue = selectedTaskType.value
			? (selectedTaskType.value as TaskTypeEnum)
			: undefined;
		let minBudgetValue = searchParams.minBudget;
		let maxBudgetValue = searchParams.maxBudget;

		if (minBudget && maxBudget && parseFloat(minBudget) < parseFloat(maxBudget)) {
			minBudgetValue = parseFloat(minBudget);
			maxBudgetValue = parseFloat(maxBudget);
		} else if (minBudget && parseFloat(minBudget) > 0) {
			minBudgetValue = parseFloat(minBudget);
			maxBudgetValue = undefined;
		} else if (maxBudget && parseFloat(maxBudget) > 0) {
			minBudgetValue = undefined;
			maxBudgetValue = parseFloat(maxBudget);
		} else {
			minBudgetValue = undefined;
			maxBudgetValue = undefined;
		}

		const newParams: Partial<SearchTasksDto> = {
			page: currentPageValue,
			limit: limitValue,
			sortBy: sortByValue,
			sortOrder: sortOrderValue,
			searchTerm: searchQueryValue,
			categoryIds: categoryId ? [categoryId] : [],
			taskType: taskTypeValue ? [taskTypeValue] : undefined,
			minBudget: minBudgetValue,
			maxBudget: maxBudgetValue
		};

		searchParams = { ...searchParams, ...newParams };

		try {
			await searchTasksQuery.fetch({ variables: { input: searchParams } });
		} catch (err) {
			console.error('[FindTasks] Search fetch error:', err);
		}
	}, 1000);

	// Handle simple filter changes (search input, quick task type toggles)
	function handleSimpleFilterChange() {
		searchParams.page = 1;
		debouncedUpdateSearchParams();
	}

	// Handle advanced filter drawer apply
	function handleFilterApply(filters: SearchTasksParams) {
		isFilterDrawerOpen = false;
		const dtoFilters: Partial<SearchTasksDto> = {
			...filters,
			budgetType: filters.budgetType ? [filters.budgetType] : undefined,
			taskType: filters.taskType ? [filters.taskType] : undefined,
			skillIds: filters.skillIds // Use skillIds from the SearchTasksParams type
		};
		searchParams = {
			...searchParams,
			...dtoFilters,
			page: 1
		};

		// Update UI controls based on applied filters
		searchQuery = filters.searchTerm || '';
		minBudget = filters.minBudget ? String(filters.minBudget) : '';
		maxBudget = filters.maxBudget ? String(filters.maxBudget) : '';
		selectedTaskType = filters.taskType
			? {
					label: filters.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In Person',
					value: filters.taskType
				}
			: { label: '', value: '' };
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedCategory = { label: '', value: '' };
		selectedTaskType = { label: '', value: '' };
		sortBy = { label: 'Created Date', value: SortByEnum.CREATED_AT };
		sortOrder = { label: 'Descending', value: SortOrderEnum.DESC };
		minBudget = '';
		maxBudget = '';

		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };
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

	// Format date display
	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	// Navigate to task details
	function goToTaskDetails(taskId: string) {
		window.location.href = `/tasks/${taskId}`;
	}

	// Handle save search success
	function handleSearchSaved() {
		const currentState = showSavedSearches;
		showSavedSearches = false;
		setTimeout(() => {
			showSavedSearches = !currentState ? currentState : true;
		}, 100);
	}

	// Handle sidebar close
	function handleSidebarClose() {
		isSidebarOpen = false;
		setTimeout(() => {
			selectedTaskId = null;
		}, 300);
	}

	// Setup intersection observer for infinite scroll
	function setupInfiniteScroll() {
		if (!browser) return;

		if ('IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (
						entries[0].isIntersecting &&
						$searchTasksQuery.data?.tasks.meta?.hasNextPage &&
						!$searchTasksQuery.fetching
					) {
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
		if (observer && scrollTarget) {
			observer.unobserve(scrollTarget);
		}
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	}

	// Toggle all recommendations
	function toggleAllRecommendations() {
		showAllRecommendations = !showAllRecommendations;
	}

	// Task type filter handler
	function toggleTaskType(type: TaskTypeEnum | undefined) {
		if (!type) {
			searchParams = { ...searchParams, taskType: undefined, page: 1 };
			return;
		}
		const currentTypes = searchParams.taskType ?? [];
		const typeExists = currentTypes.includes(type);

		searchParams = {
			...searchParams,
			// If type exists, filter it out. Otherwise, add it.
			// If removing the only type results in an empty array, set to undefined.
			taskType: typeExists
				? currentTypes.filter((t) => t !== type).length > 0
					? currentTypes.filter((t) => t !== type)
					: undefined
				: [...currentTypes, type],
			page: 1
		};
	}

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			loadRecommendations(); // Load recommendations on mount
			searchTasksQuery
				.fetch({ variables: { input: searchParams } }) // Initial tasks fetch
				.catch((err) => console.error('[FindTasks] Initial task fetch error:', err));
			setupInfiniteScroll();
		}
		return () => {
			if (browser) {
				cleanupInfiniteScroll();
			}
		};
	});

	// Loading state management effect
	$effect(() => {
		// Update initial load flag
		if (isInitialLoad && (!$searchTasksQuery.fetching || $searchTasksQuery.data?.tasks.items)) {
			isInitialLoad = false;
		}

		// Condition for when page-level loading (initial or search) is active
		const isPageLoading = $searchTasksQuery.fetching && searchParams.page === 1;

		// Handle loading timeout
		let timer: ReturnType<typeof setTimeout> | undefined;
		if (isPageLoading) {
			timer = setTimeout(() => {
				if ($searchTasksQuery.fetching && searchParams.page === 1) {
					// Double check state
					loadingTimeout = true;
					console.error('[FindTasks] Query timeout - fetching took too long');
				}
			}, 10000); // 10 second timeout
		} else {
			loadingTimeout = false; // Reset timeout
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h1 class="mb-2 text-2xl font-bold">Find Tasks</h1>
		<p class="text-base-content/70">Discover tasks that match your skills and interests</p>
	</div>

	<!-- Search and Filter Controls -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<!-- Search Input -->
		<div class="relative w-full sm:flex-1">
			<input
				type="text"
				class="input input-bordered w-full pl-10"
				placeholder="Search tasks..."
				bind:value={searchQuery}
				oninput={handleSimpleFilterChange}
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
				Remote
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={searchParams.taskType?.includes(TaskTypeEnum.IN_PERSON)}
				onclick={() => toggleTaskType(TaskTypeEnum.IN_PERSON)}
			>
				In Person
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
			Filters
		</button>

		<!-- Save Search Button -->
		<SaveSearchButton {searchParams} onSaved={handleSearchSaved} />
	</div>

	<!-- Results count -->
	<div class="mb-4">
		<p class="text-base-content/70">
			{#if $searchTasksQuery.fetching && searchParams.page === 1}
				<span class="bg-base-300 inline-block h-4 w-48 animate-pulse rounded"></span>
			{:else if $searchTasksQuery.data?.tasks.meta}
				Showing {$searchTasksQuery.data.tasks.items.length}
				of {$searchTasksQuery.data.tasks.meta.totalItems} tasks
			{/if}
		</p>
	</div>

	<!-- Error Message -->
	{#if $searchTasksQuery.errors}
		<div class="alert alert-error mb-4">
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
			<span>Error loading tasks: {$searchTasksQuery.errors[0].message}. Please try again.</span>
		</div>
	{/if}

	<!-- Personalized Recommendations Section -->
	{#if showRecommendations}
		{#if loadingRecommendations}
			<div class="mb-8">
				<div class="mb-4 flex items-center justify-between">
					<div class="bg-base-300 h-7 w-64 animate-pulse rounded"></div>
					<div class="bg-base-300 h-6 w-24 animate-pulse rounded"></div>
				</div>
				<div class="grid grid-cols-1 gap-4 md:grid-cols-3">
					{#each Array(3) as _}
						<div class="card bg-base-100 h-64 animate-pulse shadow-md">
							<div class="card-body p-4">
								<div class="bg-base-300 mb-2 h-6 w-3/4 rounded"></div>
								<div class="bg-base-300 mb-4 h-4 w-1/2 rounded"></div>
								<div class="bg-base-300 mb-2 h-4 w-full rounded"></div>
								<div class="bg-base-300 mb-2 h-4 w-full rounded"></div>
								<div class="bg-base-300 mb-6 h-4 w-2/3 rounded"></div>
								<div class="mt-auto flex justify-between">
									<div class="bg-base-300 h-5 w-20 rounded"></div>
									<div class="bg-base-300 h-8 w-24 rounded"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<RecommendedTasks limit={3} onTaskClick={goToTaskDetails} />
		{/if}
	{/if}

	<!-- Task List -->
	{#if (isInitialLoad || ($searchTasksQuery.fetching && searchParams.page === 1)) && !loadingTimeout}
		<!-- Shimmer/Loading Placeholder -->
		<div class="card bg-base-100 space-y-4 shadow-md">
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
		<div class="alert alert-warning mb-4">
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
				<h3 class="font-bold">Loading is taking longer than expected</h3>
				<div class="text-xs">Try refreshing the page or check your connection</div>
			</div>
			<button class="btn btn-sm" onclick={() => window.location.reload()}> Refresh </button>
		</div>
	{:else if $searchTasksQuery.data?.tasks.items && $searchTasksQuery.data.tasks.items.length > 0}
		<div class="card bg-base-100 space-y-4 shadow-md transition-shadow hover:shadow-lg">
			{#each $searchTasksQuery.data.tasks.items as task, index (task.id)}
				<div class="card-body">
					<div class="flex flex-col justify-between gap-4 md:flex-row md:items-center">
						<h3 class="card-title text-lg md:text-xl">{task.title}</h3>
						<div class="flex items-center gap-2 text-sm">
							<span class="font-semibold">{task.budget} BTC</span>
							<span class="badge badge-outline">{task.status}</span>
						</div>
					</div>

					<p class="text-base-content/80 my-2 line-clamp-2">{task.description}</p>

					<div class="mt-2 mb-4">
						<div class="flex flex-wrap gap-4">
							{#if task.deadlineDate}
								<div>
									<p class="text-base-content/60 text-sm">Deadline</p>
									<p class="font-medium">{formatTimeAgo(task.deadlineDate)}</p>
								</div>
							{:else if task.dateRange?.start && task.dateRange?.end}
								<div>
									<p class="text-base-content/60 text-sm">Date Range</p>
									<p class="font-medium">
										{new Date(task.dateRange.start).toLocaleDateString()} -
										{new Date(task.dateRange.end).toLocaleDateString()}
									</p>
								</div>
							{/if}

							{#if task.client?.user}
								<div>
									<p class="text-base-content/60 text-sm">Posted By</p>
									<p class="font-medium">{task.client.user.name}</p>
								</div>
							{/if}
						</div>
					</div>

					{#if task.skillIds && task.skillIds.length > 0}
						<div class="mb-4 flex flex-wrap gap-2">
							{#each task.skillIds as skillItem}
								{#if skillItem}
									<span class="badge badge-primary badge-outline">{skillItem}</span>
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
								{task.bids?.length ?? 0} Bids
							</div>
						</div>

						<button
							class="btn btn-primary btn-sm"
							class:btn-disabled={task.status !== TaskStatusEnum.OPEN}
							onclick={() => {
								if (task.status === TaskStatusEnum.OPEN) {
									selectedTaskId = task.id.toString();
									isSidebarOpen = true;
								}
							}}
							aria-label="Bid on this task"
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
							{task.status === TaskStatusEnum.OPEN ? 'Bid Now' : 'Bidding closed'}
						</button>
					</div>
				</div>

				{#if index < $searchTasksQuery.data.tasks.items.length - 1}
					<div class="divider mx-auto w-[90%]"></div>
				{/if}
			{/each}
		</div>

		<!-- Infinite Scroll Target -->
		<div bind:this={scrollTarget} class="mt-4 h-10">
			{#if $searchTasksQuery.fetching && searchParams.page && searchParams.page > 1}
				<div class="flex justify-center py-2">
					<span class="loading loading-spinner loading-md"></span>
				</div>
			{/if}
		</div>
	{:else if !$searchTasksQuery.fetching}
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
			<h3 class="mt-4 text-lg font-semibold">No tasks found</h3>
			<p class="text-base-content/60 mt-1">Try adjusting your filters or search criteria</p>
			<button class="btn btn-primary mt-4" onclick={clearFilters}>Clear Filters</button>
		</div>
	{/if}

	<!-- Saved Searches Section -->
	{#if showSavedSearches}
		<SavedSearchList />
	{/if}
</div>

<!-- Advanced Filter Drawer Component -->
<FilterDrawer
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
/>

<TaskDetailsBidDrawer taskId={selectedTaskId} onClose={handleSidebarClose} isOpen={isSidebarOpen} />
