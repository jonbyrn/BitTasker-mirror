<script lang="ts">
	import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import { onMount, onDestroy, tick, type Component } from 'svelte';
	import { browser } from '$app/environment';
	import { tasksStore } from '$lib/stores/task.store';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import { TASKS_PER_PAGE } from '$lib/stores/task.store';
	import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';
	import { debounce } from '$lib/utils/helpers/common';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { loadPageTranslations } from '$lib/i18n/routeTranslations';
	import { LRUCache } from '$lib/utils/helpers/lru-cache';
	import { getTaskId } from '$lib/utils/helpers/task-id';
	import type FilterDrawerComponent from '$lib/components/filters/FilterDrawer.svelte';
	import type BidFormComponent from '$lib/components/bidding/BidForm.svelte';
	import type SaveSearchFormComponent from '$lib/components/task/SaveSearchForm.svelte';
	import type TaskDrawerComponent from '$lib/components/task/TaskDrawer.svelte';
	import type TaskLocationMapComponent from '$lib/components/maps/TaskLocationMap.svelte';
	import TaskCard from '$lib/components/task/TaskCard.svelte';
	import TaskListSkeleton from '$lib/components/task/TaskListSkeleton.svelte';
	import TaskListControls from '$lib/components/task/TaskListControls.svelte';
	
	// Icon imports for unplugin-icons
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconChevronUp from '~icons/mdi/chevron-up';
	import IconMagnify from '~icons/mdi/magnify';

	// Import performance testing helper in development
	import '$lib/utils/performance-testing-helper';

	// ============================================================================
	// CONSTANTS - Organized by category
	// ============================================================================
	
	// Scroll constants
	const SCROLL_TO_TOP_THRESHOLD = 300; // px - Show scroll to top button after scrolling this distance
	const INFINITE_SCROLL_TRIGGER_DISTANCE = 300; // px - Load more tasks when within this distance from bottom
	const SCROLL_DEBOUNCE_DELAY = 200; // ms - Delay for scroll event debouncing
	
	// Search constants
	const SEARCH_DEBOUNCE_DELAY = 1000; // ms - Delay before executing search
	const SEARCH_MIN_LENGTH = 3; // Minimum characters for search
	
	// Layout constants
	const DESKTOP_MIN_WIDTH = 1024; // Desktop breakpoint in pixels
	const DATE_CACHE_MAX_SIZE = 1000; // Maximum entries in LRU cache for date formatting
	
	// Data loading constants
	const DOM_QUERY_MAX_RETRIES = 10; // Maximum retries for DOM element queries
	const BTC_PRICE_FALLBACK = 120000; // Default fallback BTC price in USD
	const LOADING_TIMEOUT_MS = 10000; // 10 seconds timeout for loading
	
	// Map preload timing constants
	const MAP_PRELOAD_TIMEOUT_MS = 2000; // Load within 2 seconds even if not idle
	const MAP_PRELOAD_FALLBACK_MS = 1000; // Fallback timeout for browsers without requestIdleCallback
	const DRAWER_CLOSE_DELAY_MS = 300; // Delay for drawer close animation

	// Lazy loaded components with proper types
	let TaskLocationMap: typeof TaskLocationMapComponent | null = $state(null);
	let FilterDrawer: typeof FilterDrawerComponent | null = $state(null);
	let BidForm: typeof BidFormComponent | null = $state(null);
	let SaveSearchForm: typeof SaveSearchFormComponent | null = $state(null);
	let TaskDrawer: typeof TaskDrawerComponent | null = $state(null);

	// Component loading states
	let drawersLoaded = $state(false);
	let mapLoaded = $state(false);

	// ============================================================================
	// INITIALIZATION FUNCTIONS
	// ============================================================================
	
	/**
	 * Create initial search parameters with defaults
	 */
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

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());
	let searchQuery = $state('');


	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);
	
	// Save search state
	let isSaveSearchOpen = $state(false);

	// Loading states - consolidated into single state machine
	type LoadingState = 'initial' | 'loading' | 'loaded' | 'timeout' | 'error';
	let loadingState = $state<LoadingState>('initial');
	
	// Derived loading state flags for backward compatibility
	let dataLoaded = $derived(loadingState === 'loaded');
	let showSkeleton = $derived(loadingState === 'initial' || loadingState === 'loading');
	let loadingTimeout = $derived(loadingState === 'timeout');

	// Scroll state
	// Using $state.raw for DOM element reference - only reassigned, not mutated
	let taskListRef = $state.raw<HTMLElement | null>(null);
	// Module-scoped timeout (not reactive state)
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

	// Scroll to top button state
	let showScrollToTop = $state(false);

	// BTC price for USDT conversion
	let btcPrice = $state<number>(BTC_PRICE_FALLBACK);

	// View mode state - Airbnb style toggle
	let viewMode = $state<'list' | 'map'>('list');

	// Selected task for map display (separate from bid task to avoid conflicts)
	let selectedTaskForMap = $state<Task | null>(null);
	
	// Selected task for bid drawer (separate from map selection)
	let selectedTaskForBid = $state<Task | null>(null);
	
	// Derived: Check if map is visible (desktop sidebar or mobile map view)
	const isMapVisible = $derived(mapLoaded && (viewMode === 'list' || viewMode === 'map'));
	
	// Bid drawer state
	let isBidOpen = $state(false);
	
	// Task details drawer state
	let selectedTaskForDetails = $state<Task | null>(null);
	let isTaskDetailsOpen = $state(false);
	
	// Timeout IDs for drawer close animations (to prevent memory leaks)
	let drawerCloseTimeouts: Set<ReturnType<typeof setTimeout>> = $state.raw(new Set());
	
	// Debounce state for onViewTask
	let viewTaskDebounceTimeout: ReturnType<typeof setTimeout> | null = null;

	// Infinite scroll state - use atomic flag to prevent race conditions
	let isLoadingMore = $state(false); // Flag to prevent multiple simultaneous loads
	
	// Task selection locking to prevent race conditions
	let isTaskSelectionInProgress = $state(false);


	// Add class to app-shell__content to prevent scrolling (avoids :has() flickering)
	// Using $state.raw for DOM element reference - only reassigned, not mutated
	let appShellContent: HTMLElement | null = $state.raw(null);

	// ============================================================================
	// STORE MANAGEMENT FUNCTIONS
	// ============================================================================
	
	/**
	 * Clear tasks store - extracted to reduce duplication
	 */
	function clearTasksStore(): void {
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));
	}

	// ============================================================================
	// DATE FORMATTING - LRU Cache with max 1000 entries
	// ============================================================================
	
	// LRU caches for date formatting (max 1000 entries each)
	const dateFormatterCache = new LRUCache<string, string>(DATE_CACHE_MAX_SIZE);
	const dateRangeFormatterCache = new LRUCache<string, string>(DATE_CACHE_MAX_SIZE);
	
	// Current locale for cache key optimization
	let currentLocale = $state($locale || 'en');

	// ============================================================================
	// REACTIVE EFFECTS - Optimized and combined where appropriate
	// ============================================================================
	
	// Clear cache when locale changes
	$effect(() => {
		const newLocale = $locale || 'en';
		if (newLocale !== currentLocale) {
			currentLocale = newLocale;
			dateFormatterCache.clear();
			dateRangeFormatterCache.clear();
		}
	});

	/**
	 * Format a single date string with caching
	 * Uses optimized cache key: just the date string + locale
	 */
	function formatDateTimeReactive(dateString: string): string {
		if (!dateString) return '';
		
		// Optimized cache key: dateString + locale (no pipe separator needed)
		const cacheKey = `${dateString}:${currentLocale}`;
		const cached = dateFormatterCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
		
		const formatted = formatStandardDateShort(date, currentLocale);
		dateFormatterCache.set(cacheKey, formatted);
		return formatted;
	}

	/**
	 * Format a date range with caching
	 * Uses optimized cache key: start|end:locale
	 */
	function formatDateRangeReactive(startDateString: string, endDateString: string): string {
		if (!startDateString && !endDateString) return '';
		
		// Optimized cache key: start|end:locale
		const cacheKey = `${startDateString || ''}|${endDateString || ''}:${currentLocale}`;
		const cached = dateRangeFormatterCache.get(cacheKey);
		if (cached !== undefined) {
			return cached;
		}

		const formatValue = (value: string) => {
			if (!value) return '';
			const date = parseDateToLocalMidnight(value);
			if (!date) return '';
			return formatStandardDateShort(date, currentLocale);
		};

		const startFormatted = formatValue(startDateString);
		const endFormatted = formatValue(endDateString);

		let formatted: string;
		if (startFormatted && endFormatted) {
			formatted = `${startFormatted} - ${endFormatted}`;
		} else {
			formatted = startFormatted || endFormatted || '';
		}

		dateRangeFormatterCache.set(cacheKey, formatted);
		return formatted;
	}

	// ============================================================================
	// SCROLL FUNCTIONS
	// ============================================================================
	
	/**
	 * Combined scroll handler for both scroll-to-top button and infinite scroll
	 * Optimized to avoid forced reflows by batching DOM reads in requestAnimationFrame
	 */
	function handleScroll() {
		if (!taskListRef) return;

		// Use requestAnimationFrame to batch DOM reads and avoid forced reflows
		// This prevents the "Forced reflow" warnings by deferring DOM reads
		requestAnimationFrame(() => {
			if (!taskListRef) return;

			// Batch all DOM reads together to minimize reflows
			const scrollTop = taskListRef.scrollTop;
			const scrollHeight = taskListRef.scrollHeight;
			const clientHeight = taskListRef.clientHeight;

			// Show/hide scroll to top button (lightweight check)
			showScrollToTop = scrollTop > SCROLL_TO_TOP_THRESHOLD;

			// Handle infinite scroll with debouncing
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
				scrollTimeout = null;
			}

			scrollTimeout = setTimeout(() => {
				// Clear timeout reference when it executes
				scrollTimeout = null;
				
				if (!taskListRef || !$tasksStore.hasMore || $tasksStore.loading || isLoadingMore) {
					return;
				}

				// Re-read DOM properties in setTimeout to ensure they're current
				// This is acceptable since it's debounced and only runs when needed
				const currentScrollTop = taskListRef.scrollTop;
				const currentScrollHeight = taskListRef.scrollHeight;
				const currentClientHeight = taskListRef.clientHeight;
				const distanceFromBottom = currentScrollHeight - (currentScrollTop + currentClientHeight);

				// Load more when within trigger distance of bottom
				if (distanceFromBottom < INFINITE_SCROLL_TRIGGER_DISTANCE) {
					loadMoreTasks();
				}
			}, SCROLL_DEBOUNCE_DELAY);
		});
	}

	/**
	 * Scroll to top of task list
	 */
	function scrollToTop() {
		if (taskListRef) {
			taskListRef.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		}
	}
	
	/**
	 * Cleanup scroll listener and timeout
	 */
	function cleanupScrollListener(): void {
		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
			scrollTimeout = null;
		}
	}

	/**
	 * Lazy load drawer components after initial render
	 */
	async function loadDrawerComponents(): Promise<void> {
		if (drawersLoaded) return;
		try {
			const [filterModule, bidFormModule, saveSearchModule, taskDrawerModule] = await Promise.all([
				import('$lib/components/filters/FilterDrawer.svelte'),
				import('$lib/components/bidding/BidForm.svelte'),
				import('$lib/components/task/SaveSearchForm.svelte'),
				import('$lib/components/task/TaskDrawer.svelte')
			]);
			FilterDrawer = filterModule.default;
			BidForm = bidFormModule.default;
			SaveSearchForm = saveSearchModule.default;
			TaskDrawer = taskDrawerModule.default;
			drawersLoaded = true;
		} catch (error) {
			console.error('Error loading drawer components:', error);
		}
	}

	/**
	 * Attempt to preload map component with proper cleanup tracking
	 * Returns cleanup function to cancel the preload if component unmounts
	 */
	function attemptMapPreload(reason: 'view-mode' | 'resize' | 'mount'): (() => void) | null {
		// Prevent multiple preload attempts
		if (mapLoaded || mapPreloadAttempted) return null;
		
		const isMobileOrTablet = windowWidth < DESKTOP_MIN_WIDTH;
		const isDesktop = windowWidth >= DESKTOP_MIN_WIDTH;
		
		// Only preload on mobile/tablet, or if explicitly requested for mount (desktop)
		if (reason === 'mount' && isDesktop) {
			// Desktop: load immediately on mount
			mapPreloadAttempted = true;
			loadMapComponent();
			return null;
		}
		
		if (!isMobileOrTablet && reason !== 'mount') {
			return null;
		}
		
		mapPreloadAttempted = true;
		
		let idleCallbackId: number | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;
		
		if (window.requestIdleCallback) {
			idleCallbackId = window.requestIdleCallback(() => {
				if (!mapLoaded) {
					loadMapComponent();
				}
			}, { timeout: MAP_PRELOAD_TIMEOUT_MS });
		} else {
			// Fallback for browsers without requestIdleCallback
			timeoutId = setTimeout(() => {
				if (!mapLoaded) {
					loadMapComponent();
				}
			}, MAP_PRELOAD_FALLBACK_MS);
		}
		
		// Return cleanup function
		return () => {
			if (idleCallbackId && window.cancelIdleCallback) {
				window.cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}

	/**
	 * Lazy load map component
	 * Permission check removed for faster loading - map component handles geolocation internally
	 */
	async function loadMapComponent(): Promise<void> {
		if (mapLoaded) return;

		try {
			TaskLocationMap = (await import('$lib/components/maps/TaskLocationMap.svelte')).default;
			mapLoaded = true;
		} catch (error) {
			console.error('Error loading map component:', error);
		}
	}


	/**
	 * Fast hash function for search params to avoid expensive JSON.stringify
	 * Creates a deterministic hash from search parameters
	 */
	function hashSearchParams(params: SearchTasksParams): string {
		// Create a stable string representation without JSON.stringify overhead
		const parts: string[] = [];
		
		if (params.search) parts.push(`s:${params.search}`);
		if (params.taskType) parts.push(`t:${params.taskType}`);
		if (params.page) parts.push(`p:${params.page}`);
		if (params.limit) parts.push(`l:${params.limit}`);
		if (params.until) parts.push(`u:${params.until}`);
		
		if (params.categories?.length) {
			parts.push(`c:${[...params.categories].sort().join(',')}`);
		}
		if (params.skills?.length) {
			parts.push(`sk:${[...params.skills].sort().join(',')}`);
		}
		
		if (params.budget) {
			const b = params.budget;
			if (b.tier) parts.push(`bt:${b.tier}`);
			if (b.currency) parts.push(`bc:${b.currency}`);
			if (b.type) parts.push(`bty:${b.type}`);
		}
		
		return parts.join('|');
	}

	/**
	 * Fetch current BTC price (deferred)
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
		// Create a key from search params using fast hash function
		const currentSearchKey = hashSearchParams(searchParams);
		const searchChanged =
			$tasksStore.searchParamsKey !== '' && $tasksStore.searchParamsKey !== currentSearchKey;

		// Check if we already have tasks in store (from previous navigation)
		const hasExistingTasks = $tasksStore.items.length > 0;

		// If we have existing tasks and search hasn't changed, don't reload - just use what's in the store
		if (hasExistingTasks && !searchChanged) {
			$tasksStore.searchParamsKey = currentSearchKey;
			return;
		}

		// Prevent multiple loads - if already loading, don't start another
		if ($tasksStore.loading) return;

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
				clearTasksStore();
			}

			await findTasks(searchParams);

			$tasksStore.searchParamsKey = currentSearchKey;
			loadingState = 'loaded';

		} catch (error) {
			loadingState = 'error';
			// Set error in store for user-facing error message
			tasksStore.update((state) => ({
				...state,
				error: error instanceof Error ? error.message : 'Failed to load tasks'
			}));
		}
	}

	// ============================================================================
	// SEARCH FUNCTIONS
	// ============================================================================
	
	/**
	 * Debounced search function with proper error handling
	 */
	const debouncedSearch = debounce(async () => {
		if (searchQuery.trim().length < SEARCH_MIN_LENGTH) {
			clearTasksStore();

			// Preserve existing filters, only clear the search term
			searchParams = {
				...searchParams,
				page: 1,
				search: '',
				limit: TASKS_PER_PAGE
			};
			searchQuery = '';

			try {
				await findTasks(searchParams);
			} catch (err) {
				tasksStore.update((state) => ({
					...state,
					error: err instanceof Error ? err.message : 'Search failed'
				}));
			}
			return;
		}

		const newParams: SearchTasksParams = {
			...searchParams,
			page: 1,
			search: searchQuery.trim(),
			limit: TASKS_PER_PAGE
		};

		searchParams = newParams;

		// Clear existing tasks when starting a new search
		clearTasksStore();

		try {
			await findTasks(searchParams);
		} catch (err) {
			tasksStore.update((state) => ({
				...state,
				error: err instanceof Error ? err.message : 'Search failed'
			}));
		}
	}, SEARCH_DEBOUNCE_DELAY);

	/**
	 * Handle advanced filter drawer apply
	 */
	async function handleFilterApply(filters: SearchTasksParams) {
		isFilterDrawerOpen = false;

		// Clear existing tasks when applying new filters
		clearTasksStore();

		searchParams = {
			...searchParams,
			...filters,
			page: 1,
			limit: TASKS_PER_PAGE
		};

		// Update UI controls based on applied filters
		searchQuery = filters.search || '';

		try {
			await findTasks(searchParams);
		} catch (error) {
			tasksStore.update((state) => ({
				...state,
				error: error instanceof Error ? error.message : 'Failed to apply filters'
			}));
		}
	}

	/**
	 * Clear all filters and reset search
	 */
	async function clearFilters() {
		searchQuery = '';

		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };

		// Clear existing tasks when clearing filters
		clearTasksStore();

		try {
			await findTasks(searchParams);
		} catch (error) {
			tasksStore.update((state) => ({
				...state,
				error: error instanceof Error ? error.message : 'Failed to clear filters'
			}));
		}
	}

	// Load more tasks
	async function loadMoreTasks() {
		// Prevent multiple simultaneous loads - check and set atomically
		if (!$tasksStore.hasMore || $tasksStore.loading || isLoadingMore) {
			return;
		}

		// Set loading flag immediately to prevent race conditions
		isLoadingMore = true;

		try {

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

	// Track if map preload has been attempted to avoid repeated checks
	let mapPreloadAttempted = $state(false);
	
	// Track window width for responsive map preloading
	// Initialize safely for SSR
	let windowWidth = $state(DESKTOP_MIN_WIDTH);
	
	// Combined effect: Setup scroll listener and loading timeout management
	$effect(() => {
		// Setup scroll listener when taskListRef is available
		const ref = taskListRef;
		let scrollCleanup: (() => void) | undefined;
		
		if (ref) {
			ref.addEventListener('scroll', handleScroll, { passive: true });
			scrollCleanup = () => {
				ref.removeEventListener('scroll', handleScroll);
				cleanupScrollListener();
			};
		}
		
		// Handle loading timeout for Nostr data
		let timer: ReturnType<typeof setTimeout> | undefined;
		if ($tasksStore.loading && searchParams.page === 1 && loadingState === 'loading') {
			timer = setTimeout(() => {
				if ($tasksStore.loading && searchParams.page === 1 && loadingState === 'loading') {
					loadingState = 'timeout';
					// Set error in store for user-facing error message
					tasksStore.update((state) => ({
						...state,
						error: 'Request timed out. Please try again.'
					}));
				}
			}, LOADING_TIMEOUT_MS);
		}
		
		return () => {
			if (scrollCleanup) scrollCleanup();
			if (timer) clearTimeout(timer);
		};
	});

	// Combined effect: Map loading and preloading with proper cleanup
	$effect(() => {
		if (!browser) return;
		
		// Load map component immediately when view mode changes to 'map'
		// This ensures fast loading when user switches to map view
		if (viewMode === 'map' && !mapLoaded) {
			// Cancel any pending preload attempts and load immediately
			loadMapComponent();
		}
		
		// Preload map component on mobile/tablet when in list view (only once)
		// This helps prepare the map for faster switching
		let preloadCleanup: (() => void) | null = null;
		if (viewMode === 'list' && !mapLoaded && !mapPreloadAttempted) {
			preloadCleanup = attemptMapPreload('view-mode');
		}
		
		return () => {
			// Cleanup preload if component unmounts or view mode changes
			if (preloadCleanup) {
				preloadCleanup();
			}
		};
	});
	
	// Window resize handler for responsive map preloading
	// Throttled to prevent excessive calls and forced reflows
	$effect(() => {
		if (!browser) return;
		
		// Initialize window width on mount
		windowWidth = window.innerWidth;
		
		let preloadCleanup: (() => void) | null = null;
		let resizeTimeout: ReturnType<typeof setTimeout> | null = null;
		
		const handleResize = () => {
			// Throttle resize handler to prevent excessive calls
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
			}
			
			resizeTimeout = setTimeout(() => {
				resizeTimeout = null;
				// Use requestAnimationFrame to batch DOM reads
				requestAnimationFrame(() => {
					windowWidth = window.innerWidth;
					// If window resizes to mobile/tablet and map hasn't been preloaded, attempt it
					if (windowWidth < DESKTOP_MIN_WIDTH && !mapLoaded && !mapPreloadAttempted) {
						// Cleanup any existing preload attempt
						if (preloadCleanup) {
							preloadCleanup();
						}
						preloadCleanup = attemptMapPreload('resize');
					}
				});
			}, 150); // Throttle resize to 150ms
		};
		
		window.addEventListener('resize', handleResize, { passive: true });
		return () => {
			window.removeEventListener('resize', handleResize);
			if (resizeTimeout) {
				clearTimeout(resizeTimeout);
				resizeTimeout = null;
			}
			// Cleanup preload on unmount
			if (preloadCleanup) {
				preloadCleanup();
			}
		};
	});

	// Track cleanup functions for onMount operations
	let mountCleanup: {
		idleCallbackId?: number;
		timeoutId?: ReturnType<typeof setTimeout>;
		preloadCleanup?: (() => void) | null;
	} = {};

	// Initial data fetch and setup
	onMount(async () => {
		// Ensure translations are loaded for this route
		if (browser) {
			await loadPageTranslations('/tasks');
		}

		// Find app-shell__content element once on mount
		// Use multiple attempts to ensure DOM is ready with retry limit
		let retryCount = 0;
		const addClass = () => {
			const content = document.querySelector('.app-shell__content');
			// Type guard: check if element is HTMLElement
			if (content instanceof HTMLElement && !content.hasAttribute('data-find-tasks-page')) {
				appShellContent = content;
				// Use data attribute for targeting (simpler than class + attribute)
				content.setAttribute('data-find-tasks-page', 'true');
			} else if (!content && retryCount < DOM_QUERY_MAX_RETRIES) {
				// Retry if element not found yet, up to max retries
				retryCount++;
				requestAnimationFrame(addClass);
			}
		};
		requestAnimationFrame(addClass);

		// Sync searchQuery with searchParams.search
		searchQuery = searchParams.search || '';

		// Scroll listeners are set up in $effect when taskListRef is available

		// Check if we have cached tasks that match current search
		const currentSearchKey = hashSearchParams(searchParams);
		const hasCachedData =
			$tasksStore.items.length > 0 &&
			$tasksStore.searchParamsKey === currentSearchKey;

		// Load data if no cache or cache doesn't match
		if (!hasCachedData) {
			// Clear stale cache if exists (before calling loadNostrData)
			if ($tasksStore.items.length > 0 && $tasksStore.searchParamsKey !== currentSearchKey) {
				clearTasksStore();
			}
			// Always load if no cached data - loadNostrData will handle the logic
			loadNostrData();
		} else {
			// Use cached data
			loadingState = 'loaded';
		}

		// Defer non-critical operations
		if (browser) {
			const deferredOperations = () => {
				fetchBtcPrice();
				loadDrawerComponents();
				// Use reactive windowWidth instead of window.innerWidth
				// Attempt map preload for desktop (mount reason)
				mountCleanup.preloadCleanup = attemptMapPreload('mount');
			};
			
			if (window.requestIdleCallback) {
				mountCleanup.idleCallbackId = window.requestIdleCallback(deferredOperations);
			} else {
				mountCleanup.timeoutId = setTimeout(deferredOperations, 100);
			}
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		// Cleanup scroll listener timeout (ensure it's cleared even if effect cleanup didn't run)
		cleanupScrollListener();
		
		// Cleanup onMount operations
		if (mountCleanup.idleCallbackId && window.cancelIdleCallback) {
			window.cancelIdleCallback(mountCleanup.idleCallbackId);
		}
		if (mountCleanup.timeoutId) {
			clearTimeout(mountCleanup.timeoutId);
		}
		if (mountCleanup.preloadCleanup) {
			mountCleanup.preloadCleanup();
		}
		
		// Cleanup drawer close timeouts to prevent memory leaks
		drawerCloseTimeouts.forEach(timeoutId => {
			clearTimeout(timeoutId);
		});
		drawerCloseTimeouts.clear();
		
		// Cleanup view task debounce timeout
		if (viewTaskDebounceTimeout) {
			clearTimeout(viewTaskDebounceTimeout);
			viewTaskDebounceTimeout = null;
		}
		
		// Scroll listeners are cleaned up by $effect return function
		// Remove data attribute from app-shell__content
		if (appShellContent) {
			appShellContent.removeAttribute('data-find-tasks-page');
		} else {
			// Fallback: try to find and remove even if reference is lost
			const content = document.querySelector('.app-shell__content');
			if (content instanceof HTMLElement) {
				content.removeAttribute('data-find-tasks-page');
			}
		}

		// Ensure task selection lock is released
		isTaskSelectionInProgress = false;

		cleanup();
	});

	/**
	 * Handle task selection for bidding with proper locking to prevent race conditions
	 */
	const onSelectTask = async (task: Task) => {
		// Prevent multiple simultaneous selections
		if (isTaskSelectionInProgress) {
			return;
		}
		
		if (task.status === TaskStatusEnum.OPEN) {
			isTaskSelectionInProgress = true;
			
			try {
				// Check if user is logged in
				if ($user?.npub) {
					// Check if user is trying to bid on their own task
					if (task?.npub === $user?.npub) {
						appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
					} else {
						// Ensure drawer components are loaded before opening bid drawer
						if (!drawersLoaded) {
							await loadDrawerComponents();
						}
						// Open bid drawer for logged-in users
						selectedTaskForBid = task;
						isBidOpen = true;
					}
				} else {
					// Redirect to signup page for public users
					try {
						await goto('/auth/signup');
					} catch {
						// Fallback if goto fails
						if (browser) {
							window.location.href = '/auth/signup';
						}
					}
				}
			} finally {
				// Always release lock, even on error
				isTaskSelectionInProgress = false;
			}
		}
	};

	/**
	 * Handle viewing task details with debouncing to prevent multiple simultaneous opens
	 */
	const onViewTask = async (task: Task) => {
		// Clear any pending view task calls
		if (viewTaskDebounceTimeout) {
			clearTimeout(viewTaskDebounceTimeout);
			viewTaskDebounceTimeout = null;
		}
		
		// Debounce to prevent rapid clicks from opening multiple drawers
		viewTaskDebounceTimeout = setTimeout(async () => {
			viewTaskDebounceTimeout = null;
			
			// Prevent opening if already viewing a task or if task details drawer is already open
			if (isTaskDetailsOpen || selectedTaskForDetails) {
				return;
			}
			
			// Ensure drawer components are loaded before opening task details drawer
			if (!drawersLoaded) {
				await loadDrawerComponents();
			}
			// Wait a tick to ensure TaskDrawer component is available
			await tick();
			selectedTaskForDetails = task;
			isTaskDetailsOpen = true;
		}, 100); // 100ms debounce delay
	};

	// Function to get dynamic placeholder
	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return $t('find_tasks.search_minimum_chars');
		}
		return $t('find_tasks.search_placeholder');
	}

	// Function to get search input class
	function getSearchInputClass(): string {
		let baseClass = 'input input-bordered w-full pl-10';

		if (searchQuery.length > 0 && searchQuery.length < 3) {
			baseClass += ' input-warning';
		} else if (searchQuery.length >= 3) {
			baseClass += ' input-success';
		}

		return baseClass;
	}

	// ============================================================================
	// TASK SELECTION FUNCTIONS
	// ============================================================================
	
	/**
	 * Handle task selection for map display
	 */
	function selectTaskForMap(task: Task) {
		selectedTaskForMap = task;
	}
	
	/**
	 * Scroll to a specific task card by task ID
	 */
	async function scrollToTaskCard(taskId: string) {
		// Wait for DOM to update, especially important when switching views
		await tick();
		
		// Use double requestAnimationFrame to ensure the element is fully rendered
		// This helps avoid forced reflows by ensuring layout is stable
		await new Promise<void>((resolve) => {
			requestAnimationFrame(() => {
				requestAnimationFrame(() => {
					// Try to find the card by data attribute in the scrollable container first
					let cardElement: HTMLElement | null = null;
					
					if (taskListRef) {
						const found = taskListRef.querySelector(`[data-task-id="${taskId}"]`);
						if (found instanceof HTMLElement) {
							cardElement = found;
						}
					}
					
					// Fallback to document query if not found in container
					if (!cardElement) {
						const found = document.querySelector(`[data-task-id="${taskId}"]`);
						if (found instanceof HTMLElement) {
							cardElement = found;
						}
					}
					
					if (cardElement && taskListRef) {
						// Batch all DOM reads together to minimize reflows
						const containerRect = taskListRef.getBoundingClientRect();
						const elementRect = cardElement.getBoundingClientRect();
						const scrollTop = taskListRef.scrollTop;
						const elementTop = elementRect.top - containerRect.top + scrollTop;
						const centerOffset = containerRect.height / 2 - elementRect.height / 2;
						
						taskListRef.scrollTo({
							top: elementTop - centerOffset,
							behavior: 'smooth'
						});
					} else if (cardElement) {
						// Fallback to scrollIntoView if no container ref
						cardElement.scrollIntoView({
							behavior: 'smooth',
							block: 'center'
						});
					}
					resolve();
				});
			});
		});
	}

	// Toggle view mode function
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	// ============================================================================
	// REACTIVE DERIVED VALUES - Optimized to reduce unnecessary reactive reads
	// ============================================================================
	
	/**
	 * Get translated task title for drawer - optimized to reduce reactive reads
	 * Only re-computes when selectedTaskForDetails or currentUserLanguage changes
	 */
	const getTranslatedTaskTitle = $derived.by(() => {
		if (!selectedTaskForDetails) {
			return $t('dashboard.task_details_by_task.title');
		}

		// Cache user language to avoid multiple reactive reads
		const userLang = $currentUserLanguage;
		const task = selectedTaskForDetails;
		
		if (userLang && task.translations?.sourceLanguage !== userLang) {
			const translation = taskTranslationService.getStoredTranslation(task, userLang);
			if (translation?.translatedTitle) {
				return translation.translatedTitle;
			}
		}

		// Fallback to original title
		return task.title ?? $t('dashboard.task_details_by_task.title');
	});
</script>

<main class="mx-auto min-h-0 max-w-6xl px-1 md:px-2 py-0 find-tasks-container find-tasks-page flex-1 w-full h-full" data-find-tasks-page="true">
	<div
		id="panel-find-tasks"
		role="tabpanel"
		aria-labelledby="tab-find-tasks"
		class="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden"
	>
		<!-- Search and Filter Controls -->
		<TaskListControls
			{searchQuery}
			searchInputClass={getSearchInputClass()}
			searchPlaceholder={getSearchPlaceholder()}
			onSearchInput={debouncedSearch}
			isFilterDrawerOpen={isFilterDrawerOpen}
			onFilterClick={() => (isFilterDrawerOpen = true)}
			onSaveSearch={async () => {
				// Ensure drawer components are loaded before opening save search form
				if (!drawersLoaded) {
					await loadDrawerComponents();
				}
				// Wait a tick to ensure SaveSearchForm component is available
				await tick();
				isSaveSearchOpen = true;
			}}
			canSaveSearch={$tasksStore.searchParamsKey !== ''}
			{viewMode}
			onToggleViewMode={toggleViewMode}
			user={$user}
			{drawersLoaded}
			{loadDrawerComponents}
		/>

		<!-- Main Content Area - Flattened structure with grid layout -->
		<section class="min-h-0 flex-1" data-tasks-content-area>
			<!-- Main Content - Dynamic Layout based on view mode -->
			{#if viewMode === 'list'}
				<!-- List View - Simplified grid layout -->
				<div class="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-2" data-tasks-list-view>
					<!-- Error Message (full width across both columns) -->
					{#if $tasksStore.error}
						<div class="col-span-full mb-3">
							<div class="alert alert-error alert-outline mb-3">
								<IconAlertCircle class="h-5 w-5 shrink-0 stroke-current" />
								<span>{$t('find_tasks.error_loading').replace('{error}', $tasksStore.error)}</span>
							</div>
						</div>
					{/if}

					<!-- Tasks List (scrolls) - Grid column 1 -->
					<div class="min-h-0" data-tasks-list-column>
						<div
							class="h-full w-full overflow-y-auto box-border task-list-scroll-container"
							bind:this={taskListRef}
						>
							<!-- Skeleton Loading -->
							{#if showSkeleton}
								<TaskListSkeleton count={4} />
							{:else if loadingState === 'timeout'}
								<!-- Loading Timeout Warning -->
								<div class="alert alert-warning alert-outline mb-3 rounded-xl">
									<IconAlertCircle class="h-5 w-5 shrink-0 stroke-current" />
									<div>
										<h3 class="font-bold">{$t('find_tasks.loading_timeout_title')}</h3>
										<div class="text-xs">{$t('find_tasks.loading_timeout_message')}</div>
									</div>
									<button class="btn btn-sm" onclick={() => window.location.reload()}>
										{$t('find_tasks.refresh')}
									</button>
								</div>
							{:else if loadingState === 'error'}
								<!-- Error State -->
								<div class="py-8 text-center">
									<div class="text-base-content/60 mb-3">
										<IconAlertCircle class="mx-auto h-12 w-12" />
									</div>
									<h3 class="mb-2 text-lg font-semibold">{$t('find_tasks.error_loading_title') || 'Error Loading Tasks'}</h3>
									<p class="text-base-content/70 mb-3">
										{$tasksStore.error || $t('find_tasks.error_loading_message') || 'An error occurred while loading tasks. Please try again.'}
									</p>
									<button class="btn btn-primary" onclick={() => window.location.reload()}>
										{$t('find_tasks.refresh') || 'Refresh'}
									</button>
								</div>
							{:else if $tasksStore.items && $tasksStore.items.length > 0}
								<ul class="space-y-4 task-list-items pb-0 mb-0" role="list">
									{#each $tasksStore.items as task (task.id)}
										<li role="listitem">
											<TaskCard
												{task}
												selectedTask={selectedTaskForMap}
												{btcPrice}
												{formatDateTimeReactive}
												{formatDateRangeReactive}
												{onSelectTask}
												{onViewTask}
												{drawersLoaded}
												{loadDrawerComponents}
												onSelectTaskForMap={selectTaskForMap}
												{isMapVisible}
											/>
										</li>
									{/each}
								</ul>

								<!-- Skeleton Loading for new tasks -->
								{#if $tasksStore.loading && $tasksStore.items.length > 0 && $tasksStore.hasMore}
									<TaskListSkeleton count={3} />
								{/if}
							{:else if $tasksStore.loading}
								<!-- Loading State Fallback (when skeleton is false but still loading) -->
								<div class="flex h-full items-center justify-center py-8">
									<div class="text-center">
										<span class="loading loading-spinner loading-lg text-primary"></span>
										<p class="mt-4 text-base-content/70">{$t('find_tasks.loading') || 'Loading tasks...'}</p>
									</div>
								</div>
							{:else}
								<!-- No Results -->
								<div class="py-8 text-center">
									<div class="text-base-content/60 mb-3">
										<IconMagnify class="mx-auto h-12 w-12" />
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
					<aside class="hidden min-h-0 lg:block map-container-wrapper" data-tasks-map-column aria-label={$t('find_tasks.map') || 'Task map'}>
						{#if mapLoaded && TaskLocationMap}
							<TaskLocationMap
								tasks={$tasksStore.items}
								height="100%"
								selectedTask={selectedTaskForMap}
								{btcPrice}
								{formatDateTimeReactive}
								{formatDateRangeReactive}
								{onSelectTask}
								{onViewTask}
								{drawersLoaded}
								{loadDrawerComponents}
								onTaskSelected={async (event: {
									task: Task;
									locationType: 'pickup' | 'dropoff';
								}) => {
									selectedTaskForMap = event.task;
									await scrollToTaskCard(getTaskId(event.task));
								}}
							/>
						{:else}
							<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{/if}
				</aside>
				</div>

				<!-- Mobile Floating Button - Scroll to Top (only visible on mobile) -->
				{#if showScrollToTop}
					<button
						class="scroll-to-top-button inverted-colors fixed right-4 z-50 flex items-center justify-center rounded-4xl p-3 opacity-0 translate-y-[10px] scale-90 transition-all duration-300 hover:opacity-100 hover:scale-110 hover:brightness-110 active:scale-95 active:opacity-90 lg:hidden"
						style="bottom: var(--app-bottom-fab);"
						onclick={scrollToTop}
						title={$t('find_tasks.scroll_to_top') || 'Scroll to top'}
						aria-label={$t('find_tasks.scroll_to_top') || 'Scroll to top'}
					>
						<IconChevronUp class="h-5 w-5" />
					</button>
				{/if}
			{:else}
				<!-- Map View - Full Width (Mobile only) -->
				<section class="relative min-h-0 w-full map-container-wrapper map-container-wrapper--mobile-overflow lg:hidden" data-tasks-map-view>
				{#if mapLoaded && TaskLocationMap}
					<TaskLocationMap
						tasks={$tasksStore.items}
						height="100%"
						selectedTask={selectedTaskForMap}
						allowInfoWindowOverflow={true}
						{btcPrice}
						{formatDateTimeReactive}
						{formatDateRangeReactive}
						{onSelectTask}
						{onViewTask}
						{drawersLoaded}
						{loadDrawerComponents}
						onTaskSelected={async (event: {
							task: Task;
							locationType: 'pickup' | 'dropoff';
						}) => {
							selectedTaskForMap = event.task;
							// When a task is selected on the map, switch to list view to show the task
							viewMode = 'list';
							// Wait for view mode change to complete before scrolling
							await tick();
							// Wait for next frame to ensure DOM is fully updated and taskListRef is available
							await new Promise((resolve) => requestAnimationFrame(resolve));
							await scrollToTaskCard(getTaskId(event.task));
						}}
					/>
				{:else}
					<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
						<span class="loading loading-spinner loading-lg"></span>
					</div>
					<!-- Map will load via $effect when viewMode changes to 'map' -->
				{/if}
				</section>
			{/if}
		</section>
	</div>
</main>

<!-- Advanced Filter Drawer Component -->
<Drawer
	isOpen={isFilterDrawerOpen}
	title={$t('find_tasks.filters')}
	onClose={() => (isFilterDrawerOpen = false)}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if FilterDrawer}
			<FilterDrawer initialFilters={searchParams} onApply={handleFilterApply} />
		{/if}
	{/snippet}
</Drawer>

<!-- Bid Form Drawer Component -->
<Drawer
	isOpen={isBidOpen}
	title={$t('bid_form.title')}
	onClose={() => {
		isBidOpen = false;
		// Clear selected task after animation completes (with cleanup tracking)
		const timeoutId = setTimeout(() => {
			drawerCloseTimeouts.delete(timeoutId);
			if (!isBidOpen) {
				selectedTaskForBid = null;
			}
		}, 300);
		drawerCloseTimeouts.add(timeoutId);
	}}
	position="right"
	isScrollable={true}
>
	{#snippet children()}
		{#if drawersLoaded && BidForm && selectedTaskForBid}
			<BidForm task={selectedTaskForBid!} onClose={() => (isBidOpen = false)} stickySubmit={false} />
		{:else}
			<div class="flex items-center justify-center p-8">
				<span class="loading loading-spinner loading-md"></span>
			</div>
		{/if}
	{/snippet}
</Drawer>

<!-- Save Search Form Component -->
{#if drawersLoaded && SaveSearchForm}
	<SaveSearchForm
		isOpen={isSaveSearchOpen}
		{searchParams}
		onClose={() => (isSaveSearchOpen = false)}
		onSaved={() => {}}
	/>
{/if}

<!-- Task Details Drawer Component -->
{#if selectedTaskForDetails}
	{#if drawersLoaded && TaskDrawer && selectedTaskForDetails}
		<TaskDrawer
			task={selectedTaskForDetails}
			isOpen={isTaskDetailsOpen}
			activeTab="details"
			onClose={() => {
				isTaskDetailsOpen = false;
				// Clear task after animation completes (300ms transition duration) with cleanup tracking
				const timeoutId = setTimeout(() => {
					drawerCloseTimeouts.delete(timeoutId);
					selectedTaskForDetails = null;
				}, 300);
				drawerCloseTimeouts.add(timeoutId);
			}}
			onBid={async () => {
				// Prevent multiple simultaneous bid attempts (race condition protection)
				if (isTaskSelectionInProgress || isBidOpen) {
					return;
				}
				
				// Validate task still exists and is still OPEN
				if (!selectedTaskForDetails) {
					appStore.showErrorToast($t('find_tasks.task_not_found') || 'Task not found');
					return;
				}
				
				// Check task status before allowing bid
				if (selectedTaskForDetails.status !== TaskStatusEnum.OPEN) {
					appStore.showErrorToast($t('find_tasks.task_no_longer_open') || 'This task is no longer open for bidding');
					return;
				}
				
				isTaskSelectionInProgress = true;
				
				try {
					// Check if user is logged in
					if ($user?.npub) {
						// Check if user is trying to bid on their own task
						if (selectedTaskForDetails?.npub === $user?.npub) {
							appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
							return;
						}
						
						// Store the task before closing the details drawer
						const taskToBid = selectedTaskForDetails;
						
						// Close the task details drawer first
						isTaskDetailsOpen = false;
						
						// Wait for the drawer close animation to complete (300ms)
						await new Promise(resolve => setTimeout(resolve, DRAWER_CLOSE_DELAY_MS));
						
						// Double-check task is still valid after delay
						if (!taskToBid || taskToBid.status !== TaskStatusEnum.OPEN) {
							appStore.showErrorToast($t('find_tasks.task_no_longer_open') || 'This task is no longer open for bidding');
							return;
						}
						
						// Ensure drawer components are loaded before opening bid drawer
						if (!drawersLoaded) {
							await loadDrawerComponents();
						}
						// Wait a tick to ensure BidForm component is available
						await tick();
						
						// Set the selected task for the bid form
						selectedTaskForBid = taskToBid;
						// Wait another tick to ensure selectedTaskForBid is set
						await tick();
						// Open bid drawer
						isBidOpen = true;
					} else {
						// Redirect to signup page for public users
						try {
							await goto('/auth/signup');
						} catch {
							// Fallback if goto fails
							if (browser) {
								window.location.href = '/auth/signup';
							}
						}
					}
				} catch (error) {
					console.error('[TaskDrawer] Error opening bid form:', error);
					appStore.showErrorToast($t('find_tasks.error_opening_bid_form') || 'Error opening bid form');
				} finally {
					// Always release lock, even on error
					isTaskSelectionInProgress = false;
				}
			}}
		/>
	{:else}
		<Drawer
			isOpen={isTaskDetailsOpen}
			title={getTranslatedTaskTitle}
			onClose={() => {
				isTaskDetailsOpen = false;
				// Clear task after animation completes (300ms transition duration) with cleanup tracking
				const timeoutId = setTimeout(() => {
					drawerCloseTimeouts.delete(timeoutId);
					selectedTaskForDetails = null;
				}, 300);
				drawerCloseTimeouts.add(timeoutId);
			}}
			position="right"
			isScrollable={true}
		>
			{#snippet children()}
				<div class="flex items-center justify-center p-8">
					<span class="loading loading-spinner loading-md"></span>
				</div>
			{/snippet}
		</Drawer>
	{/if}
{/if}

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}

	/* Prevent app-shell__content from scrolling on find-tasks page only */
	/* This page handles its own internal scrolling */
	/* Use data attribute for simpler, more stable targeting */
	:global(.app-shell__content[data-find-tasks-page]) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	/* On desktop, allow page to scroll normally when content exceeds viewport */
	@media (min-width: 1024px) {
		:global(.app-shell__content[data-find-tasks-page]) {
			overflow-y: auto;
			height: auto;
			min-height: 100%;
		}
	}

	/* ============================================================================
	 * CSS Variables for Height Calculations
	 * Consolidates repeated calc() expressions
	 * ============================================================================ */
	.find-tasks-container {
		--tasks-content-height-mobile: calc(
			100vh - var(--app-footer-height, var(--bottom-nav-height-safe)) - var(--header-controls-height, 10rem)
		);
	}
	@supports (height: 100dvh) {
		.find-tasks-container {
			/* Use 100dvh so content doesn't extend under browser chrome or bottom nav on mobile (e.g. Android). */
			--tasks-content-height-mobile: calc(
				100dvh - var(--app-footer-height, var(--bottom-nav-height-safe)) - var(--header-controls-height, 10rem)
			);
		}
	}

	/* ============================================================================
	 * Tasks Content Area - Flattened Structure
	 * ============================================================================ */
	[data-tasks-content-area] {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	[data-tasks-list-view] {
		display: grid;
		min-height: 0;
		flex: 1;
	}

	/* Grid column span utility - use col-span-full for full-width items */
	.col-span-full {
		grid-column: 1 / -1;
	}

	/* ============================================================================
	 * Responsive Layout - Mobile and Desktop
	 * ============================================================================ */
	
	/* Mobile Layout (< 1024px) */
	@media (max-width: 1023px) {
		.task-list-scroll-container {
			max-height: var(--tasks-content-height-mobile);
			height: var(--tasks-content-height-mobile);
		}

		.task-list-scroll-container .task-list-items {
			padding-bottom: 0;
			margin-bottom: 0;
		}

		.map-container-wrapper {
			max-height: var(--tasks-content-height-mobile);
			height: var(--tasks-content-height-mobile);
			min-height: var(--tasks-content-height-mobile);
		}

		/* Allow InfoWindow to extend outside map area on mobile map view so it isn't clipped */
		.map-container-wrapper--mobile-overflow {
			overflow: visible;
		}

		.map-container-wrapper > * {
			height: 100%;
		}

		[data-tasks-list-column],
		[data-tasks-map-column] {
			height: 100%;
			min-height: 0;
		}
	}

	/* Desktop Layout (>= 1024px) */
	@media (min-width: 1024px) {
		[data-tasks-list-view] {
			height: 100%;
			max-height: 80vh;
		}

		[data-tasks-list-column],
		[data-tasks-map-column] {
			height: 100%;
			min-height: 0;
			max-height: 100%;
		}

		.map-container-wrapper {
			height: 100%;
			max-height: 100%;
		}

		.task-list-scroll-container {
			height: 100%;
			max-height: 100%;
		}
	}

	/* Scroll to top button fade-in animation */
	/* Base styles, hover, and active states are handled by Tailwind classes */
	/* Keep only the keyframe animation which Tailwind doesn't support directly */
	@keyframes fadeInButton {
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.scroll-to-top-button {
		animation: fadeInButton 0.3s ease-out forwards;
	}
</style>

