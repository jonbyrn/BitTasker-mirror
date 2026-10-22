<script lang="ts">
	import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import type FilterDrawerComponent from '$lib/components/filters/FilterDrawer.svelte';
	import type BidFormComponent from '$lib/components/bidding/BidForm.svelte';
	import type SaveSearchFormComponent from '$lib/components/task/SaveSearchForm.svelte';
	import type TaskTabComponent from '$lib/components/task/details/TaskTab.svelte';
	import type TaskLocationMapComponent from '$lib/components/maps/TaskLocationMap.svelte';
	import { onMount, onDestroy } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser, dev } from '$app/environment';
	import { resolve } from '$app/paths';
	import { Capacitor } from '@capacitor/core';
	import { tasksStore } from '$lib/stores/task.store';
	import { scroll } from '$lib/stores/infiniteScroll.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { dedupeReplaceableTasks, visibleWorkerTasks } from '$lib/browse/task-board';
	import { loadSharedCatalog } from '$lib/browse/shared-catalog';
	import { publishBid } from '$lib/utils/nostr-bid';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import { TASK_LIST_PAGE_SIZE } from '$lib/stores/task.store';
	import { debounceWithAbort } from '$lib/utils/helpers/common';
	import {
		LISTING_SEARCH_DEBOUNCE_MS,
		fetchListingSearch,
		listingSearchPath,
		readSearchQueryParam,
		replaceSearchQueryParam,
		tasksFromSearchBody
	} from '$lib/search/listing-search';
	import { taskTranslationService } from '$lib/services/task-translation.service';
	import { currentUserLanguage } from '$lib/stores/translation.store';
	import { LRUCache } from '$lib/utils/helpers/lru-cache';
	import TaskCard from '$lib/components/task/TaskCard.svelte';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import TaskListSkeleton from '$lib/components/task/TaskListSkeleton.svelte';
	import TaskListControls from '$lib/components/task/TaskListControls.svelte';
	import {
		manageSaveSearchBanner,
		dismissSaveSearchBanner,
		cancelDeferredBanner
	} from '$lib/utils/saveSearchBanner';

	// Icon imports for unplugin-icons
	import IconAlertCircle from '~icons/mdi/alert-circle';
	import IconChevronUp from '~icons/mdi/chevron-up';
	import IconMagnify from '~icons/mdi/magnify';

	// ============================================================================
	// CONSTANTS - Organized by category
	// ============================================================================

	// Scroll constants
	const SCROLL_TO_TOP_THRESHOLD = 300; // px - Show scroll to top button after scrolling this distance

	// Search constants
	const SEARCH_DEBOUNCE_DELAY = LISTING_SEARCH_DEBOUNCE_MS;

	// Layout constants
	const DESKTOP_MIN_WIDTH = 1024; // Desktop breakpoint in pixels
	const DATE_CACHE_MAX_SIZE = 1000; // Maximum entries in LRU cache for date formatting

	// Data loading constants
	const BTC_PRICE_FALLBACK = 120000; // Default fallback BTC price in USD
	const LOADING_TIMEOUT_MS = 30000; // 30 seconds timeout for loading

	// Map preload timing constants
	const MAP_PRELOAD_TIMEOUT_MS = 2000; // Load within 2 seconds even if not idle
	const MAP_PRELOAD_FALLBACK_MS = 1000; // Fallback timeout for browsers without requestIdleCallback
	const DRAWER_CLOSE_DELAY_MS = 300; // Delay for drawer close animation

	// Lazy loaded components with proper types
	let TaskLocationMap: typeof TaskLocationMapComponent | null = $state(null);
	let FilterDrawer: typeof FilterDrawerComponent | null = $state(null);
	let BidForm: typeof BidFormComponent | null = $state(null);
	let SaveSearchForm: typeof SaveSearchFormComponent | null = $state(null);
	let TaskTab: typeof TaskTabComponent | null = $state(null);

	// Configure the layout's InfiniteScroll component at init time
	scroll.set({
		hasMore: true,
		threshold: 500,
		elementScroll: null,
		page: 0,
		horizontal: false,
		loadMore: async () => {
			if (!$tasksStore.hasMore || $tasksStore.loading) return;

			const lastRelayTs = $tasksStore.lastRelayTimestamp;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];
			const cursorTimestamp = lastRelayTs ?? lastItem?.createdAt;
			if (!cursorTimestamp) return;

			try {
				const nextPage = $tasksStore.currentPage + 1;
				await findTasks({
					...searchParams,
					page: nextPage,
					until: cursorTimestamp - 1,
					limit: TASK_LIST_PAGE_SIZE
				});
			} catch (error) {
				console.error('[FindTasks] Error loading more tasks:', error);
			}

			scroll.update((s) => ({ ...s, hasMore: $tasksStore.hasMore }));
		}
	});

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
			limit: TASK_LIST_PAGE_SIZE,
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
	let indexTasks = $state<Task[]>([]);
	let indexPending = $state(false);
	let indexLoading = $state(false);
	let indexAbort: AbortController | null = null;
	const indexQueryActive = $derived(searchQuery.trim().length > 0);

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Save search state
	let isSaveSearchOpen = $state(false);
	let isSearchInputFocused = $state(false);
	let pendingSaveSearchParams: SearchTasksParams | null = null;
	const isNative = Capacitor.isNativePlatform();
	let searchVersion = $state(0);
	let searchAbortController: AbortController | null = null;

	// Loading states - consolidated into single state machine
	type LoadingState = 'initial' | 'loading' | 'loaded' | 'timeout' | 'error';
	let loadingState = $state<LoadingState>('initial');

	// Derived loading state flags for backward compatibility
	let showSkeleton = $derived(loadingState === 'initial' || loadingState === 'loading');

	// Scroll state
	// Using $state.raw for DOM element reference - only reassigned, not mutated
	let taskListRef = $state.raw<HTMLElement | null>(null);

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

	// Infinite scroll state - use atomic flag to prevent race conditions
	let isLoadingMore = $state(false);

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

	function scrollToTop(): void {
		$appScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Configure the layout's InfiniteScroll component
	// After filter/view changes, dispatch scroll event to trigger fallback check.
	function syncScrollHasMore() {
		scroll.update((s) => ({ ...s, hasMore: $tasksStore.hasMore }));

		if (browser && $tasksStore.hasMore && !$tasksStore.loading) {
			requestAnimationFrame(() => {
				const scrollEl = document.querySelector('.app-shell__content');
				if (scrollEl) {
					scrollEl.dispatchEvent(new Event('scroll'));
				}
			});
		}
	}

	/**
	 * Lazy load drawer components after initial render
	 */
	async function loadDrawerComponents(): Promise<void> {
		if (drawersLoaded) return;
		try {
			const [filterModule, bidFormModule, saveSearchModule, taskTabModule] = await Promise.all([
				import('$lib/components/filters/FilterDrawer.svelte'),
				import('$lib/components/bidding/BidForm.svelte'),
				import('$lib/components/task/SaveSearchForm.svelte'),
				import('$lib/components/task/details/TaskTab.svelte')
			]);
			FilterDrawer = filterModule.default;
			BidForm = bidFormModule.default;
			SaveSearchForm = saveSearchModule.default;
			TaskTab = taskTabModule.default;
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
			idleCallbackId = window.requestIdleCallback(
				() => {
					if (!mapLoaded) {
						loadMapComponent();
					}
				},
				{ timeout: MAP_PRELOAD_TIMEOUT_MS }
			);
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
			loadingState = 'loaded';
			return;
		}

		// Prevent multiple loads - if already loading, don't start another
		if ($tasksStore.loading) return;

		try {
			loadingState = 'loading';

			// Only load if we don't have tasks or search changed
			const newSearchParams: SearchTasksParams = {
				...searchParams,
				page: 1,
				limit: TASK_LIST_PAGE_SIZE
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
			syncScrollHasMore();
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
	function syncQueryParam(q: string) {
		if (!browser) return;
		const next = replaceSearchQueryParam(window.location.href, q);
		if (next !== window.location.href) history.replaceState(history.state, '', next);
	}

	async function runIndexSearch(q: string, version: number) {
		indexAbort?.abort();
		const controller = new AbortController();
		indexAbort = controller;
		indexLoading = true;
		indexTasks = [];
		const path = listingSearchPath({
			q,
			type: 'task',
			categoryIds: searchParams.categories
		});
		try {
			const body = await fetchListingSearch(path, controller.signal);
			if (controller.signal.aborted || version !== searchVersion) return;
			indexTasks = tasksFromSearchBody(body, searchParams.categories);
			indexLoading = false;
			indexPending = false;
		} catch (error) {
			if (error instanceof DOMException && error.name === 'AbortError') return;
			if (controller.signal.aborted || version !== searchVersion) return;
			indexTasks = [];
			indexLoading = false;
			indexPending = false;
		}
	}

	function onSearchTyping() {
		indexPending = searchQuery.trim().length > 0;
		if (!indexPending) indexTasks = [];
		debouncedSearch();
	}

	const debouncedSearch = debounceWithAbort(async () => {
		const currentVersion = ++searchVersion;
		const trimmedQuery = searchQuery.trim();

		// Abort any in-flight search request
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		// Dismiss any pending deferred banner from a previous search
		cancelDeferredBanner();
		await dismissSaveSearchBanner();

		syncQueryParam(trimmedQuery);
		if (trimmedQuery) {
			await runIndexSearch(trimmedQuery, currentVersion);
			return;
		}
		indexPending = false;
		indexTasks = [];
		indexAbort?.abort();

		// Update searchParams and explicitly clear until for new search
		searchParams = {
			...searchParams,
			page: 1,
			search: '',
			until: undefined,
			limit: TASK_LIST_PAGE_SIZE
		};

		await loadNostrData();

		if (currentVersion !== searchVersion) return;

		// Show save search banner AFTER results load
		// On native mobile: suppress while keyboard is open, re-trigger on blur
		// On web: always show (no keyboard interruption)
		const shouldSuppress = isNative && isSearchInputFocused;
		if (shouldSuppress) {
			pendingSaveSearchParams = { ...searchParams };
			await dismissSaveSearchBanner();
		} else {
			pendingSaveSearchParams = null;
			await manageSaveSearchBanner(
				searchParams as unknown as Record<string, unknown>,
				'tasks',
				() => (isSaveSearchOpen = true),
				{
					deferred: true,
					deferMs: 2500
				}
			);
		}
	}, SEARCH_DEBOUNCE_DELAY);

	/**
	 * Handle advanced filter drawer apply
	 */
	async function handleFilterApply(filters: SearchTasksParams) {
		isFilterDrawerOpen = false;

		// Abort any in-flight search
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		// Clear existing tasks when applying new filters
		clearTasksStore();

		searchParams = {
			...getInitialSearchParams(),
			...filters,
			page: 1,
			until: undefined,
			limit: TASK_LIST_PAGE_SIZE
		};

		// Update UI controls based on applied filters
		searchQuery = filters.search || '';
		syncQueryParam(searchQuery.trim());
		if (searchQuery.trim()) {
			indexPending = true;
			await runIndexSearch(searchQuery.trim(), ++searchVersion);
		} else {
			indexPending = false;
			indexTasks = [];
		}

		try {
			await findTasks(searchParams);
		} catch (error) {
			tasksStore.update((state) => ({
				...state,
				error: error instanceof Error ? error.message : 'Failed to apply filters'
			}));
		}

		// Show banner after results load
		const shouldSuppressFilter = isNative && isSearchInputFocused;
		if (shouldSuppressFilter) {
			pendingSaveSearchParams = { ...searchParams };
		} else {
			pendingSaveSearchParams = null;
			await manageSaveSearchBanner(
				searchParams as unknown as Record<string, unknown>,
				'tasks',
				() => (isSaveSearchOpen = true),
				{
					deferred: true,
					deferMs: 2000
				}
			);
		}
	}

	/**
	 * Clear all filters and reset search
	 */
	async function clearFilters() {
		searchQuery = '';
		indexPending = false;
		indexTasks = [];
		indexAbort?.abort();
		syncQueryParam('');

		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };

		pendingSaveSearchParams = null;
		cancelDeferredBanner();
		await dismissSaveSearchBanner();

		// Abort any in-flight search
		if (searchAbortController) {
			searchAbortController.abort();
		}

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
	async function loadMoreTasks(minCount?: number) {
		// Prevent multiple simultaneous loads - check and set atomically
		if (!$tasksStore.hasMore || $tasksStore.loading || isLoadingMore) {
			return;
		}

		// Set loading flag immediately to prevent race conditions
		isLoadingMore = true;

		try {
			const nextPage = $tasksStore.currentPage + 1;

			// Use lastRelayTimestamp as the cursor — this tracks the oldest relay event
			// received regardless of how many were muted, preventing pagination drift.
			// Fall back to the last visible item's timestamp if not yet set.
			const lastRelayTs = $tasksStore.lastRelayTimestamp;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];
			const cursorTimestamp = lastRelayTs ?? lastItem?.createdAt;

			if (!cursorTimestamp) {
				console.warn('[FindTasks] No cursor timestamp found, cannot load more');
				isLoadingMore = false;
				return;
			}

			const untilTimestamp = cursorTimestamp - 1;
			const limit = minCount ? Math.max(minCount, TASK_LIST_PAGE_SIZE) : TASK_LIST_PAGE_SIZE;

			searchParams = {
				...searchParams,
				page: nextPage,
				until: untilTimestamp,
				limit
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
		if (browser && dev) {
			void import('$lib/utils/performance-testing-helper');
		}

		if (browser) {
			const savedParamsRaw = sessionStorage.getItem('savedSearchParams');
			if (savedParamsRaw) {
				try {
					const saved = JSON.parse(savedParamsRaw) as SearchTasksParams;
					sessionStorage.removeItem('savedSearchParams');
					searchParams = {
						...getInitialSearchParams(),
						...saved,
						page: 1,
						limit: TASK_LIST_PAGE_SIZE
					};
				} catch (error) {
					console.warn('[FindTasks] Invalid savedSearchParams', error);
				}
			}
		}

		// Scroll-to-top visibility via $appScrollContainer
		const scrollEl = $appScrollContainer ?? document.querySelector('.app-shell__content');
		if (scrollEl instanceof HTMLElement) {
			const onScroll = () => {
				showScrollToTop = scrollEl.scrollTop > SCROLL_TO_TOP_THRESHOLD;
			};
			scrollEl.addEventListener('scroll', onScroll, { passive: true });
		}

		const fromUrl = readSearchQueryParam(window.location.href);
		if (fromUrl) {
			searchParams = { ...searchParams, search: fromUrl };
		}
		// Sync searchQuery with searchParams.search or ?q=
		searchQuery = searchParams.search || fromUrl;
		if (searchQuery.trim()) indexPending = true;

		// Scroll listeners are set up in $effect when taskListRef is available

		// Check if we have cached tasks that match current search
		const currentSearchKey = hashSearchParams(searchParams);
		const hasCachedData =
			$tasksStore.items.length > 0 && $tasksStore.searchParamsKey === currentSearchKey;

		// Load data if no cache or cache doesn't match
		if (searchQuery.trim()) {
			void runIndexSearch(searchQuery.trim(), ++searchVersion);
		}

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

	onDestroy(() => {
		if (mountCleanup.idleCallbackId && window.cancelIdleCallback) {
			window.cancelIdleCallback(mountCleanup.idleCallbackId);
		}
		if (mountCleanup.timeoutId) {
			clearTimeout(mountCleanup.timeoutId);
		}
		if (mountCleanup.preloadCleanup) {
			mountCleanup.preloadCleanup();
		}

		debouncedSearch.abort();
		cancelDeferredBanner();
		if (searchAbortController) {
			searchAbortController.abort();
		}
		indexAbort?.abort();
		cleanup();
	});

	// ============================================================================
	// DRAWER FUNCTIONS
	// ============================================================================

	const onSelectTask = async (task: Task) => {
		if (isBidOpen || task.status !== TaskStatusEnum.OPEN) return;

		if (!$user?.npub) {
			goto('/auth/signup').catch(() => {
				if (browser) window.location.href = '/auth/signup';
			});
			return;
		}

		if (task.npub === $user.npub) {
			appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
			return;
		}

		if (!drawersLoaded) await loadDrawerComponents();
		selectedTaskForBid = task;
		isBidOpen = true;
	};

	async function handleBidSubmit(data: {
		amount: number;
		days: number;
		proposal: string;
		taskId: string;
	}) {
		const task = selectedTaskForBid;
		if (!task?.eventId) throw new Error('Task event id is unavailable');

		await publishBid({
			taskId: data.taskId,
			taskEventId: task.eventId,
			taskDTag: task.id,
			taskTitle: task.title,
			taskDescription: task.description,
			taskBudget: task.budget,
			taskCreatorPubkey: task.npub,
			amount: data.amount,
			days: data.days,
			proposal: data.proposal
		});
		appStore.showSuccessToast($t('bids.task_details.bid_submitted'));
	}

	const onViewTask = async (task: Task) => {
		if (isTaskDetailsOpen) return;
		if (!drawersLoaded) await loadDrawerComponents();
		selectedTaskForDetails = task;
		isTaskDetailsOpen = true;
	};

	function closeTaskDetails() {
		isTaskDetailsOpen = false;
		setTimeout(() => {
			if (!isTaskDetailsOpen) selectedTaskForDetails = null;
		}, DRAWER_CLOSE_DELAY_MS);
	}

	function closeBidDrawer() {
		isBidOpen = false;
		setTimeout(() => {
			if (!isBidOpen) selectedTaskForBid = null;
		}, DRAWER_CLOSE_DELAY_MS);
	}

	async function handleBidFromDetails() {
		if (isBidOpen || !selectedTaskForDetails) return;
		const task = selectedTaskForDetails;

		if (task.status !== TaskStatusEnum.OPEN) {
			appStore.showErrorToast(
				$t('find_tasks.task_no_longer_open') || 'This task is no longer open for bidding'
			);
			return;
		}
		if (!$user?.npub) {
			goto('/auth/signup').catch(() => {
				if (browser) window.location.href = '/auth/signup';
			});
			return;
		}
		if (task.npub === $user.npub) {
			appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
			return;
		}

		isTaskDetailsOpen = false;
		selectedTaskForDetails = null;
		await new Promise((r) => setTimeout(r, DRAWER_CLOSE_DELAY_MS));

		if (!drawersLoaded) await loadDrawerComponents();
		selectedTaskForBid = task;
		isBidOpen = true;
	}

	// Function to get dynamic placeholder
	function getSearchPlaceholder(): string {
		return $t('find_tasks.search_placeholder');
	}

	function getSearchInputClass(): string {
		return 'input input-bordered w-full pl-10';
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

	// Toggle view mode function
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	// ============================================================================
	// TASK DETAILS DRAWER DERIVED VALUES
	// ============================================================================

	const taskDetailsTitle = $derived.by(() => {
		if (!selectedTaskForDetails) return $t('dashboard.task_details_by_task.title');
		const userLang = $currentUserLanguage;
		if (userLang && selectedTaskForDetails.translations?.sourceLanguage !== userLang) {
			const translation = taskTranslationService.getStoredTranslation(
				selectedTaskForDetails,
				userLang
			);
			if (translation?.translatedTitle) return translation.translatedTitle;
		}
		return selectedTaskForDetails.title ?? $t('dashboard.task_details_by_task.title');
	});

	const isTaskOwner = $derived(
		!!selectedTaskForDetails && selectedTaskForDetails.npub === $user?.npub
	);

	let catalogTasks = $state<Task[] | null>(null);

	function isDefaultTaskQuery(params: SearchTasksParams): boolean {
		return (
			!params.search &&
			params.until == null &&
			!params.taskType &&
			!(params.categories && params.categories.length) &&
			!(params.skills && params.skills.length) &&
			!params.budget?.tier &&
			!params.budget?.currency &&
			!params.budget?.type
		);
	}

	$effect(() => {
		if (!browser || !isDefaultTaskQuery(searchParams)) return;
		let cancel = false;
		loadSharedCatalog()
			.then((tasks) => {
				if (!cancel) catalogTasks = tasks;
			})
			.catch(() => {
				if (!cancel) catalogTasks = [];
			});
		return () => {
			cancel = true;
		};
	});

	const workerTasks = $derived.by(() => {
		const storeItems = $tasksStore.items;
		const source =
			isDefaultTaskQuery(searchParams) && catalogTasks && catalogTasks.length > 0
				? dedupeReplaceableTasks([...catalogTasks, ...storeItems]).sort(
						(left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0)
					)
				: storeItems;
		return visibleWorkerTasks(source);
	});
	const listedTasks = $derived(indexQueryActive ? indexTasks : workerTasks);
	let hiddenScan = $state(0);
	const scanningHiddenTasks = $derived(
		workerTasks.length === 0 &&
			$tasksStore.items.length > 0 &&
			$tasksStore.hasMore &&
			!$tasksStore.loading &&
			hiddenScan < 6
	);
	const waitingForCatalog = $derived(
		isDefaultTaskQuery(searchParams) && catalogTasks === null && workerTasks.length === 0
	);

	$effect(() => {
		if ($tasksStore.items.length === 0 && !$tasksStore.loading) hiddenScan = 0;
	});

	$effect(() => {
		if (!browser || !scanningHiddenTasks || isLoadingMore) return;
		hiddenScan += 1;
		void loadMoreTasks(TASK_LIST_PAGE_SIZE);
	});
</script>

<!-- Mismas dimensiones que Mi Panel -->
<main
	class="find-tasks-container find-tasks-page mx-auto h-full min-h-0 w-full max-w-6xl min-w-0 flex-1 overflow-x-clip px-2 py-6 md:px-0 md:py-0"
>
	<div
		id="panel-find-tasks"
		role="tabpanel"
		aria-labelledby="tab-find-tasks"
		class="flex min-h-0 min-h-full max-w-full min-w-0 flex-col lg:min-h-0"
	>
		<h1 class="px-1 pb-3 text-2xl font-semibold">{$t('find_tasks.title')}</h1>
		<!-- Search and Filter Controls — sticky wrapper -->
		<div class="tasks-controls-wrapper">
			<p class="px-1 pb-2 text-sm">
				<a class="link" href={resolve('/(app)/search')}>{$t('find_tasks.search_everything')}</a>
			</p>
			<TaskListControls
				bind:searchQuery
				searchInputClass={getSearchInputClass()}
				searchPlaceholder={getSearchPlaceholder()}
				onSearchInput={onSearchTyping}
				onSearchFocus={() => {
					isSearchInputFocused = true;
					if (isNative) {
						cancelDeferredBanner();
						dismissSaveSearchBanner();
					}
				}}
				onSearchBlur={() => {
					isSearchInputFocused = false;
					if (isNative && pendingSaveSearchParams) {
						const params = { ...pendingSaveSearchParams };
						pendingSaveSearchParams = null;
						manageSaveSearchBanner(params, 'tasks', () => (isSaveSearchOpen = true), {
							deferred: true,
							deferMs: 1500
						});
					}
				}}
				onFilterClick={() => (isFilterDrawerOpen = true)}
				onSaveSearch={async () => {
					if (!drawersLoaded) await loadDrawerComponents();
					isSaveSearchOpen = true;
				}}
				canSaveSearch={$tasksStore.searchParamsKey !== ''}
				{viewMode}
				onToggleViewMode={toggleViewMode}
				user={$user}
				{drawersLoaded}
				{loadDrawerComponents}
			/>
		</div>

		<!-- Main Content Area - Flattened structure with grid layout -->
		<section class="min-h-0 flex-1" data-tasks-content-area>
			<!-- Main Content - Dynamic Layout based on view mode -->
			{#if viewMode === 'list'}
				<!-- List View - Simplified grid layout -->
				<div
					class="grid min-h-0 w-full min-w-0 grid-cols-1 gap-6 lg:grid-cols-2"
					data-tasks-list-view
				>
					<!-- Error Message (full width across both columns) -->
					{#if $tasksStore.error}
						<div class="col-span-full mb-3">
							<div class="alert alert-error alert-outline mb-3 flex-wrap">
								<IconAlertCircle class="h-5 w-5 shrink-0 stroke-current" />
								<span>{$t('find_tasks.error_loading').replace('{error}', $tasksStore.error)}</span>
							</div>
						</div>
					{/if}

					<!-- Tasks List (scrolls) - Grid column 1 -->
					<div class="min-h-0 min-w-0" data-tasks-list-column bind:this={taskListRef}>
						<!-- Skeleton Loading -->
						{#if indexQueryActive && (indexPending || indexLoading) && indexTasks.length === 0}
							<div
								class="flex h-full items-center justify-center py-8"
								data-testid="tasks-search-loading"
								aria-busy="true"
							>
								<div class="text-center">
									<span class="loading loading-spinner loading-lg text-primary"></span>
									<p class="text-base-content/70 mt-4">{$t('find_tasks.loading')}</p>
								</div>
							</div>
						{:else if indexQueryActive && indexTasks.length === 0}
							<div class="py-8 text-center" data-testid="tasks-search-empty">
								<div class="text-base-content/60 mb-3">
									<IconMagnify class="mx-auto h-12 w-12" />
								</div>
								<h3 class="mb-2 text-lg font-semibold">{$t('find_tasks.no_results_title')}</h3>
								<p class="text-base-content/70 mb-3">{$t('find_tasks.no_results_message')}</p>
								<button class="btn btn-primary" onclick={clearFilters}>
									{$t('dashboard.contracts.clear_filters')}
								</button>
							</div>
						{:else if showSkeleton && !indexQueryActive}
							<div out:fade={{ duration: 150 }}>
								<TaskListSkeleton count={4} />
							</div>
						{:else if loadingState === 'timeout' && !indexQueryActive}
							<!-- Loading Timeout Warning -->
							<div class="alert alert-warning alert-outline mb-3 flex-wrap rounded-xl">
								<IconAlertCircle class="h-5 w-5 shrink-0 stroke-current" />
								<div>
									<h3 class="font-bold">{$t('find_tasks.loading_timeout_title')}</h3>
									<div class="text-xs">{$t('find_tasks.loading_timeout_message')}</div>
								</div>
								<button
									class="btn btn-sm w-full whitespace-normal sm:w-auto"
									onclick={() => window.location.reload()}
								>
									{$t('find_tasks.refresh')}
								</button>
							</div>
						{:else if loadingState === 'error' && !indexQueryActive}
							<!-- Error State -->
							<div class="py-8 text-center">
								<div class="text-base-content/60 mb-3">
									<IconAlertCircle class="mx-auto h-12 w-12" />
								</div>
								<h3 class="mb-2 text-lg font-semibold">
									{$t('find_tasks.error_loading_title') || 'Error Loading Tasks'}
								</h3>
								<p class="text-base-content/70 mb-3">
									{$tasksStore.error ||
										$t('find_tasks.error_loading_message') ||
										'An error occurred while loading tasks. Please try again.'}
								</p>
								<button class="btn btn-primary" onclick={() => window.location.reload()}>
									{$t('find_tasks.refresh') || 'Refresh'}
								</button>
							</div>
						{:else if listedTasks.length > 0}
							<ul
								class="task-list-items mb-0 max-w-full min-w-0 space-y-4 pb-0"
								role="list"
								in:fade={{ duration: 200 }}
							>
								{#each listedTasks as task (task.id)}
									<li class="max-w-full min-w-0" role="listitem">
										<TaskCard
											{task}
											selectedTask={selectedTaskForMap}
											{btcPrice}
											{onSelectTask}
											{onViewTask}
											{drawersLoaded}
											{loadDrawerComponents}
											onSelectTaskForMap={selectTaskForMap}
											{isMapVisible}
											hasBid={false}
											onMuted={(removedCount) => {
												if (removedCount > 0) loadMoreTasks(removedCount);
											}}
										/>
									</li>
								{/each}
							</ul>

							<!-- Skeleton Loading for new tasks -->
							{#if $tasksStore.loading && $tasksStore.items.length > 0 && $tasksStore.hasMore}
								<TaskListSkeleton count={3} />
							{/if}
						{:else if $tasksStore.loading || scanningHiddenTasks || waitingForCatalog}
							<!-- Loading State Fallback (when skeleton is false but still loading) -->
							<div class="flex h-full items-center justify-center py-8">
								<div class="text-center">
									<span class="loading loading-spinner loading-lg text-primary"></span>
									<p class="text-base-content/70 mt-4">
										{$t('find_tasks.loading') || 'Loading tasks...'}
									</p>
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
									{$t('dashboard.contracts.clear_filters')}
								</button>
							</div>
						{/if}
					</div>

					<!-- Desktop Map Sidebar (hidden on mobile) -->
					<aside
						class="map-container-wrapper hidden min-h-0 lg:block"
						data-tasks-map-column
						aria-label={$t('find_tasks.map') || 'Task map'}
					>
						{#if mapLoaded && TaskLocationMap}
							<TaskLocationMap
								tasks={listedTasks}
								height="100%"
								selectedTask={selectedTaskForMap}
								{btcPrice}
								{formatDateTimeReactive}
								{formatDateRangeReactive}
								{onSelectTask}
								{onViewTask}
								{drawersLoaded}
								{loadDrawerComponents}
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
						class="scroll-to-top-button inverted-colors fixed right-4 z-50 flex translate-y-[10px] scale-90 items-center justify-center rounded-4xl p-3 opacity-0 transition-all duration-300 hover:scale-110 hover:opacity-100 hover:brightness-110 active:scale-95 active:opacity-90 lg:hidden"
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
				<section
					class="map-container-wrapper map-fullscreen relative min-h-0 w-full lg:hidden"
					data-tasks-map-view
				>
					{#if mapLoaded && TaskLocationMap}
						<TaskLocationMap
							tasks={listedTasks}
							height="100%"
							selectedTask={selectedTaskForMap}
							{btcPrice}
							{formatDateTimeReactive}
							{formatDateRangeReactive}
							{onSelectTask}
							{onViewTask}
							{drawersLoaded}
							{loadDrawerComponents}
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
{#if FilterDrawer}
	<FilterDrawer
		isOpen={isFilterDrawerOpen}
		title={$t('find_tasks.filters')}
		onClose={() => (isFilterDrawerOpen = false)}
		initialFilters={searchParams}
		onApply={handleFilterApply}
	/>
{/if}

<!-- Bid Form Drawer Component -->
<Drawer
	isOpen={isBidOpen}
	title={$t('bid_form.title')}
	onClose={closeBidDrawer}
	position="right"
	isScrollable={true}
>
	{#if drawersLoaded && BidForm && selectedTaskForBid}
		<BidForm task={selectedTaskForBid} onSubmit={handleBidSubmit} onClose={closeBidDrawer} />
	{:else if isBidOpen}
		<div class="flex items-center justify-center p-8">
			<span class="loading loading-spinner loading-md"></span>
		</div>
	{/if}
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
<Drawer
	isOpen={isTaskDetailsOpen}
	title={taskDetailsTitle}
	onClose={closeTaskDetails}
	position="right"
	isScrollable={true}
>
	{#if selectedTaskForDetails && drawersLoaded && TaskTab}
		<div class="p-4">
			<TaskTab task={selectedTaskForDetails} isOwner={isTaskOwner} onBid={handleBidFromDetails} />
		</div>
	{:else if isTaskDetailsOpen}
		<div class="flex items-center justify-center p-8">
			<span class="loading loading-spinner loading-md"></span>
		</div>
	{/if}
</Drawer>

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}

	/* Prevent app-shell__content from scrolling on find-tasks page only */
	/* This page handles its own internal scrolling */
	/* ============================================================================
	 * CSS Variables for Height Calculations
	 * Consolidates repeated calc() expressions
	 * ============================================================================ */
	.find-tasks-container {
		--listing-controls-height: 60px;
		--app-header-height: 64px;
	}

	.tasks-controls-wrapper {
		position: sticky;
		top: 0;
		z-index: 10;
		padding-top: 0.5rem;
		background-color: var(--color-base-200, oklch(var(--b2)));
	}

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
		.map-fullscreen {
			flex: 1 1 0%;
			height: 0;
			max-height: none;
		}

		[data-tasks-list-column],
		[data-tasks-map-column] {
			min-height: 0;
			min-width: 0;
		}
	}

	/* Desktop Layout (>= 1024px) */
	@media (min-width: 1024px) {
		[data-tasks-list-view] {
			height: auto;
		}

		[data-tasks-list-column] {
			max-height: none;
		}

		[data-tasks-map-column] {
			position: sticky;
			top: var(--listing-controls-height);
			height: calc(90dvh - var(--listing-controls-height));
			max-height: calc(90dvh - var(--listing-controls-height));
			align-self: flex-start;
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
