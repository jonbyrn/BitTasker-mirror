<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	// import taskService from '$lib/api/services/task.service';
	import { executeQuery } from '$lib/api/gql';
	import { GET_MY_TASKS } from '$lib/api/gql/operations/tasks';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (taskId: number, tab?: string) => void;
	}>();

	let tasks = $state<Task[]>([]);
	let loading = $state(false);

	// Load tasks with filters
	async function loadTasks() {
		try {
			loading = true;
			// tasks = await taskService.getMyTasks();
			const { data, error } = await executeQuery(GET_MY_TASKS);
			
			if (error) {
				console.error('GraphQL error loading tasks:', error);
				tasks = [];
				return;
			}
			
			tasks = data.myTasks;
		} catch (error) {
			console.error('Error loading tasks:', error);
			tasks = [];
		} finally {
			loading = false;
		}
	}

	// Initial load
	onMount(() => {
		loadTasks();
	});

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

<div class="card-body">
	<!-- Loading State -->
	{#if loading}
		<div class="space-y-6">
			{#each Array(3) as _}
				<div class="card bg-base-200 shadow-md animate-pulse">
					<div class="card-body">
						<div class="flex justify-between">
							<div class="flex items-center gap-2">
								<div class="bg-base-300 h-7 w-48 rounded"></div>
							</div>
							<div class="bg-base-300 h-6 w-24 rounded"></div>
						</div>
						<div class="bg-base-300 my-2 h-4 w-full rounded"></div>
						<div class="bg-base-300 mb-4 h-4 w-2/3 rounded"></div>

						<div class="my-2 flex flex-wrap gap-2">
							<div class="bg-base-300 h-6 w-28 rounded"></div>
							<div class="bg-base-300 h-6 w-32 rounded"></div>
						</div>

						<div class="my-2 grid grid-cols-2 gap-4">
							<div>
								<div class="bg-base-300 mb-1 h-4 w-16 rounded"></div>
								<div class="bg-base-300 h-6 w-32 rounded"></div>
							</div>
							<div>
								<div class="bg-base-300 mb-1 h-4 w-24 rounded"></div>
								<div class="bg-base-300 h-6 w-36 rounded"></div>
							</div>
						</div>

						<div class="mt-2 mb-2 flex items-center justify-between">
							<div class="bg-base-300 h-6 w-20 rounded"></div>
						</div>

						<div class="card-actions mt-2 justify-end">
							<div class="bg-base-300 h-9 w-28 rounded"></div>
							<div class="bg-base-300 h-9 w-24 rounded"></div>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Task List -->
	{#if !loading && tasks.length > 0}
		<div class="grid grid-cols-1 gap-6">
			{#each tasks as task}
				<div class="card bg-base-200 shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex justify-between">
							<div class="flex items-center gap-2">
								<h3 class="card-title text-lg">{task.title}</h3>
								{#if task.isOwner}
									<div class="badge badge-accent">Owner</div>
								{/if}
							</div>
							<div
								class="badge {task.status === 'OPEN'
									? 'badge-success'
									: task.status === 'IN_PROGRESS'
									? 'badge-warning'
									: task.status === 'COMPLETED'
									? 'badge-primary'
									: 'badge-neutral'}"
							>
								{task.status}
							</div>
						</div>
						<p class="text-base-content/80 my-2 line-clamp-2">{task.description}</p>

						<div class="my-2 flex flex-wrap gap-2">
							<div class="badge badge-neutral">{task.taskType.replace('_', ' ')}</div>
							{#if task.pickupLocation}
								<div class="badge badge-outline">
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
									{task.pickupLocation.zipCode}
								</div>
							{/if}
						</div>

						<div class="my-2 grid grid-cols-2 gap-4">
							<div>
								<p class="text-base-content/70 text-xs">Budget</p>
								<p class="text-primary font-semibold">
									{formatCurrency(task.budget)}
									{#if task.budgetType === 'HOURLY'}
										<span class="text-xs">/hr</span>
									{/if}
								</p>
							</div>
							<div>
								{#if task.deadlineDate}
									<p class="text-base-content/70 text-xs">Deadline</p>
									<p class="text-sm">{formatTimeAgo(task.deadlineDate)}</p>
								{/if}
								{#if task.dateRange}
									<p class="text-base-content/70 text-xs">Date Range</p>
									<p class="text-sm">
										{formatTimeAgo(task.dateRange.start)} -
										{formatTimeAgo(task.dateRange.end)}
									</p>
								{/if}
							</div>
						</div>

						<!-- Bid Information -->
						<div class="mt-2 mb-2 flex items-center justify-between">
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

						<div class="card-actions mt-2 justify-end">
							<button
								class="btn btn-primary btn-sm"
								onclick={() => openTaskDrawer(task.id, 'details')}
							>
								View Details
							</button>
							<button
								class="btn btn-outline btn-sm"
								onclick={() => openTaskDrawer(task.id, 'bids')}
							>
								View Bids
							</button>
						</div>
					</div>
				</div>
			{/each}
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
</div>