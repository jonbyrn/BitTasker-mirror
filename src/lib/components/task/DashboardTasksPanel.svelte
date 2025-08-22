<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t, locale } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { formatDistanceToNow } from 'date-fns';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { myTasksStore } from '$lib/stores/task.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import KINDS from '$lib/utils/constants/kinds';
	import { calculateUsdtEstimate, formatSatsAmount } from '$lib/utils/helpers/crypto';
	import { formatCurrencyWithUsd } from '$lib/utils/helpers/currencyFormatter';
	import { user } from '$lib/stores/user.store';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
	}>();

	let btcPrice = $state<number>(63000); // Default fallback price

	// Nostr caching
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
	let nostrCache = $state<Map<string, { data: any; timestamp: number }>>(new Map());

	// Convert status to user-friendly string
	function formatStatus(status: string): string {
		switch (status) {
			case TaskStatusEnum.IN_PROGRESS:
				return $t('task.status.in_progress');
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
	 * Get cached tasks or fetch from Nostr
	 */
	async function getCachedTasks(): Promise<Task[]> {
		const npub = await getNpub();
		if (!npub) {
			throw new Error('No public key found');
		}

		const cacheKey = `tasks-${npub}`;
		const cached = nostrCache.get(cacheKey);

		// Return cached data if still valid
		if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
			console.log('Using cached tasks');
			return cached.data;
		}

		// Fetch fresh data
		const { data: events } = await nostrEventsService.findEvents({
			kinds: [KINDS.TASK_CREATION],
			authors: [npub]
		});

		const tasks = events.map((event) => {
			const content = JSON.parse(event.content);
			return {
				...content,
				id: event.id,
				author: event.pubkey
			};
		});

		// Cache the results
		nostrCache.set(cacheKey, { data: tasks, timestamp: Date.now() });
		return tasks;
	}

	onMount(async () => {
		$myTasksStore.loading = true;
		$myTasksStore.error = null;

		try {
			// Load tasks (with caching)
			const tasks = await getCachedTasks();
			$myTasksStore.items = tasks;
		} catch (err) {
			console.error('Error loading tasks:', err);
			$myTasksStore.error = 'Failed to load tasks';
		} finally {
			$myTasksStore.loading = false;
		}

		// Fetch BTC price in background (non-blocking)
		if (typeof requestIdleCallback !== 'undefined') {
			requestIdleCallback(
				() => {
					fetchBtcPrice();
				},
				{ timeout: 2000 }
			);
		} else {
			// Fallback for browsers without requestIdleCallback
			setTimeout(() => {
				fetchBtcPrice();
			}, 100);
		}
	});
</script>

<!-- Loading State -->
{#if $myTasksStore.loading}
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
{#if !$myTasksStore.loading && $myTasksStore.items.length > 0}
	<div class="grid grid-cols-1 gap-2">
		{#each $myTasksStore.items as task}
			{#if task}
				<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex items-center justify-between gap-2">
							<h4 class="card-title line-clamp-2">{task.title}</h4>
						</div>

						<div class="flex w-full items-center justify-between">
							<!-- Left: Schedule -->
							<div class="flex items-center gap-2">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-base-content/60 h-4 w-4 flex-shrink-0"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div class="flex flex-col">
									<small class="text-base-content/60 text-xs">{$t('dashboard.task_details_by_task.to_be_done_on')}</small>
									{#if task.deadline}
										<span class="text-sm font-medium">
											{$t('dashboard.task_details_by_task.before')} {new Date(task.deadline).toLocaleDateString('en-US', {
												weekday: 'short',
												month: 'short',
												day: 'numeric'
											})}
										</span>
									{:else if task.dateRange}
										<span class="text-sm font-medium">
											{$t('dashboard.task_details_by_task.after')} {new Date(task.dateRange.start).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric'
											})}
											-
											{new Date(task.dateRange.end).toLocaleDateString('en-US', {
												month: 'short',
												day: 'numeric'
											})}
										</span>
									{/if}
								</div>
							</div>

							<!-- Right: Sats -->
							<div class="">
								<div class="text-lg font-bold">
									${calculateUsdtEstimate(task.budget.amount, btcPrice)}
									<!-- {#if task.budget.type === 'HOURLY'}
										<span class="text-sm">/hr</span>
									{/if} -->
									<div class="text-base-content/60 text-sm">
										{formatSatsAmount(task.budget.amount)}
									</div>
								</div>
							</div>
						</div>

						<div class="flex w-full items-start gap-2">
							<svg
								xmlns="http://www.w3.org/2000/svg"
								class="text-base-content/60 mt-1 h-4 w-4 flex-shrink-0"
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
							<div class="text-base-content/60 flex min-w-0 flex-1 flex-col">
								<span class="line-clamp-2 text-sm font-medium">
									{#if task.dropOffLocation?.displayName}
										{task.dropOffLocation.displayName}
									{:else if task.pickupLocation?.displayName}
										{task.pickupLocation.displayName}
									{:else}
										Remote
									{/if}
								</span>
							</div>
						</div>

						<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<!-- Left: Avatar, Username, and Review Stars -->
							<div class="flex items-center gap-3">
								<!-- Avatar -->
								<div class="avatar">
									<div class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full">
										{#if task.creator?.avatar}
											<img
												src={task.creator.avatar}
												alt="Avatar"
												class="h-8 w-8 rounded-full object-cover"
											/>
										{:else}
											<!-- Placeholder con iniciales del nombre -->
											<div
												class="avatar placeholder text-neutral-content bg-primary flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-center"
											>
												{#if task.creator?.username}
													<span class="text-lg font-semibold">
														{task.creator.username.charAt(0).toUpperCase()}
													</span>
												{:else}
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="text-base-content/60 h-6 w-6"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
														/>
													</svg>
												{/if}
											</div>
										{/if}
									</div>
								</div>

								<!-- Username and Review Stars -->
								<div class="flex flex-col">
									<span class="text-sm font-medium">
										{task.creator?.username || 'Anonymous'}
									</span>
									<!-- Review Stars -->
									<div class="flex items-center">
										{#each Array(5) as _, i}
											<svg
												xmlns="http://www.w3.org/2000/svg"
												class="h-3 w-3 {i < 4 ? 'text-yellow-400' : 'text-base-content/30'}"
												fill="currentColor"
												viewBox="0 0 24 24"
											>
												<path
													d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
												/>
											</svg>
										{/each}
										<span class="text-base-content/60 ml-1 text-xs">4.0</span>
									</div>
								</div>
							</div>

							<!-- Right: Action Buttons -->
							<div class="flex w-full items-center gap-2 md:w-auto">
								<button
									class="btn btn-primary btn-sm flex-1 md:flex-none"
									class:btn-disabled={task.status !== TaskStatusEnum.OPEN}
									onclick={(e) => {
										e.stopPropagation();
										openTaskDrawer(task, 'details');
									}}
									aria-label={$t('task.actions.view_details')}
								>
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
											d="M12 4v16m8-8H4"
										/>
									</svg>
									{$t('task.actions.view_details')}
								</button>

								<button
									class="btn btn-info btn-sm btn-outline flex-1 md:flex-none"
									onclick={(e) => {
										e.stopPropagation();
										openTaskDrawer(task, 'bids');
									}}
									aria-label={$t('task.actions.view_bids')}
								>
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
											d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
										/>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
										/>
									</svg>
									{$t('task.actions.view_bids')}
								</button>
							</div>
						</div>
					</div>
				</div>
			{/if}
		{/each}
	</div>
{:else if !$myTasksStore.loading && !$myTasksStore.error}
	<div class="bg-base-100 rounded-xl py-12 text-center shadow-md">
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

{#if $myTasksStore.error}
	<div class="py-12 text-center">
		<h3 class="mt-4 text-lg font-semibold">{$t('task.error.loading')}</h3>
	</div>
{/if}
