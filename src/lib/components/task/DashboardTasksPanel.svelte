<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from '$lib/stores/i18n.store';
	import { onMount } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { queryTasks, TASK_KINDS } from '$lib/nostr/task';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
	}>();

	let tasks = $state<Task[]>([]);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let btcPrice = $state<number>(63000); // Default fallback price

	// Convert status to user-friendly string
	function formatStatus(status: string): string {
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
	function getStatusClass(status: string): string {
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

	onMount(async () => {
		isLoading = true;
		error = null;

		// Subscribe to tasks
		try {
			const npub = await getNpub();
			if (!npub) {
				throw new Error('No public key found');
			}

			await queryTasks(
				(event) => {
					const taskData = JSON.parse(event.content);
					if (taskData) {
						tasks = [
							...tasks,
							{
								...taskData,
								id: event.id,
								author: event.pubkey,
								status: taskData.status
							}
						];
					}
				},
				{
					kinds: [TASK_KINDS.TASK_CREATION],
					// Filter for tasks created by the current user
					authors: [npub]
				}
			);
		} catch (err) {
			console.error('Error subscribing to tasks:', err);
			error = 'Failed to load tasks';
		} finally {
			isLoading = false;
		}

		fetchBtcPrice();
	});
</script>

<!-- Loading State -->
{#if isLoading}
	<div class="space-y-2">
		{#each Array(2) as _}
			<div class="card bg-base-100 animate-pulse rounded-xl shadow-md">
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
{#if !isLoading && tasks.length > 0}
	<div class="grid grid-cols-1 gap-2">
		{#each tasks as task}
			{#if task}
				<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex items-center justify-between gap-2">
							<h3 class="card-title text-lg">{task.title}</h3>

							<!-- Bid Information -->
							<div class="badge badge-sm badge-info gap-1">
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
						{#if task.pickupLocation && task.pickupLocation.displayName}
							<small class="-mt-1 flex items-center gap-1">
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
								{task.pickupLocation.displayName}
							</small>
						{/if}
						<p class="text-base-content/80 my-2 line-clamp-2 truncate">{task.description}</p>

						<div class="flex items-center gap-2">
							<div class="badge badge-neutral pb-[2px] lowercase">
								{task.taskType.replace('_', ' ')}
							</div>
							{#if task.status}
								<div class="badge badge-sm pb-[2px] lowercase {getStatusClass(task.status)}">
									{formatStatus(task.status)}
								</div>
							{/if}
						</div>

						<div class="my-2 grid grid-cols-2 gap-4">
							{#if task.budget !== null && task.budget !== undefined}
								<div>
									<p class="text-base-content/70 text-xs">{$t('task.budget.label')}</p>
									<p class="text-primary font-semibold">
										{formatCurrency(task.budget.amount)}
										{#if task.budget.type === 'HOURLY'}
											<span class="text-xs">{$t('task.budget.hourly')}</span>
										{/if}
									</p>
									<p class="text-info text-xs">
										≈ {calculateUsdtEstimate(task.budget.amount)} USDT
									</p>
								</div>
							{/if}
							<div>
								{#if task.deadline}
									<p class="text-base-content/70 text-xs">{$t('task.deadline.label')}</p>
									<p class="text-sm">{formatTimeAgo(task.deadline)}</p>
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

						<div class="card-actions mt-2 justify-end">
							<button
								class="btn btn-primary btn-sm"
								onclick={() => openTaskDrawer(task, 'details')}
							>
								{$t('task.actions.view_details')}
							</button>
							<button
								class="btn btn-outline btn-sm"
								onclick={() => openTaskDrawer(task, 'bids')}
							>
								{$t('task.actions.view_bids')}
							</button>
						</div>
					</div>
				</div>
			{/if}
		{/each}
	</div>
{:else if !isLoading && !error}
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

{#if error}
	<div class="py-12 text-center">
		<h3 class="mt-4 text-lg font-semibold">{$t('task.error.loading')}</h3>
	</div>
{/if}
