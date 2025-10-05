<script lang="ts">
	import type { Task } from '$lib/types/task';
	import { t } from 'svelte-i18n';
	import { onMount } from 'svelte';
	import { getNpub } from '$lib/utils/nostrKeys';
	import { myTasksStore } from '$lib/stores/task.store';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import nostrEventsService from '$lib/api/services/nostr/events';
	import KINDS from '$lib/utils/constants/kinds';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/stores/breezWallet.store';
	import { formatStandardDateTime, formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import TranslatableTask from './TranslatableTask.svelte';

	// Props
	const { openTaskDrawer } = $props<{
		openTaskDrawer: (task: Task, tab?: string) => void;
	}>();

	// Task filter categories
	type TaskFilterCategory = 'bids_received' | 'tasks_in_progress' | 'tasks_completed';

	let activeFilter = $state<TaskFilterCategory>('bids_received');
	let btcPrice = $state<number>(63000); // Default fallback price
	let isDropdownOpen = $state<boolean>(false);

	function formatDateTimeReactive(date: Date) {
		return formatStandardDateTime(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDate: Date, endDate: Date) {
		const start = formatStandardDateShort(startDate, $locale || 'en');
		const end = formatStandardDateShort(endDate, $locale || 'en');
		return `${start} - ${end}`;
	}

	// Nostr caching
	const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
	let nostrCache = $state<Map<string, { data: any; timestamp: number }>>(new Map());

	// Filter options - reactive to language changes
	const filterOptions = $derived([
		{ id: 'bids_received', label: $t('task.filters.bids_received') },
		{ id: 'tasks_in_progress', label: $t('task.filters.tasks_in_progress') },
		{ id: 'tasks_completed', label: $t('task.filters.tasks_completed') }
	] as const);

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

	/**
	 * Filter tasks based on selected category
	 */
	function getFilteredTasks(tasks: Task[], filter: TaskFilterCategory): Task[] {
		switch (filter) {
			case 'bids_received':
				return tasks.filter((task) => task.status === TaskStatusEnum.OPEN);

			case 'tasks_in_progress':
				return tasks.filter((task) => task.status === TaskStatusEnum.IN_PROGRESS);
			case 'tasks_completed':
				return tasks.filter((task) => task.status === TaskStatusEnum.COMPLETED);

			default:
				return tasks;
		}
	}

	/**
	 * Get action buttons for each category
	 */
	function getActionButtons(task: Task, category: TaskFilterCategory) {
		switch (category) {
			case 'bids_received':
				return [
					{
						label: $t('task.actions.view_details'),
						class: 'btn-primary btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							openTaskDrawer(task, 'details');
						},
						icon: 'view_details'
					},
					{
						label: $t('task.actions.view_bids'),
						class: 'btn-outline btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							goto(`/dashboard/task/${task.id}/bids`);
						},
						icon: 'view_bids'
					}
				];

			case 'tasks_in_progress':
				return [
					{
						label: $t('task.actions.mark_as_done'),
						class: 'btn-success btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							markTaskAsDone(task);
						},
						icon: 'mark_as_done'
					},
					{
						label: $t('task.actions.rescope'),
						class: 'btn-info btn-outline btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							rescopeTask(task);
						},
						icon: 'rescope'
					}
				];

			case 'tasks_completed':
				return [
					{
						label: $t('task.actions.view_details'),
						class: 'btn-primary btn-sm',
						onclick: (e: any) => {
							e.stopPropagation();
							openTaskDrawer(task, 'details');
						},
						icon: 'view_details'
					}
				];

			default:
				return [];
		}
	}

	/**
	 * Mark task as done
	 */
	function markTaskAsDone(task: Task) {
		// TODO: Implement mark as done functionality
		console.log('Mark as done:', task.id);
	}

	/**
	 * Rescope task
	 */
	function rescopeTask(task: Task) {
		// TODO: Implement rescope functionality
		console.log('Rescope task:', task.id);
	}

	/**
	 * Delete task
	 */
	function deleteTask(task: Task) {
		// TODO: Implement delete task functionality
		console.log('Delete task:', task.id);
	}

	/**
	 * Dispute task
	 */
	function disputeTask(task: Task) {
		// TODO: Implement dispute task functionality
		console.log('Dispute task:', task.id);
	}

	/**
	 * Toggle dropdown
	 */
	function toggleDropdown() {
		isDropdownOpen = !isDropdownOpen;
	}

	/**
	 * Close dropdown when clicking outside
	 */
	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		const dropdownContainer = target.closest('.dropdown-container');
		if (!dropdownContainer && isDropdownOpen) {
			isDropdownOpen = false;
		}
	}

	/**
	 * Select filter option
	 */
	function selectFilter(optionId: TaskFilterCategory) {
		activeFilter = optionId;
		isDropdownOpen = false;
	}

	// Reactive statement to get filtered tasks
	const filteredTasks = $derived(
		$myTasksStore.items ? getFilteredTasks($myTasksStore.items, activeFilter) : []
	);

	onMount(() => {
		// Add click outside listener for dropdown
		document.addEventListener('click', handleClickOutside);

		// Load tasks and BTC price asynchronously
		(async () => {
			$myTasksStore.loading = true;
			$myTasksStore.error = null;

			try {
				// Load tasks (with caching)
				const tasks = await getCachedTasks();
				$myTasksStore.items = tasks;
			} catch (err) {
				console.error('Error loading tasks:', err);
				$myTasksStore.error = $t('task.error.loading');
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
		})();

		// Cleanup on unmount
		return () => {
			document.removeEventListener('click', handleClickOutside);
		};
	});
</script>

<!-- Task Category Filters - Responsive -->
<div class="mb-6 max-w-4xl">
	<!-- Desktop: Button filters -->
	<div class="hidden sm:block">
		<div class="mt-3 flex flex-col gap-3 sm:flex-row">
			{#each filterOptions as option}
				<button
					class="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-3xl py-2 text-center transition-all duration-200 {activeFilter ===
					option.id
						? 'text-primary bg-primary/10'
						: 'bg-base-100/40 hover:bg-base-100/50'}"
					onclick={() => (activeFilter = option.id)}
				>
					<!-- Icon for each category -->
					{#if option.id === 'bids_received'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}"
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
					{:else if option.id === 'tasks_in_progress'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					{:else if option.id === 'tasks_completed'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 {activeFilter === option.id ? 'text-primary' : ''}"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
					{/if}
					<span class="font-medium">{option.label}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Mobile: Custom dropdown -->
	<div class="block sm:hidden">
		<div class="dropdown-container relative mt-3">
			<button
				class="border-primary bg-primary/10 text-primary hover:bg-primary/20 flex w-full cursor-pointer items-center justify-between rounded-3xl border px-4 py-1 transition-all duration-200"
				onclick={toggleDropdown}
			>
				<div class="flex items-center gap-2">
					<!-- Icon for selected category -->
					{#if activeFilter === 'bids_received'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-5 w-5"
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
					{:else if activeFilter === 'tasks_in_progress'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M13 10V3L4 14h7v7l9-11h-7z"
							/>
						</svg>
					{:else if activeFilter === 'tasks_completed'}
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="text-primary h-5 w-5"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
							/>
						</svg>
					{/if}
					<span class="font-medium">
						{filterOptions.find((opt) => opt.id === activeFilter)?.label}
					</span>
				</div>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="text-primary h-5 w-5 transition-transform duration-200 {isDropdownOpen
						? 'rotate-180'
						: ''}"
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
			</button>

			<!-- Dropdown menu -->
			{#if isDropdownOpen}
				<div
					class="border-base-300 bg-base-300 absolute top-full right-0 left-0 z-50 mt-2 rounded-xl border shadow-lg"
				>
					{#each filterOptions as option}
						<button
							class="hover:bg-base-200 flex w-full cursor-pointer items-center gap-2 px-4 py-2 text-left transition-colors duration-200 first:rounded-t-xl last:rounded-b-xl {activeFilter ===
							option.id
								? 'bg-primary/10 text-primary'
								: 'text-base-content'}"
							onclick={() => selectFilter(option.id)}
						>
							<!-- Icon for each category -->
							{#if option.id === 'bids_received'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 {activeFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
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
							{:else if option.id === 'tasks_in_progress'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 {activeFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M13 10V3L4 14h7v7l9-11h-7z"
									/>
								</svg>
							{:else if option.id === 'tasks_completed'}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="h-5 w-5 {activeFilter === option.id
										? 'text-primary'
										: 'text-base-content/60'}"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
									/>
								</svg>
							{/if}
							<span class="font-medium">{option.label}</span>
							{#if activeFilter === option.id}
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-primary ml-auto h-5 w-5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Loading State -->
{#if $myTasksStore.loading}
	<div class="space-y-2">
		{#each Array(1) as _}
			<div class="bg-base-100 animate-pulse rounded-xl shadow-md">
				<div class="card-body">
					<!-- Title and Description Section -->
					<div class="flex flex-col justify-between gap-2">
						<!-- Title skeleton -->
						<div class="bg-base-300 h-7 w-3/4 rounded"></div>
						<!-- Description skeleton -->
						<div class="bg-base-300 my-2 h-4 w-full rounded"></div>
						<div class="bg-base-300 mb-4 h-4 w-2/3 rounded"></div>
					</div>

					<!-- Deadline and Budget Section -->
					<div class="flex w-full items-center justify-between">
						<!-- Left: Schedule skeleton -->
						<div class="flex items-center gap-2">
							<div class="bg-base-300 h-4 w-4 rounded"></div>
							<div class="flex flex-col">
								<div class="bg-base-300 mb-1 h-3 w-16 rounded"></div>
								<div class="bg-base-300 h-4 w-24 rounded"></div>
							</div>
						</div>

						<!-- Right: Budget skeleton -->
						<div class="text-right">
							<div class="bg-base-300 h-6 w-20 rounded"></div>
							<div class="bg-base-300 mt-1 h-4 w-16 rounded"></div>
						</div>
					</div>

					<!-- Location Section -->
					<div class="flex w-full items-start gap-2">
						<div class="bg-base-300 mt-1 h-4 w-4 rounded"></div>
						<div class="flex min-w-0 flex-1 flex-col">
							<div class="bg-base-300 mb-1 h-3 w-24 rounded"></div>
							<div class="bg-base-300 h-4 w-3/4 rounded"></div>
						</div>
					</div>

					<!-- Bottom Section: Avatar, Username, Rating, and Buttons -->
					<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
						<!-- Left: Avatar, Username, and Review Stars skeleton -->
						<div class="flex items-center gap-3">
							<!-- Avatar skeleton -->
							<div class="bg-base-300 h-8 w-8 rounded-full"></div>

							<!-- Username and Review Stars skeleton -->
							<div class="flex flex-col">
								<div class="bg-base-300 mb-1 h-4 w-16 rounded"></div>
								<!-- Review Stars skeleton -->
								<div class="flex items-center">
									{#each Array(5) as _}
										<div class="bg-base-300 mr-1 h-3 w-3 rounded"></div>
									{/each}
									<div class="bg-base-300 ml-1 h-3 w-8 rounded"></div>
								</div>
							</div>
						</div>

						<!-- Right: Action Buttons skeleton -->
						<div class="flex w-full items-center gap-2 md:w-auto">
							<div class="bg-base-300 h-9 w-28 rounded"></div>
							<div class="bg-base-300 h-9 w-24 rounded"></div>
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
{/if}

<!-- Task List -->
{#if !$myTasksStore.loading && filteredTasks.length > 0}
	<div class="grid grid-cols-1 gap-5">
		{#each filteredTasks as task}
			{#if task}
				<div class="bg-base-100 rounded-xl shadow-md transition-shadow hover:shadow-lg">
					<div class="card-body">
						<div class="flex flex-col justify-between gap-2">
							<small class="card-title line-clamp-1 text-lg">
								<button
									class="hover:text-primary cursor-pointer transition-colors text-left"
									onclick={(e) => {
										e.stopPropagation();
										goto(`/dashboard/task/${task.id}`);
									}}
								>
									{task.title}
								</button>
							</small>
							<div class="text-base-content/60 line-clamp-2">
								{task.description}
							</div>
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
									{#if task.deadline}
										<small class="text-base-content/60 text-xs">
											{$t('task.deadline.label')}
										</small>
										<span class="text-sm font-medium">
											{formatDateTimeReactive(new Date(task.deadline))}
										</span>
									{:else if task.dateRange}
										<small class="text-base-content/60 text-xs">
											{$t('task.dateRange.label')}
										</small>
										<span class="text-sm font-medium">
											{formatDateRangeReactive(new Date(task.dateRange.start), new Date(task.dateRange.end))}
										</span>
									{/if}
								</div>
							</div>

							<!-- Right: Sats -->
							<div class="">
								<div class="text-lg font-bold">
									${formatNumberWithTwoDecimals(task.budget.amount)}

									<div class="text-base-content/60 text-sm">
										{satsFromUsd(task.budget.amount, btcPrice)}
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
							<div class="flex min-w-0 flex-1 flex-col">
								<small class="text-base-content/60 text-xs">{$t('task.location.details')}</small>
								<span class="line-clamp-2 text-sm font-medium">
									{#if task.dropOffLocation?.displayName}
										{task.dropOffLocation.displayName}
									{:else if task.pickupLocation?.displayName}
										{task.pickupLocation.displayName}
									{:else}
										{$t('task.type.remote')}
									{/if}
								</span>
							</div>
						</div>

						<div class="mt-1 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
							<!-- Left: Empty space on larger screens, full width on mobile -->
							<div class="hidden md:block"></div>

							<!-- Right: Action Buttons -->
							<div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center md:w-auto">
								{#each getActionButtons(task, activeFilter) as action}
									<button
										class="btn {action.class} w-full sm:w-auto"
										onclick={(e) => {
											e.stopPropagation();
											action.onclick(e);
										}}
									>
										{#if action.icon === 'view_details'}
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
													d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										{:else if action.icon === 'view_bids'}
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
										{:else if action.icon === 'delete'}
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
													d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
												/>
											</svg>
										{:else if action.icon === 'mark_as_done'}
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
													d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
												/>
											</svg>
										{:else if action.icon === 'rescope'}
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
													d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
												/>
											</svg>
										{:else if action.icon === 'dispute'}
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
													d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
												/>
											</svg>
										{/if}
										{action.label}
									</button>
								{/each}
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
			class="text-primary mx-auto mb-3 h-12 w-12"
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
		<span class="text-xl font-semibold">{$t('task.empty.no_tasks')}</span>
		<p class="mb-4 text-gray-500">{$t('task.empty.no_tasks_description')}</p>
	</div>
{/if}

{#if $myTasksStore.error}
	<div class="py-12 text-center">
		<h4 class="mt-4 text-lg font-semibold">{$t('task.error.loading')}</h4>
	</div>
{/if}
