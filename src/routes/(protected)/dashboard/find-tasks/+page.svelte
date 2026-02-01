<script lang="ts">
import type { Task, SearchTasksParams } from '$lib/types/task.d';
	import { onMount, onDestroy, tick, type Component } from 'svelte';
	import { browser } from '$app/environment';
	import { user } from '$lib/stores/user.store';
	import { appStore } from '$lib/stores/app.store';
	import { tasksStore } from '$lib/stores/task.store';
	import { findTasks, cleanup } from '$lib/nostr/findTasks';
	import { TaskStatusEnum } from '$lib/utils/enums/task.enum';
	import { satsFromUsd } from '$lib/utils/helpers/crypto';
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { formatNumberWithTwoDecimals } from '$lib/utils/helpers/currencyFormatter';
	import TranslatableTask from '$lib/components/task/TranslatableTask.svelte';
	import TaskDeadlineDisplay from '$lib/components/task/TaskDeadlineDisplay.svelte';
	import TaskLocationDisplay from '$lib/components/task/TaskLocationDisplay.svelte';
	import {
		formatStandardDateShort,
		parseDateToLocalMidnight
	} from '$lib/utils/helpers/dateFormatter';
	import { locale } from 'svelte-i18n';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import Drawer from '$lib/components/Drawer.svelte';
	import { TASKS_PER_PAGE } from '$lib/stores/task.store';
