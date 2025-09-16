<script lang="ts">
	import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { formatDistanceToNow } from 'date-fns';
	import { tasksStore } from '$lib/stores/task.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	//import DashboardSavedSearchesPanel from '$lib/components/task/DashboardSavedSearchesPanel.svelte';
	import { goto } from '$app/navigation';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/stores/wallet.store';

	// Function to create initial search parameters
	function getInitialSearchParams(): SearchTasksParams {
		return {
			taskType: undefined,
			categories: [],
			skills: [],
			page: 1,
			limit: 10,
			budget: {
				tier: undefined,
				currency: undefined,
				type: undefined
			},
			search: ''
		};
	}

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());
	let searchQuery = $state('');
	let selectedTaskType = $state({ label: '', value: '' });

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);
	let dataLoaded = $state(false);
	let showSkeleton = $state(true);
	let selectedLocation = $state<any | null>(null);

	// Lazy loading state
	let taskListRef = $state<HTMLElement | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	// Infinite scroll state
	let infiniteScrollObserver: IntersectionObserver | null = null;
	let scrollTarget = $state<HTMLElement | null>(null);

	// Has active search parameters for save search button
	let hasActiveParams = $state(false);
	$effect(() => {
		// Check if there are any meaningful search parameters set
		hasActiveParams =
			!!searchParams.search ||
			!!searchParams.taskType ||
			!!searchParams.location ||
			(searchParams.status && searchParams.status.length > 0) ||
			(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			!!searchParams.budget?.tier ||
			!!searchParams.budget?.currency ||
			!!searchParams.budget?.type;
	});

	// BTC price for USDT conversion
	let btcPrice = $state<number>(120000); // Default fallback price

	// View mode state - Airbnb style toggle
	let viewMode = $state<'list' | 'map'>('list');

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
	 * Load Nostr data with proper state management
	 */
	async function loadNostrData(): Promise<void> {
		if (dataLoaded) return; // Prevent multiple loads

		try {
			await findTasks(searchParams);
			dataLoaded = true;
			showSkeleton = false;

			// Cleanup observers and timers
			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
		} catch (error) {
			console.error('[FindTasks] Error loading Nostr data:', error);
			// Keep skeleton visible on error
		}
	}

	/**
	 * Setup lazy loading with intersection observer and fallback
	 */
	function setupLazyLoading(): void {
		if (!browser || dataLoaded) return;

		// Setup intersection observer
		intersectionObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !dataLoaded) {
					loadNostrData();
				}
			},
			{
				threshold: 0.1,
				rootMargin: '200px' // Start loading 200px before visible
			}
		);

		// Observe the task list area
		if (taskListRef) {
			intersectionObserver.observe(taskListRef);
		}

		// Fallback: Load after 3 seconds if user doesn't scroll
		fallbackTimer = setTimeout(() => {
			if (!dataLoaded) {
				loadNostrData();
			}
		}, 3000);
	}

	// Debounce function
	function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: Parameters<T>) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	// Debounced function to update searchParams
	const debouncedSearch = debounce(async () => {
		// Solo buscar si hay al menos 3 caracteres
		if (searchQuery.trim().length < 3) {
			// Si la búsqueda es muy corta, limpiar resultados y mostrar todos
			tasksStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null
			}));

			// Buscar sin término de búsqueda
			const newParams: SearchTasksParams = {
				...searchParams,
				page: 1,
				search: undefined
			};
			searchParams = { ...searchParams, ...newParams };

			try {
				await findTasks(searchParams);
			} catch (err) {
				console.error('[FindTasks] Search fetch error:', err);
			}
			return;
		}

		const newParams: SearchTasksParams = {
			...searchParams,
			page: 1,
			search: searchQuery.trim()
		};

		searchParams = { ...searchParams, ...newParams };

		// Clear existing tasks when starting a new search
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		try {
			await findTasks(searchParams);
		} catch (err) {
			console.error('[FindTasks] Search fetch error:', err);
		}
	}, 1000);

	// Handle advanced filter drawer apply
	function handleFilterApply(filters: SearchTasksParams) {
		isFilterDrawerOpen = false;

		// Clear existing tasks when applying new filters
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		searchParams = {
			...searchParams,
			...filters,
			page: 1
		};

		// Update UI controls based on applied filters
		searchQuery = filters.search || '';
		selectedTaskType = filters.taskType
			? {
					label: filters.taskType === TaskTypeEnum.REMOTE ? 'Remote' : 'In Person',
					value: filters.taskType
				}
			: { label: '', value: '' };

		findTasks(searchParams);
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		selectedTaskType = { label: '', value: '' };

		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };

		// Clear existing tasks when clearing filters
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		findTasks(searchParams);
	}

	// Format date
	function formatTimeAgo(date: string): string {
		try {
			const parsedDate = new Date(date);
			if (isNaN(parsedDate.getTime())) {
				return $t('dashboard.find_tasks.invalid_date') || 'Invalid date';
			}
			return formatDistanceToNow(parsedDate, { addSuffix: true });
		} catch (error) {
			console.error('[FindTasks] Error formatting date:', error);
			return $t('dashboard.find_tasks.invalid_date') || 'Invalid date';
		}
	}

	// Load more tasks (for infinite scroll)
	async function loadMoreTasks() {
		if ($tasksStore.hasMore && !$tasksStore.loading) {
			const nextPage = $tasksStore.currentPage + 1;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];

			// Subtract 1 second from the last item's timestamp to exclude it from the next batch
			const untilTimestamp = lastItem.createdAt - 1;

			searchParams = {
				...searchParams,
				page: nextPage,
				until: untilTimestamp
			};
			await findTasks(searchParams);
		}
	}

	// Setup intersection observer for infinite scroll
	function setupInfiniteScroll() {
		if (!browser) return;

		if ('IntersectionObserver' in window) {
			infiniteScrollObserver = new IntersectionObserver(
				(entries) => {
					if (entries[0].isIntersecting && $tasksStore.hasMore && !$tasksStore.loading) {
						loadMoreTasks();
					}
				},
				{ rootMargin: '200px' }
			);

			if (scrollTarget) {
				infiniteScrollObserver.observe(scrollTarget);
			}
		}
	}

	// Cleanup observer
	function cleanupInfiniteScroll() {
		tasksStore.update((state) => {
			return {
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null
			};
		});
		if (infiniteScrollObserver && scrollTarget) {
			infiniteScrollObserver.unobserve(scrollTarget);
		}
		if (infiniteScrollObserver) {
			infiniteScrollObserver.disconnect();
			infiniteScrollObserver = null;
		}
	}

	// Eliminar la variable cardRef que estaba causando conflictos
	// let cardRef = $state<HTMLElement | null>(null);

	// Task type filter handler
	function toggleTaskType(type: TaskTypeEnum | undefined) {
		// Clear existing tasks when changing task type
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null
		}));

		if (!type) {
			searchParams = { ...searchParams, taskType: undefined, page: 1 };
		} else {
			searchParams = {
				...searchParams,
				taskType: type,
				page: 1
			};
		}

		findTasks(searchParams);
	}

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			// Fetch BTC price for USDT conversion (non-critical)
			fetchBtcPrice();

			// Setup lazy loading for Nostr data
			setupLazyLoading();

			// Setup infinite scroll - waiting for DOM to be ready
			setTimeout(() => {
				setupInfiniteScroll();
			}, 1000);
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			// Cleanup lazy loading
			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}

			// Cleanup infinite scroll
			cleanupInfiniteScroll();
			cleanup();
		}
	});

	// Loading state management effect
	$effect(() => {
		// Update initial load flag when data is loaded
		if (isInitialLoad && dataLoaded) {
			isInitialLoad = false;
		}

		// Handle loading timeout for Nostr data
		let timer: ReturnType<typeof setTimeout> | undefined;
		if ($tasksStore.loading && searchParams.page === 1 && !dataLoaded) {
			timer = setTimeout(() => {
				if ($tasksStore.loading && searchParams.page === 1 && !dataLoaded) {
					loadingTimeout = true;
					console.error('[FindTasks] Query timeout - fetching took too long');
				}
			}, 10000); // 10 second timeout
		} else {
			loadingTimeout = false;
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	const onSelectTask = (task: Task) => {
		if (task.status === TaskStatusEnum.OPEN) {
			// Redirect to signup page for public users
			goto('/auth/signup');
		}
	};

	// Función para obtener el placeholder dinámico
	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return $t('find_tasks.search_minimum_chars');
		}
		return $t('find_tasks.search_placeholder');
	}

	// Función para obtener la clase del input de búsqueda
	function getSearchInputClass(): string {
		let baseClass = 'input input-bordered w-full pl-10';

		if (searchQuery.length > 0 && searchQuery.length < 3) {
			baseClass += ' input-warning';
		} else if (searchQuery.length >= 3) {
			baseClass += ' input-success';
		}

		return baseClass;
	}

	// Selected task for map display
	let selectedTask = $state<Task | null>(null);

	// Function to handle task selection for map display
	function selectTaskForMap(task: Task) {
		selectedTask = task;
		if (task.dropOffLocation) {
			selectedLocation = task.dropOffLocation;
		}
		if (task.pickupLocation) {
			selectedLocation = task.pickupLocation;
		}
	}

	// Referencias a las cards de las tasks para hacer scroll
	let taskCardRefs = $state<Map<string, HTMLElement>>(new Map());

	// Función para hacer scroll a una card específica
	function scrollToTaskCard(taskId: string) {
		// Buscar la card por data attribute
		const cardElement = document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;
		if (cardElement) {
			cardElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		}
	}

	// Action para registrar las referencias de las cards
	function registerTaskCard(node: HTMLElement, { taskId }: { taskId: string }) {
		// Cuando el elemento se monta
		if (node) {
			taskCardRefs.set(taskId, node);
		}

		return {
			destroy() {
				// Cuando el elemento se desmonta
				taskCardRefs.delete(taskId);
			}
		};
	}

	// Toggle view mode function
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	// Variable para detectar el tema
	let isDarkMode = $state(false);

	// Detectar el tema actual
	$effect(() => {
		if (browser) {
			isDarkMode = document.documentElement.classList.contains('dark');
		}
	});
</script>

<div class="mx-auto max-w-7xl p-4 md:p-0">
	<!-- Dashboard Tabs -->
	<!-- <Tabs tabs={availableTabs} {activeTab} onTabChange={handleTabChange} /> -->

	<div id="panel-find-tasks" role="tabpanel" aria-labelledby="tab-find-tasks" class="">
		<!-- Search and Filter Controls - Full Width at Top -->
		<div class="mb-4">
			<!-- Search and Filter Controls in Same Row -->
			<div class="flex flex-wrap items-center gap-3">
				<!-- Search Input -->
				<div class="relative mt-2 min-w-[200px] flex-1">
					<input
						type="text"
						class={getSearchInputClass()}
						placeholder={getSearchPlaceholder()}
						bind:value={searchQuery}
						oninput={debouncedSearch}
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

				<!-- Filter Buttons -->
				<div class="flex items-center gap-2">
					<!-- Advanced Filters Button -->
					<button class="btn btn-sm btn-primary" onclick={() => (isFilterDrawerOpen = true)}>
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
								d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
							/>
						</svg>
						{$t('find_tasks.filters')}
					</button>

				</div>
			</div>
		</div>

		<!-- Main Content - Dynamic Layout based on view mode -->
		{#if viewMode === 'list'}
			<!-- List View - Responsive Layout -->
			<div class="relative w-full">
				<!-- Error Message -->
				{#if $tasksStore.error}
					<div class="alert alert-error alert-outline mb-3">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							class="h-5 w-5 shrink-0 stroke-current"
							fill="none"
							viewBox="0 0 24 24"
							><path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
							/></svg
						>
						<span>{$t('find_tasks.error_loading').replace('{error}', $tasksStore.error)}</span>
					</div>
				{/if}

				<!-- Mobile: Full width list, Desktop: Split with map -->
				<div class="lg:flex lg:gap-6">
					<!-- Tasks List -->
					<div class="lg:w-1/2">
						<div class="max-h-[calc(65vh)] overflow-y-auto" bind:this={taskListRef}>
							<!-- Skeleton Loading -->
							{#if showSkeleton && !dataLoaded}
								<div class="space-y-3">
									{#each Array(4) as _}
										<div class="card bg-base-100 animate-pulse rounded-xl p-4 shadow-md">
											<div class="flex flex-col gap-3 md:flex-row md:items-center">
												<div class="bg-base-300 h-6 w-3/4 rounded"></div>
												<div class="bg-base-300 h-5 w-28 rounded"></div>
											</div>
											<div class="my-3 grid grid-cols-1 gap-3 md:grid-cols-3">
												<div class="bg-base-300 h-5 w-24 rounded"></div>
												<div class="bg-base-300 h-5 w-32 rounded"></div>
												<div class="bg-base-300 h-5 w-28 rounded"></div>
											</div>
											<div class="flex gap-2">
												<div class="bg-base-300 h-5 w-16 rounded"></div>
												<div class="bg-base-300 h-5 w-20 rounded"></div>
												<div class="bg-base-300 h-5 w-12 rounded"></div>
											</div>
											<div class="mt-3 flex items-center justify-between">
												<div class="bg-base-300 h-5 w-12 rounded"></div>
												<div class="bg-base-300 h-8 w-20 rounded"></div>
											</div>
										</div>
									{/each}
								</div>
							{:else if loadingTimeout}
								<!-- Loading Timeout Warning -->
								<div class="alert alert-warning alert-outline mb-3 rounded-xl">
									<svg
										xmlns="http://www.w3.org/2000/svg"
										class="h-5 w-5 shrink-0 stroke-current"
										fill="none"
										viewBox="0 0 24 24"
									>
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
										/>
									</svg>
									<div>
										<h3 class="font-bold">{$t('find_tasks.loading_timeout_title')}</h3>
										<div class="text-xs">{$t('find_tasks.loading_timeout_message')}</div>
									</div>
									<button class="btn btn-sm" onclick={() => window.location.reload()}>
										{$t('find_tasks.refresh')}
									</button>
								</div>
							{:else if $tasksStore.items && $tasksStore.items.length > 0}
								<div class="space-y-4">
									{#each $tasksStore.items as task, index}
										<div
											use:registerTaskCard={{ taskId: task.id }}
											class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg"
											onclick={() => selectTaskForMap(task)}
											tabindex="0"
											role="button"
											class:bg-base-300={selectedTask?.id === task.id}
											aria-label={$t('find_tasks.view_task')}
											aria-pressed={selectedTask?.id === task.id}
											aria-current={selectedTask?.id === task.id}
											aria-disabled={task.status !== TaskStatusEnum.OPEN}
											aria-hidden={task.status !== TaskStatusEnum.OPEN}
											data-task-id={task.id}
										>
											<div class="card-body p-4 md:p-4">
												<!-- Top Row: Title + Price -->
												<div
													class="mb-1 flex flex-col gap-3 md:flex-row md:items-start md:justify-between"
												>
													<!-- Left: Title and Sats -->
													<small class="card-title line-clamp-2 text-lg">
														{task.title}
													</small>
												</div>

												<!-- Schedule and Sats Row -->
												<div class="mb-3 flex flex-col gap-4 md:flex-row md:flex-wrap">
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
															<div class="flex flex-col px-2">
																{#if task.deadline}
																	<small class="text-base-content/60 text-xs"
																		>{$t('dashboard.task_details_by_task.deadline')}</small
																	>
																	<span class="text-sm font-medium">
																		{new Date(task.deadline).toLocaleDateString('en-US', {
																			day: '2-digit',
																			month: '2-digit',
																			year: 'numeric'
																		})}, 12pm
																	</span>
																{:else if task.dateRange}
																	<small class="text-base-content/60 text-xs"
																		>{$t('dashboard.task_details_by_task.date_range')}</small
																	>
																	<span class="text-sm font-medium">
																		{new Date(task.dateRange.start).toLocaleDateString('en-US', {
																			day: '2-digit',
																			month: '2-digit',
																			year: 'numeric'
																		})} - {new Date(task.dateRange.end).toLocaleDateString(
																			'en-US',
																			{
																				day: '2-digit',
																				month: '2-digit',
																				year: 'numeric'
																			}
																		)}
																	</span>
																{/if}
															</div>
														</div>

														<!-- Right: Sats -->
														<div class="text-lg font-bold">
															${formatNumberWithTwoDecimals(task.budget.amount)}

															<div class="text-base-content/60 text-sm">
																{satsFromUsd(task.budget.amount, btcPrice)}
															</div>
														</div>
													</div>

													<!-- Location -->
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
															<small class="text-base-content/60 text-xs">
																{$t('dashboard.task_details_by_task.location_details')}
															</small>
															<span class="line-clamp-2 text-sm font-medium">
																{#if task.dropOffLocation?.displayName}
																	{task.dropOffLocation.displayName}
																{:else if task.pickupLocation?.displayName}
																	{task.pickupLocation.displayName}
																{:else}
																	{$t('dashboard.task_details_by_task.remote')}
																{/if}
															</span>
														</div>
													</div>
												</div>

												<!-- Bottom Row: Avatar + Action Buttons -->
												<div
													class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
												>
													<!-- Left: Avatar, Username, and Review Stars -->
													<div class="flex min-w-0 flex-1 items-center gap-3">
														<!-- Avatar -->
														<div class="avatar">
															<div
																class="bg-base-300 flex h-8 w-8 items-center justify-center rounded-full"
															>
																{#if task.creator?.avatar}
																	<img
																		src={task.creator.avatar}
																		alt={$t('dashboard.find_tasks.avatar_alt') || 'Avatar'}
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
														<div class="flex min-w-0 flex-1 flex-col">
															<span class="truncate text-sm font-medium">
																{task.creator?.username ||
																	$t('dashboard.task_details_by_task.anonymous')}
															</span>
															<!-- Review Stars -->
															<div class="flex items-center">
																{#each Array(5) as _, i}
																	<svg
																		xmlns="http://www.w3.org/2000/svg"
																		class="h-3 w-3 {i < 4
																			? 'text-yellow-400'
																			: 'text-base-content/30'}"
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
													<div class="flex w-full flex-shrink-0 items-center gap-2 md:w-auto">
														<button
															class="btn btn-primary btn-sm flex-1 md:flex-none"
															class:btn-disabled={task.status !== TaskStatusEnum.OPEN}
															onclick={(e) => {
																e.stopPropagation();
																onSelectTask(task);
															}}
															aria-label={$t('dashboard.find_tasks.sign_up_to_bid_aria') || 'Sign up to bid on this task'}
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
															{task.status === TaskStatusEnum.OPEN
																? ($t('dashboard.find_tasks.sign_up_to_bid') || 'Sign up to bid')
																: ($t('dashboard.find_tasks.bidding_closed') || 'Bidding closed')}
														</button>

														<button
															class="btn btn-secondary btn-sm flex-1 md:flex-none"
															onclick={(e) => {
																e.stopPropagation();
																goto(`/tasks/task/${task.id}`);
															}}
															aria-label={$t('find_tasks.view_task')}
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
															{$t('find_tasks.view_task')}
														</button>
													</div>
												</div>
											</div>
										</div>
									{/each}
								</div>

								<!-- Infinite Scroll Target -->
								<!-- svelte-ignore element_invalid_self_closing_tag -->
								<div bind:this={scrollTarget} class="h-4" />
							{:else if !$tasksStore.loading}
								<!-- No Results -->
								<div class="py-8 text-center">
									<div class="text-base-content/60 mb-3">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="mx-auto h-12 w-12"
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
									<h3 class="mb-2 text-lg font-semibold">{$t('find_tasks.no_results_title')}</h3>
									<p class="text-base-content/70 mb-3">{$t('find_tasks.no_results_message')}</p>
									<button class="btn btn-primary" onclick={clearFilters}>
										{$t('find_tasks.clear_filters')}
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- Desktop Map Sidebar (hidden on mobile) -->
					<div class="hidden lg:block lg:w-1/2">
						<TaskLocationMap
							tasks={$tasksStore.items}
							height="65vh"
							{selectedTask}
							onTaskSelected={(event) => {
								selectedTask = event.task;
								scrollToTaskCard(event.task.id);
							}}
						/>
					</div>
				</div>

				<!-- Mobile Floating Button - Show Map (only visible on mobile) -->
				<button
					class="inverted-colors fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl lg:hidden"
					onclick={toggleViewMode}
					title={$t('find_tasks.view_map')}
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
							d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
						/>
					</svg>
					{$t('find_tasks.view_map')}
				</button>
			</div>
		{:else}
			<!-- Map View - Full Width (Mobile only) -->
			<div class="relative w-full lg:hidden">
				<TaskLocationMap
					tasks={$tasksStore.items}
					height="65vh"
					{selectedTask}
					onTaskSelected={(event) => {
						selectedTask = event.task;
						// When a task is selected on the map, switch to list view to show the task
						viewMode = 'list';
						scrollToTaskCard(event.task.id);
					}}
				/>

				<!-- Mobile Floating Button - Show List -->
				<button
					class="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl"
					class:bg-black={!isDarkMode}
					class:bg-white={isDarkMode}
					class:text-white={!isDarkMode}
					class:text-black={isDarkMode}
					onclick={toggleViewMode}
					aria-label={$t('find_tasks.view_list')}
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
							d="M4 6h16M4 10h16M4 14h16M4 18h16"
						/>
					</svg>
					<span class="text-xs">{$t('find_tasks.view_list')}</span>
				</button>
			</div>
		{/if}
	</div>
</div>

<!-- Advanced Filter Drawer Component -->
<FilterDrawer
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
/>


<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}
</style>
