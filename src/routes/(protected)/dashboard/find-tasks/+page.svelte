<script lang="ts">
	import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { tasksStore } from '$lib/stores/task.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { TaskStatusEnum, TaskTypeEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import FilterDrawer from '$lib/components/filters/FilterDrawer.svelte';
	import SaveSearchForm from '$lib/components/task/SaveSearchForm.svelte';
	import TaskDetailsBidDrawer from '$lib/components/bidding/TaskDetailsBidDrawer.svelte';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import TaskLocationMap from '$lib/components/maps/TaskLocationMap.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import {
		formatStandardDateShort,
		formatStandardDateTime,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { darkMode } from '$lib/stores/theme.store';

	// Constants
	const TASKS_PER_PAGE = 15;

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());
	let searchQuery = $state('');
	let selectedTaskType = $state({ label: '', value: '' });

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Save search state
	let isSaveSearchOpen = $state(false);

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);
	let dataLoaded = $state(false);
	let lastSearchKey = $state<string>(''); // Track search parameters to detect changes
	let showSkeleton = $state(true);
	let selectedLocation = $state<any | null>(null);

	// Lazy loading state
	let taskListRef = $state<HTMLElement | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	// Infinite scroll state - using scroll listener instead of sentinel
	let scrollHandler: ((e: Event) => void) | null = null;
	let isLoadingMore = $state(false); // Flag to prevent multiple simultaneous loads

	// Scroll to top button state
	let showScrollToTop = $state(false);

	// Bid drawer state
	let selectedTaskId = $state<string | null>(null);
	let isSidebarOpen = $state(false);

	// Has active search parameters for save search button
	let hasActiveParams = $state(false);

	// BTC price for USDT conversion
	let btcPrice = $state<number>(120000); // Default fallback price

	// View mode state - Airbnb style toggle
	let viewMode = $state<'list' | 'map'>('list');

	// Selected task for map display
	let selectedTask = $state<Task | null>(null);

	// Referencias a las cards de las tasks para hacer scroll
	let taskCardRefs = $state<Map<string, HTMLElement>>(new Map());

	// Function to create initial search parameters
	function getInitialSearchParams(): SearchTasksParams {
		return {
			taskType: undefined,
			categories: [],
			skills: [],
			page: 1,
			limit: TASKS_PER_PAGE,
			budget: {
				tier: undefined,
				currency: undefined,
				type: undefined
			},
			search: ''
		};
	}

	function hasTimeComponent(dateString?: string | null): boolean {
		if (!dateString) return false;
		return /T\d{2}:\d{2}/.test(dateString);
	}

	function formatDateWithLocale(dateValue: Date | null, includeTime: boolean): string {
		if (!dateValue) return '';

		if (includeTime) {
			return formatStandardDateTime(dateValue, $locale || 'en');
		}

		return formatStandardDateShort(dateValue, $locale || 'en');
	}

	function formatDateTimeReactive(dateString: string) {
		if (!dateString) return '';

		if (hasTimeComponent(dateString)) {
			const dateWithTime = new Date(dateString);
			if (!Number.isNaN(dateWithTime.getTime())) {
				return formatDateWithLocale(dateWithTime, true);
			}
		}

		const date = parseDateToLocalMidnight(dateString);
		return formatDateWithLocale(date, false);
	}

	function formatDateRangeReactive(startDateString: string, endDateString: string) {
		const formatValue = (value: string) => {
			// Always include time for dateRange in Find Tasks
			if (hasTimeComponent(value)) {
				const dateWithTime = new Date(value);
				if (!Number.isNaN(dateWithTime.getTime())) {
					return formatDateWithLocale(dateWithTime, true);
				}
			}

			// If no time component, parse and add time formatting
			const date = parseDateToLocalMidnight(value);
			return formatDateWithLocale(date, true);
		};

		const startFormatted = formatValue(startDateString);
		const endFormatted = formatValue(endDateString);

		if (startFormatted && endFormatted) {
			return `${startFormatted} - ${endFormatted}`;
		}

		return startFormatted || endFormatted || '';
	}

	// Handle scroll to show/hide scroll to top button
	function handleScroll() {
		if (taskListRef) {
			// Show button when scrolled more than 300px
			showScrollToTop = taskListRef.scrollTop > 300;
		}
	}

	// Scroll to top function
	function scrollToTop() {
		if (taskListRef) {
			taskListRef.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		}
	}

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
		// Create a key from search params to detect if search changed
		const currentSearchKey = JSON.stringify(searchParams);
		const searchChanged = lastSearchKey !== '' && lastSearchKey !== currentSearchKey;

		// Check if we already have tasks in store (from previous navigation)
		const hasExistingTasks = $tasksStore.items.length > 0;

		// If we have existing tasks and search hasn't changed, don't reload - just use what's in the store
		if (hasExistingTasks && !searchChanged) {
			// Verify the search key matches (or is empty, meaning first load)
			if (lastSearchKey === '' || lastSearchKey === currentSearchKey) {
				dataLoaded = true;
				showSkeleton = false;
				lastSearchKey = currentSearchKey; // Update key
				return;
			}
		}

		// If search params changed, reset dataLoaded to allow reload
		if (searchChanged) {
			dataLoaded = false;
		}

		if (dataLoaded && !searchChanged) return; // Prevent multiple loads

		try {
			// Only load if we don't have tasks or search changed
			const newSearchParams: SearchTasksParams = {
				...searchParams,
				page: 1,
				limit: TASKS_PER_PAGE
			};

			// Only include until if it has a value
			if (searchParams.until !== undefined) {
				newSearchParams.until = searchParams.until;
			}

			searchParams = newSearchParams;

			// Clear existing tasks before loading (only if search changed)
			if (searchChanged || !hasExistingTasks) {
				tasksStore.update((state) => ({
					...state,
					items: [],
					currentPage: 1,
					hasMore: true,
					error: null
				}));
			}

			await findTasks(searchParams);

			dataLoaded = true;
			showSkeleton = false;
			lastSearchKey = currentSearchKey; // Update key after successful load

			// Setup infinite scroll after data is loaded
			if (taskListRef) {
				setupInfiniteScroll();
			}

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

	// Load more tasks
	async function loadMoreTasks() {
		// Prevent multiple simultaneous loads
		if (!$tasksStore.hasMore || $tasksStore.loading || isLoadingMore) {
			return;
		}

		try {
			isLoadingMore = true;

			const nextPage = $tasksStore.currentPage + 1;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];

			if (!lastItem) {
				console.warn('[FindTasks] No last item found, cannot load more');
				isLoadingMore = false;
				return;
			}

			// Subtract 1 second from the last item's timestamp to exclude it from the next batch
			const untilTimestamp = lastItem.createdAt - 1;

			searchParams = {
				...searchParams,
				page: nextPage,
				until: untilTimestamp,
				limit: TASKS_PER_PAGE
			};

			await findTasks(searchParams);
		} catch (error) {
			console.error('[FindTasks] Error loading more tasks:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	/**
	 * Setup infinite scroll using scroll listener
	 * Loads more tasks automatically when user scrolls near the end (70% of scroll)
	 */
	function setupInfiniteScroll(): void {
		if (!browser || !taskListRef) return;

		// Cleanup existing handler
		if (scrollHandler) {
			taskListRef.removeEventListener('scroll', scrollHandler);
			scrollHandler = null;
		}

		// Track last scroll position to prevent duplicate loads
		let lastScrollTop = 0;
		let lastLoadScrollTop = 0;

		// Create scroll handler with debouncing
		let scrollTimeout: ReturnType<typeof setTimeout> | null = null;
		scrollHandler = () => {
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}

			scrollTimeout = setTimeout(() => {
				if (!taskListRef || !$tasksStore.hasMore || $tasksStore.loading || isLoadingMore) {
					return;
				}

				const { scrollTop, scrollHeight, clientHeight } = taskListRef;

				// Only process if user actually scrolled down (not up)
				if (scrollTop <= lastScrollTop) {
					lastScrollTop = scrollTop;
					return;
				}

				lastScrollTop = scrollTop;

				// Check if we have enough content to scroll
				if (scrollHeight <= clientHeight) {
					// Not enough content, but don't auto-load - wait for user to scroll
					return;
				}

				const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
				const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

				// Load more when:
				// 1. User has scrolled 70% of the content
				// 2. User scrolled at least 200px since last load (to prevent duplicate loads)
				// 3. User is within 500px of the bottom (ensures they're actually near the end)
				if (
					scrollPercentage > 0.7 &&
					scrollTop - lastLoadScrollTop > 200 &&
					distanceFromBottom < 500
				) {
					lastLoadScrollTop = scrollTop;
					loadMoreTasks();
				}
			}, 200); // Increased debounce to prevent rapid-fire loads
		};

		// Add scroll listener with passive flag for better performance
		taskListRef.addEventListener('scroll', scrollHandler, { passive: true });
	}

	// Get status badge color and text
	function getStatusBadge(status: TaskStatusEnum): { color: string; text: string } {
		switch (status) {
			case TaskStatusEnum.OPEN:
				return { color: 'badge-success', text: 'OPEN' };
			case TaskStatusEnum.BID_ACCEPTED:
				return { color: 'badge-info', text: 'BID ACCEPTED' };
			case TaskStatusEnum.ESCROW_FUNDED:
				return { color: 'badge-info', text: 'ESCROW FUNDED' };
			case TaskStatusEnum.IN_PROGRESS:
				return { color: 'badge-warning', text: 'IN PROGRESS' };
			case TaskStatusEnum.RESCOPED:
				return { color: 'badge-warning', text: 'RESCOPED' };
			case TaskStatusEnum.RESCOPE_ACCEPTED:
				return { color: 'badge-info', text: 'RESCOPE ACCEPTED' };
			case TaskStatusEnum.COMPLETED:
				return { color: 'badge-success', text: 'COMPLETED' };
			case TaskStatusEnum.CANCELLED:
				return { color: 'badge-error', text: 'CANCELLED' };
			case TaskStatusEnum.REFUNDED:
				return { color: 'badge-error', text: 'REFUNDED' };
			case TaskStatusEnum.DISPUTED:
				return { color: 'badge-error', text: 'DISPUTED' };
			case TaskStatusEnum.DISPUTE_PROPOSAL:
				return { color: 'badge-warning', text: 'DISPUTE PROPOSAL' };
			default:
				return { color: 'badge-neutral', text: status };
		}
	}

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			// Fetch BTC price for USDT conversion (non-critical)
			fetchBtcPrice();

			// Setup scroll listener when taskListRef is available
			if (taskListRef) {
				taskListRef.addEventListener('scroll', handleScroll);
			}

			// Check if we already have tasks in store from previous navigation
			// If so, skip loading and use existing tasks
			if ($tasksStore.items.length > 0) {
				dataLoaded = true;
				showSkeleton = false;
				// Set lastSearchKey to current params to prevent reload
				lastSearchKey = JSON.stringify(searchParams);
				// Setup infinite scroll if taskListRef is available
				if (taskListRef) {
					setupInfiniteScroll();
				}
			} else {
				// Setup lazy loading for Nostr data only if no tasks exist
				setupLazyLoading();
			}
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		// Cleanup scroll listener
		if (taskListRef) {
			taskListRef.removeEventListener('scroll', handleScroll);
		}

		// Cleanup lazy loading
		if (intersectionObserver) {
			intersectionObserver.disconnect();
			intersectionObserver = null;
		}
		if (fallbackTimer) {
			clearTimeout(fallbackTimer);
			fallbackTimer = null;
		}

		// Cleanup infinite scroll handler
		if (scrollHandler && taskListRef) {
			taskListRef.removeEventListener('scroll', scrollHandler);
			scrollHandler = null;
		}

		cleanup();
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
			if (task?.npub === $user?.npub) {
				appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
			} else {
				selectedTaskId = task.id.toString();
				isSidebarOpen = true;
			}
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
</script>

<div class="mx-auto max-w-6xl p-4 md:p-0">
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

					<!-- Save Search Button -->
					<button
						class="btn btn-sm btn-secondary gap-2"
						onclick={() => (isSaveSearchOpen = true)}
						disabled={!hasActiveParams}
						title={!hasActiveParams
							? $t('find_tasks.save_search_tooltip_disabled')
							: $t('find_tasks.save_search_tooltip_enabled')}
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
								d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
							/>
						</svg>
						{$t('find_tasks.save_search')}
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

				<!-- Task Count -->
				{#if $tasksStore.items && $tasksStore.items.length > 0}
					<div class="text-base-content/70 mb-4 text-sm">
						{$t('find_tasks.showing_tasks', { values: { count: $tasksStore.items.length } }) ||
							`Showing ${$tasksStore.items.length} task${$tasksStore.items.length !== 1 ? 's' : ''}`}
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
											class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg {selectedTask?.id ===
											task.id
												? 'bg-base-300 border-primary border-2'
												: ''}"
											onclick={() => selectTaskForMap(task)}
											tabindex="0"
											role="button"
											aria-label={$t('find_tasks.view_task')}
											aria-pressed={selectedTaskId === task.id.toString()}
											aria-current={selectedTaskId === task.id.toString()}
											aria-disabled={task.status !== TaskStatusEnum.OPEN}
											aria-hidden={task.status !== TaskStatusEnum.OPEN}
											data-task-id={task.id}
										>
											<div class="card-body rounded-xl p-4 md:p-4">
												<!-- Top Row: Title + Status Badge -->
												<div class="mb-1 flex flex-row items-start justify-between gap-2">
													<!-- Left: Title (70% width) -->
													<div class="w-[70%] pr-2 md:pr-4">
														<TranslatableTask
															{task}
															showDescription={true}
															showDescriptionToggle={false}
															descriptionClass="text-sm text-base-content/80 line-clamp-2"
															titleClass="card-title line-clamp-2 text-lg font-semibold"
														/>
													</div>
													<!-- Right: Status Badge (aligned right) -->
													<div class="flex w-[30%] shrink-0 justify-end">
														{#each [task] as taskItem}
															{@const statusBadge = getStatusBadge(taskItem.status)}
															<div class="badge {statusBadge.color} badge-outline badge-sm">
																{$t(`task.status.${taskItem.status.toLowerCase()}`) ||
																	statusBadge.text}
															</div>
														{/each}
													</div>
												</div>

												<!-- Schedule and Sats Row -->
												<div class="mb-3 flex flex-row items-center justify-between gap-2">
													<!-- Left: Schedule (70% width) -->
													<div class="flex w-[70%] items-center gap-2 pr-2 md:pr-4">
														<svg
															xmlns="http://www.w3.org/2000/svg"
															class="text-base-content/60 h-4 w-4 shrink-0"
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
														<div class="flex min-w-0 flex-1 flex-col px-2">
															{#if task.deadline}
																<small class="text-base-content/60 text-xs"
																	>{$t('dashboard.task_details_by_task.deadline')}</small
																>
																<span class="line-clamp-2 text-sm font-medium">
																	{formatDateTimeReactive(task.deadline)}
																</span>
															{:else if task.dateRange}
																<small class="text-base-content/60 text-xs"
																	>{$t('dashboard.task_details_by_task.date_range')}</small
																>
																<span class="line-clamp-2 text-sm font-medium">
																	{formatDateRangeReactive(
																		task.dateRange.start,
																		task.dateRange.end
																	)}
																</span>
															{/if}
														</div>
													</div>

													<!-- Right: Sats (30% width, aligned right) -->
													<div class="flex w-[30%] shrink-0 justify-end">
														<div class="text-right text-lg font-bold">
															${formatNumberWithTwoDecimals(task.budget.amount)}

															<div class="text-base-content/60 text-sm">
																{satsFromUsd(task.budget.amount, btcPrice)}
															</div>
														</div>
													</div>
												</div>

												<!-- Location -->
												<div class="flex w-full items-start gap-2">
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="text-base-content/60 mt-1 h-4 w-4 shrink-0"
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
																		class="h-3 w-3 {i < ((task.creator as any)?.rating || 0)
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
																<span class="text-base-content/60 ml-1 text-xs"
																	>{(task.creator as any)?.rating || 0}</span
																>
															</div>
														</div>
													</div>

													<!-- Right: Action Buttons -->
													<div class="flex w-full shrink-0 items-center gap-2 md:w-auto">
														<button
															class="btn btn-primary btn-sm flex-1 md:flex-none"
															class:btn-disabled={task.status === TaskStatusEnum.CANCELLED ||
																task.status === TaskStatusEnum.DISPUTED ||
																task.status === TaskStatusEnum.COMPLETED ||
																task.status === TaskStatusEnum.IN_PROGRESS}
															onclick={(e) => {
																e.stopPropagation();
																onSelectTask(task);
															}}
															aria-label={$t('find_tasks.bid_on_task')}
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
																? $t('find_tasks.bid_now')
																: $t('find_tasks.bidding_closed')}
														</button>

														<button
															class="btn btn-secondary btn-sm flex-1 md:flex-none"
															onclick={(e) => {
																e.stopPropagation();
																// Use uniqueId if available, fallback to id for backward compatibility
																const taskIdentifier = (task as any).uniqueId || task.id;
																goto(`/tasks/${taskIdentifier}`);
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

								<!-- Skeleton Loading for new tasks -->
								{#if $tasksStore.loading && $tasksStore.items.length > 0 && $tasksStore.hasMore}
									<div class="space-y-3 pt-3">
										{#each Array(3) as _}
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
								{/if}
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

				<!-- Mobile Floating Button - Scroll to Top (only visible on mobile) -->
				{#if showScrollToTop}
					<button
						class="inverted-colors fixed right-4 bottom-24 z-50 flex items-center justify-center rounded-4xl p-3 transition-all duration-200 hover:opacity-70 lg:hidden"
						onclick={scrollToTop}
						title={$t('find_tasks.scroll_to_top') || 'Scroll to top'}
						aria-label={$t('find_tasks.scroll_to_top') || 'Scroll to top'}
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
								d="M5 10l7-7m0 0l7 7m-7-7v18"
							/>
						</svg>
					</button>
				{/if}

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
					class="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 transform items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all duration-200 hover:shadow-xl {$darkMode
						? 'bg-white text-black'
						: 'bg-black text-white'}"
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
	initialFilters={searchParams}
/>

<TaskDetailsBidDrawer
	taskId={selectedTaskId}
	onClose={() => (isSidebarOpen = false)}
	isOpen={isSidebarOpen}
/>

<SaveSearchForm
	isOpen={isSaveSearchOpen}
	{searchParams}
	onClose={() => (isSaveSearchOpen = false)}
	onSaved={() => {}}
/>

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}
</style>
