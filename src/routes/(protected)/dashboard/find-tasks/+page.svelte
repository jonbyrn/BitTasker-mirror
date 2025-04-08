<script lang="ts">
	import type { TaskResponse } from '$lib/types/task';
	import { formatDistanceToNow } from 'date-fns';
	import { appStore } from '$lib/stores/app.store';
	import { slide } from 'svelte/transition';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import Input from '$lib/components/Input.svelte';
	import taskService from '$lib/api/services/task.service';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';

	// State
	let searchQuery = $state('');
	let selectedCategory = $state({ label: '', value: '' });
	let selectedTaskType = $state({ label: '', value: '' });
	let sortBy = $state({ label: 'Created Date', value: 'createdAt' });
	let sortOrder = $state({ label: 'Descending', value: 'desc' });
	let minBudget = $state('');
	let maxBudget = $state('');
	let currentPage = $state(1);
	let limit = $state(10);
	let tasks = $state<TaskResponse['data']>([]);
	let meta = $state<TaskResponse['pagination'] | null>(null);
	let loading = $state(false);
	let isFiltersVisible = $state(true);

	// Bid drawer state
	let selectedTaskId = $state<string | null>(null);
	let isSidebarOpen = $state(false);

	// Load tasks with filters
	async function loadTasks() {
		try {
			loading = true;
			const params: Record<string, any> = {
				page: currentPage,
				limit,
				sortBy: sortBy.value,
				sortOrder: sortOrder.value
			};

			// Only add filters if they have values
			if (searchQuery.trim()) {
				params.searchTerm = searchQuery.trim();
			}

			if (selectedCategory.value) {
				params.categoryIds = [parseInt(selectedCategory.value, 10)];
			}

			if (selectedTaskType.value) {
				params.taskType = selectedTaskType.value;
			}

			if (minBudget && maxBudget && parseFloat(minBudget) < parseFloat(maxBudget)) {
				params.minBudget = parseFloat(minBudget);
				params.maxBudget = parseFloat(maxBudget);
			} else if (minBudget && parseFloat(minBudget) > 0) {
				params.minBudget = parseFloat(minBudget);
			} else if (maxBudget && parseFloat(maxBudget) > 0) {
				params.maxBudget = parseFloat(maxBudget);
			}

			const response = await taskService.getAllTasks(params);
			tasks = response.data;
			meta = response.pagination;
		} catch (error) {
			console.error('Error loading tasks:', error);
		} finally {
			loading = false;
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
		debouncedLoadTasks();
	}

	// Handle page change
	function handlePageChange(newPage: number) {
		currentPage = newPage;
		loading = true;
		loadTasks(); // Immediate load for page changes
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedCategory = { label: '', value: '' };
		selectedTaskType = { label: '', value: '' };
		sortBy = { label: 'Created Date', value: 'createdAt' };
		sortOrder = { label: 'Descending', value: 'desc' };
		minBudget = '';
		maxBudget = '';
		handleFilterChange();
	}

	// Format date
	function formatTimeAgo(date: string): string {
		return formatDistanceToNow(new Date(date), { addSuffix: true });
	}

	// Handle sidebar close
	function handleSidebarClose() {
		isSidebarOpen = false;
		// Clear selected task after transition completes
		setTimeout(() => {
			selectedTaskId = null;
		}, 300);
	}

	// Initial load
	loadTasks();
</script>

<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<!-- Filters header -->
		<div class="mb-4 flex items-center justify-between">
			<h3 class="text-lg font-semibold">Filters</h3>
			<button
				class="btn btn-ghost btn-sm"
				onclick={() => (isFiltersVisible = !isFiltersVisible)}
				aria-expanded={isFiltersVisible}
				aria-label={isFiltersVisible ? 'Collapse filters' : 'Expand filters'}
			>
				{#if isFiltersVisible}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 15l7-7 7 7"
						/>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-6 w-6"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 9l-7 7-7-7"
						/>
					</svg>
				{/if}
			</button>
		</div>

		<!-- Filters content -->
		{#if isFiltersVisible}
			<div class="mb-6 flex flex-col gap-4" transition:slide>
				<div class="form-control w-full">
					<label for="search" class="label">
						<span class="label-text">Search</span>
					</label>
					<input
						id="search"
						type="text"
						placeholder="Search tasks..."
						class="input input-bordered w-full"
						bind:value={searchQuery}
						oninput={handleFilterChange}
					/>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control w-full">
						<Input
							id="category"
							label="Category"
							placeholder="Select a category"
							options={$appStore.categories.map((cat) => ({
								label: cat.name,
								value: cat.id.toString()
							}))}
							value={selectedCategory.label}
							onChange={(option) => {
								selectedCategory = option;
								handleFilterChange();
							}}
						/>
					</div>

					<div class="form-control">
						<Input
							id="taskType"
							label="Task Type"
							placeholder="Select a task type"
							options={[
								{ label: 'All Types', value: '' },
								{ label: 'Remote', value: 'REMOTE' },
								{ label: 'In Person', value: 'IN_PERSON' }
							]}
							type="select"
							autoComplete="off"
							value={selectedTaskType.label}
							onChange={(option) => {
								selectedTaskType = option;
								handleFilterChange();
							}}
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<label for="minBudget" class="label">
							<span class="label-text">Minimum Budget</span>
						</label>
						<input
							id="minBudget"
							type="number"
							placeholder="Min budget"
							class="input input-bordered w-full"
							bind:value={minBudget}
							min="0"
							step="0.0001"
							oninput={handleFilterChange}
						/>
					</div>

					<div class="form-control">
						<label for="maxBudget" class="label">
							<span class="label-text">Maximum Budget</span>
						</label>
						<input
							id="maxBudget"
							type="number"
							placeholder="Max budget"
							class="input input-bordered w-full"
							bind:value={maxBudget}
							min={minBudget}
							step="0.0001"
							oninput={handleFilterChange}
						/>
					</div>
				</div>

				<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<div class="form-control">
						<Input
							id="sortField"
							label="Sort By"
							options={[
								{ label: 'Created Date', value: 'createdAt' },
								{ label: 'Updated Date', value: 'updatedAt' },
								{ label: 'Budget', value: 'budget' },
								{ label: 'Deadline', value: 'deadline' },
								{ label: 'Title', value: 'title' }
							]}
							value={sortBy.label}
							onChange={(option) => {
								sortBy = option;
								handleFilterChange();
							}}
						/>
					</div>

					<div class="form-control">
						<Input
							id="sortOrder"
							label="Sort Order"
							options={[
								{ label: 'Descending', value: 'desc' },
								{ label: 'Ascending', value: 'asc' }
							]}
							value={sortOrder.label}
							onChange={(option) => {
								sortOrder = option;
								handleFilterChange();
							}}
						/>
					</div>
				</div>

				<div class="flex justify-end">
					<button class="btn" onclick={clearFilters}>Clear Filters</button>
				</div>
			</div>
		{/if}

		<!-- Results count -->
		<div class="mb-4">
			<p class="text-base-content/70">
				{#if meta}
					Showing {(currentPage - 1) * limit + 1} - {Math.min(currentPage * limit, meta.total)}
					of {meta.total} tasks
				{/if}
			</p>
		</div>

		<!-- Task List -->
		{#if loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{:else if tasks.length > 0}
			<div class="space-y-4">
				{#each tasks as task}
					<div class="card bg-base-200 shadow-md transition-shadow hover:shadow-lg">
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
					</div>
				{/each}
			</div>

			<!-- Pagination -->
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
	</div>
</div>

<TaskDetailsBidDrawer taskId={selectedTaskId} onClose={handleSidebarClose} isOpen={isSidebarOpen} />
