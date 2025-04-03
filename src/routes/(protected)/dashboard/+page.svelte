<script lang="ts">
	import type { TaskResponse, Task } from '$lib/types/task';
	import { goto } from '$app/navigation';
	import { formatDistanceToNow } from 'date-fns';
	import taskService from '$lib/api/services/task.service';
	import BidForm from '$lib/components/Bid/BidForm.svelte';

	let currentPage = $state(1);
	let limit = $state(10);
	let tasks = $state<Task[]>([]);
	let meta = $state<TaskResponse['meta'] | null>(null);
	let loading = $state(false);
	let selectedTask = $state<Task | null>(null);

	// Load tasks with filters
	async function loadTasks() {
		try {
			loading = true;
			const response = await taskService.getMyTasks();
			tasks = response;
			// Since getMyTasks doesn't support pagination yet, we'll handle it client-side
			const startIndex = (currentPage - 1) * limit;
			const endIndex = startIndex + limit;
			tasks = response.slice(startIndex, endIndex);
			meta = {
				total: response.length,
				page: currentPage,
				limit,
				totalPages: Math.ceil(response.length / limit),
				hasNextPage: endIndex < response.length,
				hasPreviousPage: currentPage > 1
			};
		} catch (error) {
			console.error('Error loading tasks:', error);
		} finally {
			loading = false;
		}
	}

	// Handle page change
	function handlePageChange(newPage: number) {
		currentPage = newPage;
		loadTasks(); // Immediate load for page changes
	}

	// Handle bid success
	function handleBidSuccess() {
		selectedTask = null;
		loadTasks(); // Refresh the task list
	}

	// Initial load
	loadTasks();

	// Format dates
	function formatTimeAgo(date: string | null): string {
		if (!date) return 'No deadline';
		try {
			const parsedDate = new Date(date);
			if (isNaN(parsedDate.getTime())) {
				return 'Invalid date';
			}
			return formatDistanceToNow(parsedDate, { addSuffix: true });
		} catch (error) {
			console.error('Error formatting date:', error);
			return 'Invalid date';
		}
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
							<th>Date</th>
							<th>Status</th>
							<th>Action</th>
						</tr>
					</thead>
					<tbody>
						{#each tasks as task}
							<tr class="hover cursor-pointer">
								<td>
									<div>
										<button
											class="cursor-pointer font-bold"
											onclick={(e) => {
												e.stopPropagation();
												goto('/dashboard/task/' + task.id);
											}}
										>
											{task.title}
										</button>
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
									<div class="text-sm">{formatTimeAgo(task.deadlineDate)}</div>
								</td>
								<td>
									<div class="badge">{task.status}</div>
								</td>
								<td>
									<button
										class="btn btn-primary btn-sm"
										onclick={(e) => {
											e.stopPropagation();
											selectedTask = task;
										}}
									>
										Bid Now
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if !loading}
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

<!-- Bid Form Modal -->
{#if selectedTask}
	<BidForm task={selectedTask} onClose={() => (selectedTask = null)} onSuccess={handleBidSuccess} />
{/if}
