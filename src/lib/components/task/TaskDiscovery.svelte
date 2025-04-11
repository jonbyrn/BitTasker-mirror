<!-- 
  TaskDiscovery.svelte
  Main component for task discovery with integrated filtering,
  recommendations, and saved searches
-->
<script lang="ts">
	import type { SearchTasksParams, TaskData } from '$lib/types/task';
	import { BudgetTypeEnum, TaskTypeEnum, TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import taskService from '$lib/api/services/task.service';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import SaveSearchButton from '$lib/components/saved-searches/SaveSearchButton.svelte';
	import SavedSearchList from '$lib/components/saved-searches/SavedSearchList.svelte';
	import RecommendedTasks from '$lib/components/recommendations/RecommendedTasks.svelte';
	import HistoryBasedSuggestions from '$lib/components/recommendations/HistoryBasedSuggestions.svelte';

	// State
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let tasks = $state<TaskData[]>([]);
	let pagination = $state({
		total: 0,
		page: 1,
		limit: 10,
		totalPages: 0,
		hasNextPage: false,
		hasPreviousPage: false
	});
	let searchParams = $state<SearchTasksParams>({
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
		sortBy: 'createdAt',
		sortOrder: 'desc'
	});

	let isFilterDrawerOpen = $state(false);
	let showRecommendations = $state(true);
	let showSavedSearches = $state(true);
	let showHistorySuggestions = $state(true);

	// Load tasks on component mount or when search params change
	$effect(() => {
		if (searchParams) {
			loadTasks();
		}
	});

	// Function to load tasks based on search params
	async function loadTasks() {
		try {
			isLoading = true;
			error = null;

			const response = await taskService.getAllTasks(searchParams);

			tasks = response.data;
			pagination = {
				total: response.total,
				page: response.page,
				limit: response.limit,
				totalPages: response.totalPages,
				hasNextPage: response.hasNextPage,
				hasPreviousPage: response.hasPreviousPage
			};
		} catch (err) {
			console.error('Error loading tasks:', err);
			error = 'Failed to load tasks. Please try again.';
		} finally {
			isLoading = false;
		}
	}

	// Filter handlers
	function handleFilterApply(filters: SearchTasksParams) {
		// Merge filters with current search params and reset pagination
		searchParams = {
			...filters,
			page: 1
		};
	}

	// Pagination handlers
	function goToPage(page: number) {
		if (page < 1 || page > pagination.totalPages) return;
		searchParams = {
			...searchParams,
			page
		};
	}

	// Search input handler
	function handleSearchInput(event: Event) {
		const target = event.target as HTMLInputElement;
		searchParams = {
			...searchParams,
			searchTerm: target.value,
			page: 1 // Reset to first page on search
		};
	}

	// Task type filter handler
	function toggleTaskType(type: TaskTypeEnum | undefined) {
		searchParams = {
			...searchParams,
			taskType: searchParams.taskType === type ? undefined : type,
			page: 1
		};
	}

	// Handle save search success
	function handleSearchSaved() {
		// Refresh saved searches list
		showSavedSearches = false;
		setTimeout(() => {
			showSavedSearches = true;
		}, 100);
	}

	// Navigate to task details
	function goToTaskDetails(taskId: string) {
		// This would typically use a router to navigate
		window.location.href = `/tasks/${taskId}`;
	}

	// Format currency display
	function formatCurrency(amount: number, currency = 'BTC'): string {
		return `${amount} ${currency}`;
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
</script>

<div class="mx-auto max-w-7xl p-4">
	<!-- Page Header -->
	<div class="mb-6">
		<h1 class="mb-2 text-2xl font-bold">Find Tasks</h1>
		<p class="text-gray-600">Discover tasks that match your skills and interests</p>
	</div>

	<!-- Search and Filter Controls -->
	<div class="mb-6 flex flex-wrap items-center gap-3">
		<!-- Search Input -->
		<div class="grow">
			<div class="relative w-full">
				<input
					type="text"
					class="input input-bordered w-full pl-10"
					placeholder="Search tasks..."
					value={searchParams.searchTerm}
					oninput={handleSearchInput}
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
		</div>

		<!-- Quick Filters -->
		<div class="flex gap-2">
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
					d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
				/>
			</svg>
			Filters
		</button>

		<!-- Save Search Button -->
		<SaveSearchButton {searchParams} onSaved={handleSearchSaved} />
	</div>

	{#if showRecommendations}
		<!-- Personalized Recommendations Section -->
		<RecommendedTasks onTaskClick={goToTaskDetails} />
	{/if}

	{#if showSavedSearches}
		<!-- Saved Searches -->
		<SavedSearchList />
	{/if}

	{#if error}
		<!-- Error Alert -->
		<div class="alert alert-error mb-4">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 shrink-0"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
				/>
			</svg>
			<span>{error}</span>
			<button class="btn btn-sm" onclick={loadTasks}>Try Again</button>
		</div>
	{/if}

	<!-- User History Based Suggestions -->
	{#if showHistorySuggestions}
		<HistoryBasedSuggestions onTaskClick={goToTaskDetails} />
	{/if}

	<!-- Tasks Section -->
	<div class="mb-6">
		<h2 class="mb-4 text-xl font-bold">Available Tasks</h2>

		{#if isLoading}
			<!-- Loading Skeleton -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each Array(6) as _}
					<div class="card bg-base-100 animate-pulse shadow-sm">
						<div class="card-body">
							<div class="mb-2 h-4 w-3/4 rounded bg-gray-200"></div>
							<div class="mb-2 h-3 w-full rounded bg-gray-200"></div>
							<div class="h-3 w-5/6 rounded bg-gray-200"></div>
							<div class="mt-4 flex items-center justify-between">
								<div class="h-6 w-1/4 rounded bg-gray-200"></div>
								<div class="h-6 w-1/4 rounded bg-gray-200"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:else if tasks.length === 0}
			<!-- Empty State -->
			<div class="bg-base-200 rounded-lg py-12 text-center">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary mx-auto mb-4 h-16 w-16"
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
				<h3 class="mb-2 text-lg font-bold">No tasks found</h3>
				<p class="mb-4 text-gray-600">
					Try adjusting your search filters or check back later for new tasks.
				</p>
				<button class="btn btn-primary" onclick={() => (isFilterDrawerOpen = true)}>
					Adjust Filters
				</button>
			</div>
		{:else}
			<!-- Task Cards Grid -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each tasks as task}
					<div
						role="button"
						tabindex="0"
						class="card bg-base-100 cursor-pointer shadow-sm transition-shadow hover:shadow-md"
						onclick={() => goToTaskDetails(task.id.toString())}
						onkeydown={() => goToTaskDetails(task.id.toString())}
					>
						<div class="card-body p-4">
							<!-- Header with Title and Status -->
							<div class="flex items-start justify-between">
								<h3 class="card-title line-clamp-2 text-lg">{task.title}</h3>

								{#if task.isBoosted}
									<div class="badge badge-secondary badge-sm">Featured</div>
								{/if}
							</div>

							<!-- Description -->
							<p class="mb-2 line-clamp-3 text-sm">{task.description}</p>

							<!-- Task Metadata -->
							<div class="mb-2 flex flex-wrap gap-1">
								<div class="badge badge-outline badge-sm">
									{task.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In Person'}
								</div>

								{#if task.categories && task.categories.length > 0}
									<div class="badge badge-outline badge-sm">
										{task.categories[0].category.name}
									</div>
								{/if}

								{#if task.deadlineDate}
									<div class="badge badge-outline badge-sm">
										Due: {formatDate(task.deadlineDate)}
									</div>
								{/if}
							</div>

							<!-- Budget and Location -->
							<div class="mt-2 flex items-center justify-between">
								<div class="text-sm">
									{#if task.taskType === TaskTypeEnum.IN_PERSON && task.pickupLocation}
										<div class="flex items-center">
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="mr-1 h-4 w-4"
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
											<span>{task.pickupLocation.displayName}</span>
										</div>
									{/if}
								</div>

								<div class="font-semibold">
									{formatCurrency(task.budget, task.currency)}
									{#if task.budgetType === BudgetTypeEnum.HOURLY}
										<span class="text-xs font-normal">/hr</span>
									{/if}
								</div>
							</div>

							<!-- Bids Information (if applicable) -->
							{#if task.bids && task.bids.length > 0}
								<div class="mt-1 text-xs text-gray-500">
									{task.bids.length}
									{task.bids.length === 1 ? 'bid' : 'bids'} submitted
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			<!-- Pagination Controls -->
			{#if pagination.totalPages > 1}
				<div class="mt-6 flex justify-center">
					<div class="join">
						<button
							class="join-item btn btn-sm"
							disabled={!pagination.hasPreviousPage}
							onclick={() => goToPage(pagination.page - 1)}
						>
							«
						</button>

						{#each Array(pagination.totalPages) as _, i}
							{#if i + 1 === 1 || i + 1 === pagination.totalPages || (i + 1 >= pagination.page - 1 && i + 1 <= pagination.page + 1)}
								<button
									class="join-item btn btn-sm"
									class:btn-primary={i + 1 === pagination.page}
									onclick={() => goToPage(i + 1)}
								>
									{i + 1}
								</button>
							{:else if i + 1 === pagination.page - 2 || i + 1 === pagination.page + 2}
								<button class="join-item btn btn-sm btn-disabled">...</button>
							{/if}
						{/each}

						<button
							class="join-item btn btn-sm"
							disabled={!pagination.hasNextPage}
							onclick={() => goToPage(pagination.page + 1)}
						>
							»
						</button>
					</div>
				</div>
			{/if}
		{/if}
	</div>

	<!-- Filter Drawer Component -->
	<FilterDrawer
		isOpen={isFilterDrawerOpen}
		onClose={() => (isFilterDrawerOpen = false)}
		onApply={handleFilterApply}
	/>
</div>
