<script lang="ts">
	import type { TaskResponse, Task } from '$lib/types/task';
	import { formatDistanceToNow } from 'date-fns';
	import { getAllTasks } from '$lib/services/task.service';
	import { appStore } from '$lib/stores/app.store';
	import Input from '$lib/components/Input.svelte';

	let selectedCategory = $state({ label: '', value: '' });
	let searchQuery = $state('');
	let currentPage = $state(1);
	let limit = $state(10);
	let tasks = $state<Task[]>([]);
	let meta = $state<TaskResponse['meta'] | null>(null);
	let loading = $state(false);

	// Load tasks with filters
	async function loadTasks() {
		try {
			const params: Record<string, any> = {
				page: currentPage,
				limit
			};

			// Only add filters if they have values
			if (selectedCategory.value) {
				params.categoryId = parseInt(selectedCategory.value, 10);
			}

			if (searchQuery.trim()) {
				params.searchTerm = searchQuery.trim();
			}

			const response = await getAllTasks(params);
			tasks = response.data;
			meta = response.meta;
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
		loadTasks(); // Immediate load for page changes
	}

	// Initial load
	loadTasks();

	// Format dates
	function formatTimeAgo(date: string): string {
		return formatDistanceToNow(new Date(date), { addSuffix: true });
	}

	// Format currency
	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD'
		}).format(amount);
	}
</script>

<div class="card bg-base-100 mb-6 shadow-xl">
	<div class="card-body">
		<!-- Filters -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row">
			<div class="form-control w-full max-w-xs">
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

			<div class="form-control w-full">
				<label for="search-input" class="label">
					<span class="label-text">Search</span>
				</label>
				<input
					id="search-input"
					type="text"
					placeholder="Search tasks..."
					class="input input-bordered w-full"
					bind:value={searchQuery}
					oninput={handleFilterChange}
				/>
			</div>
		</div>

		<!-- Loading State -->
		{#if loading}
			<div class="flex justify-center py-8">
				<span class="loading loading-spinner loading-lg"></span>
			</div>
		{/if}

		<!-- Task List -->
		{#if !loading && tasks.length > 0}
			<div class="overflow-x-auto">
				<table class="table-zebra table w-full">
					<thead>
						<tr>
							<th>Task</th>
							<th>Budget</th>
							<th>Posted</th>
							<th>Status</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{#each tasks as task}
							<tr class="hover">
								<td>
									<div>
										<div class="font-bold">{task.title}</div>
										<div class="max-w-xs truncate text-sm opacity-75">
											{task.description}
										</div>
										<div class="mt-1">
											<span class="badge badge-neutral badge-sm">{task.taskType}</span>
											{#if task.pickupLocation}
												<span class="badge badge-neutral badge-sm"
													>{task.pickupLocation.zipCode}</span
												>
											{/if}
										</div>
									</div>
								</td>
								<td>
									<div class="text-primary font-semibold">
										{formatCurrency(task.budget)}
										{#if task.budgetType === 'HOURLY'}
											<span class="text-sm opacity-75">/hr</span>
										{/if}
									</div>
								</td>
								<td>
									<div class="text-sm">{formatTimeAgo(task.deadline)}</div>
								</td>
								<td>
									<div class="badge">{task.status}</div>
								</td>
								<td>
									<button class="btn btn-primary btn-sm">Bid Now</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if !loading}
			<div class="alert alert-info">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					fill="none"
					viewBox="0 0 24 24"
					class="h-6 w-6 shrink-0 stroke-current"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
					></path>
				</svg>
				<span>No tasks match your search criteria. Try adjusting your filters.</span>
			</div>
		{/if}

		<!-- Pagination -->
		{#if meta && meta.totalPages > 1}
			<div class="join mt-6 flex justify-center">
				<button 
					class="join-item btn"
					disabled={!meta.hasPreviousPage}
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
					disabled={!meta.hasNextPage} 
					onclick={() => handlePageChange(currentPage + 1)}
				>
					»
				</button>
			</div>
		{/if}
	</div>
</div>
