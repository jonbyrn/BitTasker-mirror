<script lang="ts">
	import type { TaskResponse, SearchTasksParams, TaskData } from '$lib/types/task';
	import { formatDistanceToNow } from 'date-fns';
	import {
		TaskStatusEnum,
		TaskTypeEnum,
		SortByEnum,
		SortOrderEnum
	} from '$lib/utils/enums/task.enum';
	import taskService from '$lib/api/gql/services/task.service';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import SaveSearchButton from '$lib/components/saved-searches/SaveSearchButton.svelte';
	import SavedSearchList from '$lib/components/saved-searches/SavedSearchList.svelte';
	import recommendationsService from '$lib/api/services/recommendations.service';
	import RecommendedTasks from '$lib/components/recommendations/RecommendedTasks.svelte';

	// State
	let searchQuery = $state('');
	let selectedCategory = $state({ label: '', value: '' });
	let selectedTaskType = $state({ label: '', value: '' });
	let sortBy = $state({ label: 'Created Date', value: SortByEnum.CREATED_AT });
	let sortOrder = $state({ label: 'Descending', value: SortOrderEnum.DESC });
	let minBudget = $state('');
	let maxBudget = $state('');
	let currentPage = $state(1);
	let limit = $state(10);
	let tasks = $state<TaskResponse['data']>([]);
	let meta = $state<TaskResponse['pagination'] | null>(null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state<string | null>(null);

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

	// Track if component is mounted
	let isMounted = false;

	// Search parameters for advanced filtering
	function getInitialSearchParams() {
		return {
			searchTerm: '',
			status: [TaskStatusEnum.OPEN],
			taskType: undefined,
			minBudget: undefined,
			maxBudget: undefined,
			budgetType: undefined,
			categoryIds: [],
			skills: [],
			page: 1,
			limit: 10,
			sortBy: SortByEnum.CREATED_AT,
			sortOrder: SortOrderEnum.DESC
		};
	}

	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());

	// Bid drawer state
	let selectedTaskId = $state<string | null>(null);
	let isSidebarOpen = $state(false);

	// Load tasks with filters
	async function loadTasks(resetTasks = true) {
		try {
			if (resetTasks) {
				loading = true;
				error = null;
			} else {
				loadingMore = true;
			}

			// Synchronize standard filters with searchParams
			const currentParams = { ...searchParams };
			const currentPageValue = currentPage;
			const limitValue = limit;
			const sortByValue = sortBy.value;
			const sortOrderValue = sortOrder.value;
			const searchQueryValue = searchQuery.trim() || undefined;

			searchParams = {
				...currentParams,
				page: currentPageValue,
				limit: limitValue,
				sortBy: sortByValue,
				sortOrder: sortOrderValue,
				searchTerm: searchQueryValue
			};

			if (selectedCategory.value) {
				searchParams.categoryIds = [parseInt(selectedCategory.value, 10)];
			}

			if (selectedTaskType.value) {
				searchParams.taskType = selectedTaskType.value as TaskTypeEnum;
			}

			if (minBudget && maxBudget && parseFloat(minBudget) < parseFloat(maxBudget)) {
				searchParams.minBudget = parseFloat(minBudget);
				searchParams.maxBudget = parseFloat(maxBudget);
			} else if (minBudget && parseFloat(minBudget) > 0) {
				searchParams.minBudget = parseFloat(minBudget);
			} else if (maxBudget && parseFloat(maxBudget) > 0) {
				searchParams.maxBudget = parseFloat(maxBudget);
			}

			const response = await taskService.getAllTasks(searchParams);

			if (resetTasks) {
				tasks = response.data;
			} else {
				tasks = [...tasks, ...response.data];
			}

			meta = response.pagination;
		} catch (err) {
			console.error('Error loading tasks:', err);
			error = 'Failed to load tasks. Please try again.';
		} finally {
			loading = false;
			loadingMore = false;
		}
	}

	// Load more tasks (for infinite scroll)
	async function loadMoreTasks() {
		if (meta && meta.hasNextPage && !loadingMore) {
			currentPage += 1;
			await loadTasks(false);
		}
	}

	// Load recommendations
	async function loadRecommendations() {
		try {
			loadingRecommendations = true;
			const response = await recommendationsService.getRecommendations(10);
			recommendedTasks = response.recommendations.map((r) => r.task);
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

	// Handle filter changes with debounce
	const debouncedLoadTasks = debounce(() => {
		loadTasks();
	}, 500);

	function handleFilterChange() {
		loading = true; // Update loading state immediately
		currentPage = 1; // Reset to first page
		searchParams.page = 1;
		debouncedLoadTasks();
	}

	// Handle advanced filter drawer apply
	function handleFilterApply(filters: SearchTasksParams) {
		// Merge filters with current search params and reset pagination
		searchParams = {
			...filters,
			page: 1
		};
		currentPage = 1;

		// Sync with form controls
		searchQuery = filters.searchTerm || '';

		if (filters.minBudget) {
			minBudget = String(filters.minBudget);
		}

		if (filters.maxBudget) {
			maxBudget = String(filters.maxBudget);
		}

		if (filters.taskType) {
			selectedTaskType = {
				label: filters.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In Person',
				value: filters.taskType
			};
		}

		loadTasks();
	}

	// Handle page change
	function handlePageChange(newPage: number) {
		currentPage = newPage;
		searchParams.page = newPage;
		loading = true;
		loadTasks(); // Immediate load for page changes
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

		// Reset search params
		searchParams = getInitialSearchParams();
		const limitValue = limit; // Capture current limit value
		searchParams.limit = limitValue;

		handleFilterChange();
	}

	// Format date
	function formatTimeAgo(date: string): string {
		return formatDistanceToNow(new Date(date), { addSuffix: true });
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
		// This would typically use a router to navigate
		window.location.href = `/tasks/${taskId}`;
	}

	// Handle save search success
	function handleSearchSaved() {
		// Refresh saved searches list by toggling state in a closure
		const currentState = showSavedSearches;
		showSavedSearches = false;
		setTimeout(() => {
			showSavedSearches = !currentState ? currentState : true;
		}, 100);
	}

	// Handle sidebar close
	function handleSidebarClose() {
		isSidebarOpen = false;
		// Clear selected task after transition completes
		setTimeout(() => {
			selectedTaskId = null;
		}, 300);
	}

	// Setup intersection observer for infinite scroll
	function setupInfiniteScroll() {
		if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
			observer = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && meta?.hasNextPage && !loading && !loadingMore) {
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
			observer.disconnect();
		}
	}

	// Toggle all recommendations
	function toggleAllRecommendations() {
		showAllRecommendations = !showAllRecommendations;
	}

	// Task type filter handler
	function toggleTaskType(type: TaskTypeEnum | undefined) {
		searchParams = {
			...searchParams,
			taskType: searchParams.taskType === type ? undefined : type,
			page: 1
		};
		currentPage = 1;
		loadTasks();
	}

	// Initial load
	$effect(() => {
		if (!isMounted) {
			isMounted = true;
			loadTasks();
			loadRecommendations();
			setupInfiniteScroll();
		}

		return () => {
			cleanupInfiniteScroll();
		};
	});
</script>

<div class="mx-auto max-w-7xl p-4 sm:p-0">
	<!-- Page Header -->
	<div class="mb-6">
		<h1 class="mb-2 text-2xl font-bold">Find Tasks</h1>
		<p class="text-gray-600">Discover tasks that match your skills and interests</p>
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
				oninput={handleFilterChange}
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
				class:btn-primary={searchParams.taskType === TaskTypeEnum.REMOTE}
				onclick={() => toggleTaskType(TaskTypeEnum.REMOTE)}
			>
				Remote
			</button>
			<button
				class="btn btn-sm"
				class:btn-primary={searchParams.taskType === TaskTypeEnum.IN_PERSON}
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
			{#if loading}
				<span class="bg-base-300 inline-block h-4 w-48 animate-pulse rounded"></span>
			{:else if meta}
				Showing {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, meta.total)}
				of {meta.total} tasks
			{/if}
		</p>
	</div>

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
	{#if loading}
		<div class="card bg-base-100 space-y-4 shadow-md">
			{#each Array(4) as _}
				<div class="card-body animate-pulse">
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
	{:else if tasks.length > 0}
		<div class="card bg-base-100 space-y-4 shadow-md transition-shadow hover:shadow-lg">
			{#each tasks as task, index}
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
							{:else if task.dateRange}
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
									<p class="font-medium">{task.client.user.email}</p>
								</div>
							{/if}
						</div>
					</div>

					{#if task.requiredSkills && task.requiredSkills.length > 0}
						<div class="mb-4 flex flex-wrap gap-2">
							{#each task.requiredSkills as skillItem}
								<span class="badge badge-primary badge-outline">{skillItem.skill.name}</span>
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
								{task.bids?.length || 0} Bids
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

				{#if index < tasks.length - 1}
					<div class="divider mx-auto w-[90%]"></div>
				{/if}
			{/each}
		</div>

		<!-- Infinite Scroll Target -->
		<div bind:this={scrollTarget} class="mt-4 h-10">
			{#if loadingMore}
				<div class="flex justify-center py-2">
					<span class="loading loading-spinner loading-md"></span>
				</div>
			{/if}
		</div>

		<!-- Comment out pagination since we're using infinite scroll -->
		<!-- 
			{#if meta && meta.totalPages > 1}
				<div class="join mt-6 flex justify-center">
					<button
						class="join-item btn"
						disabled={currentPage === 1}
						onclick={() => handlePageChange(currentPage - 1)}
					>
						«
					</button>
					{#each Array(meta.totalPages) as _, i}
						<button
							class="join-item btn"
							class:btn-active={currentPage === i + 1}
							onclick={() => handlePageChange(i + 1)}
						>
							{i + 1}
						</button>
					{/each}
					<button
						class="join-item btn"
						disabled={currentPage === meta.totalPages}
						onclick={() => handlePageChange(currentPage + 1)}
					>
						»
					</button>
				</div>
			{/if}
			-->
	{:else}
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
