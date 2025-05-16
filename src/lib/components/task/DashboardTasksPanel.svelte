<script lang="ts">
	import { TasksStore, type Tasks$result } from '$houdini';
	import { user } from '$lib/stores/user.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { format, formatDistanceToNow } from 'date-fns';
	import { onMount } from 'svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { t } from '$lib/stores/i18n.store';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (taskId: number, tab?: string) => void;
	}>();

	let loading = $state(true);
	let error = $state<string | null>(null);
	let activeFilter = $state<string>('all');
	let btcPrice = $state<number>(63000); // Default fallback price

	// Filters
	const filters = [
		{ id: 'all', label: 'All Tasks', icon: 'folder-open' },
		{ id: 'in-progress', label: 'In Progress', icon: 'activity' },
		{ id: 'completed', label: 'Completed', icon: 'check-circle' },
		{ id: 'drafts', label: 'Drafts', icon: 'edit' }
	];

	// Task filtering
	const getFilteredTasks = (
		tasks: Tasks$result['myTasks'],
		filter: string
	): Tasks$result['myTasks'] => {
		switch (filter) {
			case 'in-progress':
				return tasks.filter((task) => task.status === TaskStatusEnum.IN_PROGRESS);
			case 'completed':
				return tasks.filter((task) => task.status === TaskStatusEnum.COMPLETED);
			case 'drafts':
				return tasks.filter((task) => task.status === TaskStatusEnum.DRAFT);
			default:
				return tasks;
		}
	};

	// Format date for display
	function formatDate(dateString: string): string {
		return format(new Date(dateString), 'MMM d, yyyy');
	}
	const tasksStore = new TasksStore();

	// Convert status to user-friendly string
	function formatStatus(status: Tasks$result['myTasks'][0]['status']): string {
		switch (status) {
			case TaskStatusEnum.IN_PROGRESS:
				return $t('task.status.in_progress');
			case TaskStatusEnum.DRAFT:
				return $t('task.status.draft');
			case TaskStatusEnum.OPEN:
				return $t('task.status.open');
			case TaskStatusEnum.COMPLETED:
				return $t('task.status.completed');
			case TaskStatusEnum.CANCELLED:
				return $t('task.status.cancelled');
			case TaskStatusEnum.DISPUTED:
				return $t('task.status.disputed');
			default:
				return status;
		}
	}

	// Get appropriate status badge class
	function getStatusClass(status: Tasks$result['myTasks'][0]['status']): string {
		switch (status) {
			case TaskStatusEnum.IN_PROGRESS:
				return 'badge-primary';
			case TaskStatusEnum.DRAFT:
				return 'badge-secondary';
			case TaskStatusEnum.OPEN:
				return 'badge-info';
			case TaskStatusEnum.COMPLETED:
				return 'badge-success';
			case TaskStatusEnum.CANCELLED:
				return 'badge-warning';
			case TaskStatusEnum.DISPUTED:
				return 'badge-error';
			default:
				return 'badge-ghost';
		}
	}

	// Calculate time ago
	function formatTimeAgo(date: string | null): string {
		if (!date) return $t('task.deadline.none');
		try {
			const parsedDate = new Date(date);
			if (isNaN(parsedDate.getTime())) {
				return $t('task.deadline.invalid');
			}
			return formatDistanceToNow(parsedDate, { addSuffix: true });
		} catch (error) {
			console.error('Error formatting date:', error);
			return $t('task.deadline.invalid');
		}
	}

	// Format currency
	function formatCurrency(amount: number): string {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'BTC'
		}).format(amount);
	}
	
	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
			console.log('Current BTC price (dashboard-tasks-panel):', btcPrice);
		} catch (error) {
			console.error('Error fetching BTC price:', error);
			// Keep using fallback price
		}
	}
	
	/**
	 * Calculate estimated USDT value based on BTC amount
	 */
	function calculateUsdtEstimate(btcAmount: number): string {
		const estimatedValue = btcAmount * btcPrice;
		return estimatedValue.toLocaleString('en-US', {
			maximumFractionDigits: 2,
			minimumFractionDigits: 2
		});
	}

	onMount(() => {
		tasksStore.fetch();
		fetchBtcPrice();
	});
</script>

<div class="card-body">
	<!-- Loading State -->
	{#if $tasksStore.fetching}
		<div class="space-y-6">
			{#each Array(2) as _}
				<div class="card bg-base-200 animate-pulse shadow-md">
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
	{#if !$tasksStore.fetching && $tasksStore.data?.myTasks && $tasksStore.data?.myTasks.length > 0}
		<div class="grid grid-cols-1 gap-6">
			{#each $tasksStore.data?.myTasks as task}
				<div class="card bg-base-200 shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex justify-between">
							<div class="flex items-center gap-2">
								<h3 class="card-title text-lg">{task.title}</h3>
								{#if task.clientId === $user.id}
									<div class="badge badge-accent">{$t('task.role.owner')}</div>
								{/if}
							</div>
							<div class="badge {getStatusClass(task.status)}">
								{formatStatus(task.status)}
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
							{#if task.budget !== null && task.budget !== undefined}
								<div>
									<p class="text-base-content/70 text-xs">{$t('task.budget.label')}</p>
									<p class="text-primary font-semibold">
										{formatCurrency(task.budget)}
										{#if task.budgetType === 'HOURLY'}
											<span class="text-xs">{$t('task.budget.hourly')}</span>
										{/if}
									</p>
									<p class="text-xs text-info">
										≈ {calculateUsdtEstimate(task.budget)} USDT
									</p>
								</div>
							{/if}
							<div>
								{#if task.deadlineDate}
									<p class="text-base-content/70 text-xs">{$t('task.deadline.label')}</p>
									<p class="text-sm">{formatTimeAgo(task.deadlineDate)}</p>
								{/if}
								{#if task.dateRange}
									<p class="text-base-content/70 text-xs">{$t('task.dateRange.label')}</p>
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
								{$t('task.actions.view_details')}
							</button>
							<button
								class="btn btn-outline btn-sm"
								onclick={() => openTaskDrawer(task.id, 'bids')}
							>
								{$t('task.actions.view_bids')}
							</button>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else if !$tasksStore.fetching && !$tasksStore.errors}
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
			<h3 class="mt-4 text-lg font-semibold">{$t('task.empty.no_tasks')}</h3>
		</div>
	{/if}

	{#if $tasksStore.errors}
		<div class="py-12 text-center">
			<h3 class="mt-4 text-lg font-semibold">{$t('task.error.loading')}</h3>
		</div>
	{/if}
</div>