import { getStatusBadge } from '$lib/utils/helpers/taskStatusBadge';

	// Constants
	const SCROLL_TO_TOP_THRESHOLD = 300; // px - Show scroll to top button after scrolling this distance
	const INFINITE_SCROLL_TRIGGER_DISTANCE = 300; // px - Load more tasks when within this distance from bottom
	const SEARCH_DEBOUNCE_DELAY = 1000; // ms - Delay before executing search
	const SCROLL_DEBOUNCE_DELAY = 200; // ms - Delay for scroll event debouncing
	const HEADER_CONTROLS_HEIGHT = '12rem'; // Height of header controls (search, filters)
	const DESKTOP_CONTAINER_PADDING = '10rem'; // Padding for desktop container height calculation
	const DOM_QUERY_MAX_RETRIES = 10; // Maximum retries for DOM element queries

	// Lazy loaded components
	let TaskLocationMap: Component<any> | null = $state(null);
	let FilterDrawer: Component<any> | null = $state(null);
	let SaveSearchForm: Component<any> | null = $state(null);
	let BidForm: Component<any> | null = $state(null);

	// Component loading states
	let drawersLoaded = $state(false);
	let mapLoaded = $state(false);

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchTasksParams>(getInitialSearchParams());
	let searchQuery = $state('');


	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Save search state
	let isSaveSearchOpen = $state(false);

	// Scroll state
	let taskListRef = $state<HTMLElement | null>(null);
	let scrollHandler: ((e: Event) => void) | null = null;
	let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

	// Scroll to top button state
	let showScrollToTop = $state(false);

	// BTC price for USDT conversion
	let btcPrice = $state<number>(120000); // Default fallback price

	// View mode state - Airbnb style toggle
	let viewMode = $state<'list' | 'map'>('list');

	// Selected task for map display
	let selectedTask = $state<Task | null>(null);
	let isBidOpen = $state(false);

	// References to task cards for scrolling
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

	function formatDateTimeReactive(dateString: string) {
		if (!dateString) return '';

		const date = parseDateToLocalMidnight(dateString);
		if (!date) return '';
		
		return formatStandardDateShort(date, $locale || 'en');
	}

	function formatDateRangeReactive(startDateString: string, endDateString: string) {
		const formatValue = (value: string) => {
			const date = parseDateToLocalMidnight(value);
			if (!date) return '';
			return formatStandardDateShort(date, $locale || 'en');
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
			// Show button when scrolled more than threshold
			showScrollToTop = taskListRef.scrollTop > SCROLL_TO_TOP_THRESHOLD;
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

	/**
	 * Lazy load drawer components after initial render
	 */
	async function loadDrawerComponents(): Promise<void> {
		if (drawersLoaded) return;
		try {
			const [filterModule, saveSearchModule, bidFormModule] = await Promise.all([
				import('$lib/components/filters/FilterDrawer.svelte'),
				import('$lib/components/task/SaveSearchForm.svelte'),
				import('$lib/components/bidding/BidForm.svelte')
			]);
			FilterDrawer = filterModule.default;
			SaveSearchForm = saveSearchModule.default;
			BidForm = bidFormModule.default;
			drawersLoaded = true;
		} catch (error) {
			console.error('Error loading drawer components:', error);
		}
	}

	/**
	 * Lazy load map component with permission check
	 */
	async function loadMapComponent(): Promise<void> {
		if (mapLoaded) return;

		// Check geolocation permission before loading map
		if (browser && navigator.permissions) {
			try {
				const permission = await navigator.permissions.query({
					name: 'geolocation' as PermissionName
				});
				if (permission.state === 'denied') {
					console.warn('Geolocation permission denied, map may not work properly');
				}
			} catch (error) {
				// Permission API not supported, continue anyway
			}
		}

		try {
			TaskLocationMap = (await import('$lib/components/maps/TaskLocationMap.svelte')).default;
			mapLoaded = true;
		} catch (error) {
			console.error('Error loading map component:', error);
		}
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
		// Create a key from search params to detect if search changed
		const currentSearchKey = JSON.stringify(searchParams);
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
				tasksStore.update((state) => ({
					...state,
					items: [],
					currentPage: 1,
					hasMore: true,
					error: null
				}));
			}

			await findTasks(searchParams);

			$tasksStore.searchParamsKey = currentSearchKey;
		} catch (error) {
			console.error('[FindTasks] Error loading Nostr data:', error);
		}
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
		if (searchQuery.trim().length < 3) {
			tasksStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null,
				searchParamsKey: ''
			}));

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
				console.error('[FindTasks] Search fetch error:', err);
			}
			return;
		}

		const newParams: SearchTasksParams = {
			...searchParams,
			page: 1,
			search: searchQuery.trim()
		};

		searchParams = newParams;

		// Clear existing tasks when starting a new search
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));

		try {
			await findTasks(searchParams);
		} catch (err) {
			console.error('[FindTasks] Search fetch error:', err);
		}
	}, SEARCH_DEBOUNCE_DELAY);

	// Handle advanced filter drawer apply
	function handleFilterApply(filters: SearchTasksParams) {
		// Clear existing tasks when applying new filters
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));

		searchParams = {
			...searchParams,
			...filters,
			page: 1
		};

		// Update UI controls based on applied filters
		searchQuery = filters.search || '';

		findTasks(searchParams);
		isFilterDrawerOpen = false;
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';

		searchParams = { ...getInitialSearchParams(), limit: TASKS_PER_PAGE };

		// Clear existing tasks when clearing filters
		tasksStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));

		findTasks(searchParams);
	}

	// Load more tasks
	async function loadMoreTasks() {
		// Prevent multiple simultaneous loads
		if (!$tasksStore.hasMore || $tasksStore.loading) {
			return;
		}

		try {
			const nextPage = $tasksStore.currentPage + 1;
			const lastItem = $tasksStore.items[$tasksStore.items.length - 1];

			if (!lastItem) {
				console.warn('[FindTasks] No last item found, cannot load more');
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
		}
	}

	/**
	 * Setup infinite scroll using scroll listener
	 * Called once on mount to handle loading more tasks on scroll
	 */
	function setupInfiniteScroll(): void {
		if (!taskListRef) return;

		// Remove old handler if it exists (cleanup before setting up new one)
		if (scrollHandler && taskListRef) {
			taskListRef.removeEventListener('scroll', scrollHandler);
		}

		// Clear any pending timeout
		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
			scrollTimeout = null;
		}

		// Create scroll handler with debouncing
		scrollHandler = () => {
			if (scrollTimeout) {
				clearTimeout(scrollTimeout);
			}

			scrollTimeout = setTimeout(() => {
				if (!taskListRef || !$tasksStore.hasMore || $tasksStore.loading) {
					return;
				}

				const { scrollTop, scrollHeight, clientHeight } = taskListRef;
				const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

				// Load more when within trigger distance of bottom
				if (distanceFromBottom < INFINITE_SCROLL_TRIGGER_DISTANCE) {
					loadMoreTasks();
				}
			}, SCROLL_DEBOUNCE_DELAY);
		};

		// Add scroll listener with passive flag for better performance
		taskListRef.addEventListener('scroll', scrollHandler, { passive: true });
	}

	/**
	 * Cleanup infinite scroll listener
	 */
	function cleanupInfiniteScroll(): void {
		if (scrollHandler && taskListRef) {
			taskListRef.removeEventListener('scroll', scrollHandler);
			scrollHandler = null;
		}

		if (scrollTimeout) {
			clearTimeout(scrollTimeout);
			scrollTimeout = null;
		}
	}


	// Setup scroll listeners when taskListRef is available
	$effect(() => {
		const ref = taskListRef;
		if (ref) {
			ref.addEventListener('scroll', handleScroll);
			setupInfiniteScroll();
			return () => {
				ref.removeEventListener('scroll', handleScroll);
				cleanupInfiniteScroll();
			};
		}
	});

	// Add class to app-shell__content to prevent scrolling (avoids :has() flickering)
	let appShellContent: HTMLElement | null = $state(null);

	// Initial data fetch and setup
	onMount(() => {
		// Find app-shell__content element once on mount
		// Use multiple attempts to ensure DOM is ready with retry limit
		let retryCount = 0;
		const addClass = () => {
			const content = document.querySelector('.app-shell__content') as HTMLElement;
			if (content && !content.classList.contains('find-tasks-no-scroll')) {
				appShellContent = content;
				content.classList.add('find-tasks-no-scroll');
				// Also add data attribute for more specific targeting
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
		const currentSearchKey = JSON.stringify(searchParams);
		const hasCachedData =
			$tasksStore.items.length > 0 &&
			$tasksStore.searchParamsKey === currentSearchKey;

		// Load data if no cache or cache doesn't match
		if (!hasCachedData) {
			// Clear stale cache if exists (before calling loadNostrData)
			if ($tasksStore.items.length > 0 && $tasksStore.searchParamsKey !== currentSearchKey) {
				tasksStore.update((state) => ({
					...state,
					items: [],
					currentPage: 1,
					hasMore: true,
					error: null,
					searchParamsKey: ''
				}));
			}
			// Always load if no cached data - loadNostrData will handle the logic
			loadNostrData();
		}

		// Defer non-critical operations
		if (window.requestIdleCallback) {
			window.requestIdleCallback(() => {
				fetchBtcPrice();
				loadDrawerComponents();
				// Load map on desktop (always visible) or defer on mobile
				const isDesktop = window.innerWidth >= 1024;
				if (isDesktop) {
					loadMapComponent();
				}
			});
		} else {
			setTimeout(() => {
				fetchBtcPrice();
				loadDrawerComponents();
				const isDesktop = window.innerWidth >= 1024;
				if (isDesktop) {
					loadMapComponent();
				}
			}, 100);
		}
	});


	// Cleanup on component destroy
	onDestroy(() => {
		// Cleanup infinite scroll listeners and timeouts
		cleanupInfiniteScroll();
		
		// Scroll listeners are cleaned up by $effect return function
		// Remove class from app-shell__content
		if (appShellContent) {
			appShellContent.classList.remove('find-tasks-no-scroll');
			appShellContent.removeAttribute('data-find-tasks-page');
		} else {
			// Fallback: try to find and remove even if reference is lost
			const content = document.querySelector('.app-shell__content') as HTMLElement;
			if (content) {
				content.classList.remove('find-tasks-no-scroll');
				content.removeAttribute('data-find-tasks-page');
			}
		}
		cleanup();
	});

const onSelectTask = (task: Task) => {
	if (canBidTask(task)) {
			if (task?.npub === $user?.npub) {
				appStore.showErrorToast($t('find_tasks.cannot_bid_own_task'));
			} else {
				selectedTask = task;
				isBidOpen = true;
			}
		}
	};

function isSelectedTask(task: Task): boolean {
	return selectedTask?.id === task.id;
}

function canBidTask(task: Task): boolean {
	return task.status === TaskStatusEnum.OPEN;
}

function getTaskIdentifier(task: Task): string {
	return task.id;
}

	// Function to handle task selection for map display
	function selectTaskForMap(task: Task) {
		selectedTask = task;
	}

	// Función para hacer scroll a una card específica
	async function scrollToTaskCard(taskId: string) {
		// Wait for DOM to update, especially important when switching views
		await tick();

		// Use requestAnimationFrame to ensure the element is fully rendered
		requestAnimationFrame(() => {
			// Try multiple selectors to find the card
			let cardElement = document.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;

			// If not found by data attribute, try to find by taskCardRefs
			if (!cardElement && taskCardRefs.has(taskId)) {
				const refElement = taskCardRefs.get(taskId);
				if (refElement) {
					cardElement = refElement;
				}
			}

			// If still not found, try to find in the scrollable container
			if (!cardElement && taskListRef) {
				cardElement = taskListRef.querySelector(`[data-task-id="${taskId}"]`) as HTMLElement;
			}

			if (cardElement && taskListRef) {
				// Calculate scroll position relative to the scrollable container
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
		});
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
		// Load map component when switching to map view on mobile
		if (viewMode === 'map' && !mapLoaded) {
			loadMapComponent();
		}
	}
</script>

{#snippet TaskSkeletons(occ = 4)}
	<div class="space-y-3">
		{#each Array(occ) as _}
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
{/snippet}

<div class="mx-auto h-full min-h-0 max-w-6xl overflow-hidden p-0 find-tasks-container find-tasks-page" data-find-tasks-page="true">
	<div
		id="panel-find-tasks"
		role="tabpanel"
		aria-labelledby="tab-find-tasks"
		class="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden"
		style="max-height: 100%;"
	>
		<!-- Header row (controls) -->
		<div class="mb-4 pt-4 flex flex-col gap-3 md:flex-row md:items-center md:gap-2">
			<!-- Search Input -->
			<div class="relative flex-1 min-w-0">
				<input
					type="text"
					class="input input-bordered w-full pl-10"
					placeholder={$t('find_tasks.search_placeholder')}
					class:input-warning={searchQuery.length > 0 && searchQuery.length < 3}
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

			<!-- Buttons: separate row on mobile, same row on tablet+ -->
			<div class="flex shrink-0 items-center justify-center gap-2 md:justify-end">
				<!-- Advanced Filters Button -->
				<button
					class="btn btn-sm btn-primary"
					aria-label={$t('find_tasks.filters')}
					onclick={() => (isFilterDrawerOpen = true)}
				>
					<svg
						xmlns="http://www.w3.org/2000/svg"
						class="h-4 w-4 mr-1"
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
					<span>{$t('find_tasks.filters')}</span>
				</button>

				<!-- Save Button -->
				<button
					class="btn btn-sm btn-secondary gap-2"
					onclick={() => (isSaveSearchOpen = true)}
					title={$tasksStore.searchParamsKey === ''
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
					<span>{$t('find_tasks.save')}</span>
				</button>

				<!-- Map/List Toggle Button (Mobile/Tablet only) -->
				<button
					class="btn btn-sm btn-secondary gap-2 lg:hidden"
					onclick={toggleViewMode}
					title={viewMode === 'list' ? $t('find_tasks.view_map') : $t('find_tasks.view_list')}
				>
					{#if viewMode === 'list'}
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
								d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
							/>
						</svg>
					{:else}
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
								d="M4 6h16M4 10h16M4 14h16M4 18h16"
							/>
						</svg>
					{/if}
					<span>
						{#if viewMode === 'list'}
							{$t('find_tasks.map')}
						{:else}
							{$t('find_tasks.list')}
						{/if}
					</span>
				</button>
			</div>
		</div>

		<!-- Body row (must be height-constrained; only inner list scrolls) -->
		<div class="min-h-0 overflow-hidden" style="height: 100%; max-height: 100%;">
		<!-- Main Content - Dynamic Layout based on view mode -->
		{#if viewMode === 'list'}
			<!-- List View - Responsive Layout -->
			<div class="relative grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden" style="max-height: 100%;">
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
				<div class="grid min-h-0 grid-cols-1 gap-6 overflow-hidden lg:grid-cols-2" style="height: 100%; max-height: 100%;">
					<!-- Tasks List (scrolls) - 100% width on mobile/tablet -->
					<div class="min-h-0 w-full lg:w-auto" style="height: 100%; max-height: 100%;">
						<div
							class="h-full min-h-0 w-full overflow-y-auto task-list-scroll-container"
							bind:this={taskListRef}
						>
							{#if $tasksStore.loading && $tasksStore.items.length === 0}
								<!-- Skeleton Loading -->
								{@render TaskSkeletons(10)}
							{:else if $tasksStore.items && $tasksStore.items.length > 0}
								<div class="space-y-4">
									{#each $tasksStore.items as task, index}
										<div
											use:registerTaskCard={{ taskId: task.id }}
											class="card bg-base-100 cursor-pointer rounded-xl shadow-md transition-shadow hover:shadow-lg {isSelectedTask(task)
												? 'bg-base-300 border-primary border-2'
												: ''}"
											onclick={() => selectTaskForMap(task)}
											tabindex="0"
											role="button"
											aria-label={$t('find_tasks.view_task')}
											aria-pressed={isSelectedTask(task)}
											aria-current={isSelectedTask(task)}
											aria-disabled={!canBidTask(task)}
											aria-hidden={!canBidTask(task)}
											data-task-id={task.id}
										>
											<div class="card-body rounded-xl p-4 md:p-4">
												<!-- Top Row: Title + Status Badge + Price -->
												<div class="mb-3 flex flex-row items-stretch justify-between gap-2">
													<!-- Left: Title (70% width) -->
													<div class="w-[70%] pr-2 md:pr-4">
														<TranslatableTask
															{task}
															showDescription={true}
															showDescriptionToggle={false}
															descriptionClass="text-sm text-base-content/80 whitespace-pre-line line-clamp-2"
															titleClass="card-title line-clamp-2 text-lg font-semibold"
														/>
													</div>
													<!-- Right: Status Badge + Price (30% width, aligned right) -->
													<div class="flex w-[30%] shrink-0 flex-col items-end justify-between gap-4">
														{#each [task] as taskItem}
															{@const statusBadge = getStatusBadge(taskItem.status)}
															<div class="badge {statusBadge.color} badge-sm">
																{$t(`task.status.${taskItem.status.toLowerCase()}`) ||
																	statusBadge.text}
															</div>
														{/each}
														<div class="text-right text-xl font-bold mt-2">
															${formatNumberWithTwoDecimals(task.budget.amount)}

															<div class="text-base-content/60 text-sm">
																{satsFromUsd(task.budget.amount, btcPrice)}
															</div>
														</div>
													</div>
												</div>

												<!-- Second Row: Deadline + Location -->
												<div class="mb-3 flex flex-col gap-3">
													<!-- Deadline -->
													<TaskDeadlineDisplay
														deadline={task.deadline}
														dateRangeStart={task.dateRange?.start}
														dateRangeEnd={task.dateRange?.end}
													/>

													<!-- Location -->
													<TaskLocationDisplay
														dropOffLocation={task.dropOffLocation}
														pickupLocation={task.pickupLocation}
													/>
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
													<div class="grid w-full shrink-0 grid-cols-2 gap-2 md:flex md:w-auto md:items-center">
														<button
															class="btn btn-primary btn-sm w-full md:w-auto md:flex-none"
															class:btn-disabled={!canBidTask(task)}
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
															{#if task.status === TaskStatusEnum.OPEN}
																{$t('find_tasks.bid_now')}
															{:else}
																{$t('find_tasks.bidding_closed')}
															{/if}
														</button>

														<button
															class="btn btn-secondary btn-sm w-full md:w-auto md:flex-none"
															onclick={(e) => {
																e.stopPropagation();
																goto(`/tasks/${getTaskIdentifier(task)}`);
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
									{@render TaskSkeletons(3)}
								{/if}
							{:else}
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
					<div class="hidden min-h-0 lg:block" style="height: 100%;">
						{#if mapLoaded && TaskLocationMap}
							<div class="h-full min-h-0">
								<TaskLocationMap
									tasks={$tasksStore.items}
									height="100%"
									{selectedTask}
									onTaskSelected={async (event: {
										task: Task;
										locationType: 'pickup' | 'dropoff';
									}) => {
										selectedTask = event.task;
										scrollToTaskCard(event.task.id);
									}}
								/>
							</div>
						{:else}
							<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
								<span class="loading loading-spinner loading-lg"></span>
							</div>
						{/if}
					</div>
				</div>

				<!-- Mobile Floating Button - Scroll to Top (only visible on mobile) -->
				{#if showScrollToTop}
					<button
						class="scroll-to-top-button inverted-colors fixed right-4 z-50 flex items-center justify-center rounded-4xl p-3 transition-all duration-300 hover:scale-110 hover:brightness-110 active:scale-95 lg:hidden"
						style="bottom: var(--app-bottom-fab);"
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

			</div>
		{:else}
			<!-- Map View - Full Width (Mobile only) -->
			<div class="relative min-h-0 overflow-hidden lg:hidden" style="height: 100%;">
				{#if mapLoaded && TaskLocationMap}
					<div class="h-full min-h-0">
						<TaskLocationMap
							tasks={$tasksStore.items}
							height="100%"
							{selectedTask}
							onTaskSelected={async (event: {
								task: Task;
								locationType: 'pickup' | 'dropoff';
							}) => {
								selectedTask = event.task;
								viewMode = 'list';
								scrollToTaskCard(event.task.id);
							}}
						/>
					</div>
				{:else}
					<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
						<div class="text-center">
							<span class="loading loading-spinner loading-lg mb-2"></span>
							<p class="text-sm">{$t('find_tasks.loading_map')}</p>
						</div>
					</div>
				{/if}

			</div>
		{/if}
		</div>
	</div>
</div>

<!-- Lazy loaded drawer components -->
{#if drawersLoaded}
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

	{#if selectedTask}
		<Drawer
			isOpen={isBidOpen}
			title={$t('bid_form.title')}
			onClose={() => (isBidOpen = false)}
			position="right"
			isScrollable={true}
		>
			{#snippet children()}
				{#if BidForm}
					<BidForm
						task={selectedTask}
						onClose={() => (isBidOpen = false)}
						onBidSubmitted={() => {}}
						stickySubmit={false}
					/>
				{/if}
			{/snippet}
		</Drawer>
	{/if}

	{#if SaveSearchForm}
		<SaveSearchForm
			isOpen={isSaveSearchOpen}
			{searchParams}
			onClose={() => (isSaveSearchOpen = false)}
			onSaved={() => {}}
		/>
	{/if}
{/if}

<style>
	:global([name='gmp-internal-google-attribution']),
	:global([name='gmp-internal-dialog']) {
		display: none !important;
	}

	/* Prevent app-shell__content from scrolling on find-tasks page only */
	/* This page handles its own internal scrolling */
	/* Use class-based selector instead of :has() to avoid flickering */
	:global(.app-shell__content.find-tasks-no-scroll) {
		overflow-y: hidden !important;
		height: 100%;
		display: flex;
		flex-direction: column;
	}

	/* On mobile/tablet, ensure app-shell__content extends to bottom nav without gap */
	@media (max-width: 1023px) {
		:global(.app-shell__content.find-tasks-no-scroll) {
			/* Grid already handles height via 1fr, ensure no padding/margin creates gap */
			flex: 1;
			min-height: 0;
			padding-bottom: 0 !important;
			margin-bottom: 0 !important;
		}

		/* Remove justify-between from inner wrapper that creates spacing */
		:global(.app-shell__content.find-tasks-no-scroll > div.bg-base-200.overflow-x-hidden) {
			padding-bottom: 0 !important;
			margin-bottom: 0 !important;
			justify-content: flex-start !important;
		}

		/* Target the nested div with justify-between class - be very specific */
		:global(.app-shell__content.find-tasks-no-scroll[data-find-tasks-page] > div > div.flex.flex-col.justify-between),
		:global(.app-shell__content.find-tasks-no-scroll > div > div.flex.flex-col.justify-between) {
			justify-content: flex-start !important;
			padding-bottom: 0 !important;
			margin-bottom: 0 !important;
		}

	}

	/* Desktop: constrain to viewport height with padding */
	.find-tasks-container {
		max-height: 100%;
		height: 100%;
		overflow: hidden;
	}

	@media (min-width: 1024px) {
		.find-tasks-container {
			max-height: calc(100vh - 10rem);
		}
	}

	/* Ensure scroll container has proper max-height for infinite scroll */
	.task-list-scroll-container {
		max-height: 100%;
	}

	/* Mobile: constrain scroll container to viewport height minus header/controls and bottom nav */
	/* Height calculation: 100vh - bottom nav - top header/controls (12rem) */
	/* Remove any padding/margin that creates gap at bottom */
	@media (max-width: 1023px) {
		.task-list-scroll-container {
			max-height: calc(
				100vh - var(--app-dock-height, var(--app-footer-height, 64px)) - 9rem
			);
			height: calc(
				100vh - var(--app-dock-height, var(--app-footer-height, 64px)) - 9rem
			);
			width: 100%;
			padding-bottom: 0;
			margin-bottom: 0;
		}

		/* Remove bottom spacing from task cards container */
		.task-list-scroll-container .task-list-items {
			padding-bottom: 0;
			margin-bottom: 0;
		}

		/* Ensure the scroll container extends all the way to bottom nav */
		.task-list-scroll-container {
			box-sizing: border-box;
		}
	}

	/* Scroll to top button fade-in animation */
	.scroll-to-top-button {
		opacity: 0;
		transform: translateY(10px) scale(0.9);
		animation: fadeInButton 0.3s ease-out forwards;
	}

	@keyframes fadeInButton {
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.scroll-to-top-button:hover {
		opacity: 1;
		transform: scale(1.1);
		filter: brightness(1.2);
	}

	.scroll-to-top-button:active {
		transform: scale(0.95);
		opacity: 0.9;
	}
</style>
