<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { onMount } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { slide } from 'svelte/transition';
	import taskService from '$lib/api/services/task.service';
	import DashboardBidsPanel from '$lib/components/bidding/DashboardBidsPanel.svelte';
	import TaskDrawer from '$lib/components/task/TaskDrawer.svelte';

	let tasks = $state<Task[]>([]);
	let loading = $state(false);
	let activeTab = $state('tasks'); // 'tasks' or 'bids'
	let selectedTaskId = $state<number | null>(null);
	let drawerOpen = $state(false);
	let drawerInitialTab = $state('details');

	// Load tasks with filters
	async function loadTasks() {
		try {
			loading = true;
			tasks = await taskService.getMyTasks();
		} catch (error) {
			console.error('Error loading tasks:', error);
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

	// Task drawer functions
	const openTaskDrawer = (taskId: number, tab: string = 'details') => {
		selectedTaskId = taskId;
		drawerInitialTab = tab;
		drawerOpen = true;
	}

	const closeTaskDrawer = () => drawerOpen = false;
</script>

<div class="mb-6">
	<!-- Dashboard Header -->
	<div class="mb-6 flex items-center justify-between">
		<h2 class="text-2xl font-bold">My Dashboard</h2>
		<a href="/dashboard/create-task" class="btn btn-primary">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-2 h-5 w-5"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			Create Task
		</a>
	</div>

	<!-- Dashboard Tabs -->
	<div class="tabs tabs-bordered mb-6" role="tablist" aria-label="Dashboard tabs">
		<button
			class="tab {activeTab === 'tasks' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'tasks')}
			role="tab"
			aria-selected={activeTab === 'tasks'}
			aria-controls="panel-tasks"
			id="tab-tasks"
		>
			My Tasks
		</button>
		<button
			class="tab {activeTab === 'bids' ? 'tab-active' : ''}"
			onclick={() => (activeTab = 'bids')}
			role="tab"
			aria-selected={activeTab === 'bids'}
			aria-controls="panel-bids"
			id="tab-bids"
		>
			My Bids
		</button>
	</div>

	<!-- Tasks Panel -->
	{#if activeTab === 'tasks'}
		<div
			id="panel-tasks"
			role="tabpanel"
			aria-labelledby="tab-tasks"
			class="card bg-base-100 shadow-xl"
			transition:slide={{ duration: 300 }}
		>
			<div class="card-body">
				<!-- Loading State -->
				{#if loading}
					<div class="flex justify-center py-8">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
				{/if}

				<!-- Task List -->
				{#if !loading && tasks.length > 0}
					<div class="grid grid-cols-1 gap-6">
						{#each tasks as task}
							<div class="card bg-base-200 shadow-md transition-shadow hover:shadow-lg">
								<div class="card-body">
									<div class="flex justify-between">
										<div class="flex gap-2 items-center">
											<h3 class="card-title text-lg">{task.title}</h3>
											{#if task.isOwner}
												<span class="badge badge-sm badge-info">Your Task</span>
											{/if}
										</div>
										<div
											class="badge {task.status === 'OPEN'
												? 'badge-success'
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
		</div>
	{:else if activeTab === 'bids'}
		<!-- Bids Panel -->
		<div
			id="panel-bids"
			role="tabpanel"
			aria-labelledby="tab-bids"
			class="card bg-base-100 shadow-xl"
			transition:slide={{ duration: 300 }}
		>
			<div class="card-body">
				<DashboardBidsPanel />
			</div>
		</div>
	{/if}
</div>

<!-- Task Drawer -->
<TaskDrawer 
	taskId={selectedTaskId} 
	isOpen={drawerOpen} 
	activeTab={drawerInitialTab}
	onClose={closeTaskDrawer} 
/>
