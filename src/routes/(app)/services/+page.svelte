<script lang="ts">
	import type { SearchServicesParams, Service, QuoteRequestPayload } from '$lib/types/service.d';
	import { onMount, onDestroy, tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/environment';
	import { Capacitor } from '@capacitor/core';
	import { servicesStore } from '$lib/stores/service.store';
	import { scroll } from '$lib/stores/infiniteScroll.store';
	import { appScrollContainer } from '$lib/stores/scrollContainer.store';
	import { findServices, cleanup } from '$lib/nostr/findServices';
	import { beginServicesSearch, isServicesSearchCurrent } from '$lib/search/search-epoch';
	import SearchResultBar from '$lib/components/search/SearchResultBar.svelte';
	import { querySearchIndex, recordsFromHits } from '$lib/search/catalog';
	import { filterPublicServices } from '$lib/utils/listings/publicListings';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { user } from '$lib/stores/user.store';
	import ServiceCard from '$lib/components/service/ServiceCard.svelte';
	import ListingControls from '$lib/components/listing/ListingControls.svelte';
	import ServiceSearchFilters from '$lib/components/service/ServiceSearchFilters.svelte';
	import { authState } from '$lib/stores/auth.store';
	import { t } from 'svelte-i18n';
	import IconChevronUp from '~icons/mdi/chevron-up';
	import { goto } from '$app/navigation';
	import type TaskLocationMapComponent from '$lib/components/maps/TaskLocationMap.svelte';
	import type RequestQuoteModalComponent from '$lib/components/service/RequestQuoteModal.svelte';
	import type SaveServiceSearchFormComponent from '$lib/components/service/SaveServiceSearchForm.svelte';
	import { serviceQuoteUiStore } from '$lib/stores/service-quote-ui.store';
	import { appStore } from '$lib/stores/app.store';
	import {
		loadPersistedServiceSearchFilters,
		persistServiceSearchFilters
	} from '$lib/utils/service-search-persistence';
	import { debounceWithAbort } from '$lib/utils/helpers/common';
	import { hashSearchParams } from '$lib/utils/search.utils';
	import {
		manageSaveSearchBanner,
		dismissSaveSearchBanner,
		cancelDeferredBanner
	} from '$lib/utils/saveSearchBanner';

	// ── Constants ──────────────────────────────────────────────────────────────
	const DESKTOP_MIN_WIDTH = 1024;
	const MAP_PRELOAD_TIMEOUT_MS = 2000;
	const MAP_PRELOAD_FALLBACK_MS = 1000;
	const SCROLL_TO_TOP_THRESHOLD = 300;
	const LOADING_TIMEOUT_MS = 30000;
	const FETCH_TIMEOUT_MS = 15000;
	const BTC_PRICE_TIMEOUT_MS = 5000;
	const INITIAL_SKELETON_COUNT = 20;
	const RETRY_COOLDOWN_MS = 2000;
	const BTC_PRICE_CACHE_KEY = 'btc_price_cache';
	const BTC_PRICE_CACHE_TTL = 5 * 60 * 1000;

	// ── Helpers ────────────────────────────────────────────────────────────────
	function getInitialSearchParams(): SearchServicesParams {
		return {
			categories: [],
			skills: [],
			serviceLocationTypes: [],
			page: 1,
			limit: 20,
			search: ''
		};
	}

	function browseText(key: string, fallback: string): string {
		const translated = $t(key) as string;
		return !translated || translated === key ? fallback : translated;
	}

	function isOwnService(service: Service | null | undefined): boolean {
		return !!service?.npub && !!$user?.npub && service.npub === $user.npub;
	}

	// ── State: Search & Filters ────────────────────────────────────────────────
	let searchParams = $state<SearchServicesParams>(getInitialSearchParams());
	let searchQuery = $state('');
	const visibleServices = $derived(
		filterPublicServices($servicesStore.items, searchParams.search || searchQuery)
	);
	let isFilterDrawerOpen = $state(false);
	let isSaveSearchOpen = $state(false);
	let isApplyingFilters = $state(false);
	let searchVersion = $state(0);
	let isSearchInputFocused = $state(false);
	let searchAbortController: AbortController | null = null;
	let pendingSaveSearchParams: SearchServicesParams | null = null;
	const isNative = Capacitor.isNativePlatform();

	let activeFilterCount = $derived.by(() => {
		let count = 0;
		if (searchParams.categories && searchParams.categories.length > 0) count++;
		if (searchParams.skills && searchParams.skills.length > 0) count++;
		if (searchParams.serviceLocationTypes && searchParams.serviceLocationTypes.length > 0) count++;
		if (searchParams.pricingType) count++;
		if (searchParams.minPrice !== undefined || searchParams.maxPrice !== undefined) count++;
		if (searchParams.deliveryTime) count++;
		if (searchParams.location) count++;
		return count;
	});

	let hasActiveParams = $derived.by(
		() =>
			!!searchParams.search ||
			(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			(searchParams.serviceLocationTypes && searchParams.serviceLocationTypes.length > 0) ||
			!!searchParams.pricingType ||
			searchParams.minPrice !== undefined ||
			searchParams.maxPrice !== undefined ||
			searchParams.deliveryTime !== undefined
	);

	const searchInputClass = $derived(
		(() => {
			let baseClass = 'input input-bordered w-full pl-10';
			if (searchQuery.trim().length > 0) {
				baseClass += ' input-success';
			}
			return baseClass;
		})()
	);

	// ── State: Loading ─────────────────────────────────────────────────────────
	type LoadingState = 'initial' | 'loading' | 'loaded' | 'timeout' | 'error';
	let loadingState = $state<LoadingState>('initial');
	let showSkeleton = $derived(loadingState === 'initial' || loadingState === 'loading');
	let dataLoaded = $derived(
		loadingState === 'loaded' || loadingState === 'error' || loadingState === 'timeout'
	);
	let loadingTimedOut = $derived(loadingState === 'timeout');
	let unmounted = $state(false);
	let retryLoading = $state(false);
	let lastRetryTime = 0;
	let loadingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

	// ── State: UI ──────────────────────────────────────────────────────────────
	let SaveServiceSearchForm: typeof SaveServiceSearchFormComponent | null = $state(null);
	let TaskLocationMap: typeof TaskLocationMapComponent | null = $state(null);
	let RequestQuoteModal: typeof RequestQuoteModalComponent | null = $state(null);
	let drawersLoaded = $state(false);
	let mapLoaded = $state(false);
	let modalLoaded = $state(false);
	let mapPreloadAttempted = $state(false);
	let windowWidth = $state(0);
	let viewMode = $state<'list' | 'map'>('list');
	let selectedServiceForMap = $state<Service | null>(null);
	let requestQuoteModalOpen = $state(false);
	let serviceForQuote = $state<Service | null>(null);
	let btcPrice = $state<number>(120000);
	let showScrollToTop = $state(false);
	let serviceListRef = $state<HTMLElement | null>(null);

	function scrollToTop(): void {
		$appScrollContainer?.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// ── Infinite scroll: configure the layout's InfiniteScroll component ───────
	// Configure immediately so the InfiniteScroll component picks up loadMore on init
	scroll.set({
		hasMore: true,
		threshold: 500,
		elementScroll: null,
		page: 0,
		horizontal: false,
		loadMore: async () => {
			if (!$servicesStore.hasMore || $servicesStore.loading) return;

			const lastItem = $servicesStore.items[$servicesStore.items.length - 1];
			const cursorTimestamp = $servicesStore.lastRelayTimestamp ?? lastItem?.createdAt;
			if (!cursorTimestamp) return;

			try {
				await findServicesWithTimeout({
					...searchParams,
					page: $servicesStore.currentPage + 1,
					until: cursorTimestamp - 1
				});
			} catch (error) {
				console.error('[FindServices] Error loading more services:', error);
			}

			// Update hasMore after fetch
			scroll.update((s) => ({ ...s, hasMore: $servicesStore.hasMore }));
		}
	});

	// Keep scroll.hasMore in sync with the store.
	// After filter/view changes, dispatch a scroll event to trigger the
	// InfiniteScroll component's fallback listener, which re-checks distance.
	function syncScrollHasMore() {
		scroll.update((s) => ({ ...s, hasMore: $servicesStore.hasMore }));

		if (browser && $servicesStore.hasMore && !$servicesStore.loading) {
			requestAnimationFrame(() => {
				const scrollEl = document.querySelector('.app-shell__content');
				if (scrollEl) {
					// Trigger the InfiniteScroll fallback's onScroll handler
					scrollEl.dispatchEvent(new Event('scroll'));
				}
			});
		}
	}

	// ── Data fetching ──────────────────────────────────────────────────────────
	async function findServicesWithTimeout(params: SearchServicesParams): Promise<void> {
		const epoch = beginServicesSearch();
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error('findServices timed out')), FETCH_TIMEOUT_MS);
		});
		await Promise.race([findServices(params), timeoutPromise]);
		if (!isServicesSearchCurrent(epoch)) return;
	}

	async function loadNostrData(): Promise<void> {
		if (loadingState === 'loaded') return;

		if (loadingTimeoutTimer) {
			clearTimeout(loadingTimeoutTimer);
			loadingTimeoutTimer = null;
		}

		loadingState = 'loading';

		loadingTimeoutTimer = setTimeout(() => {
			if (!unmounted && $servicesStore.loading) {
				loadingState = 'timeout';
			}
		}, LOADING_TIMEOUT_MS);

		try {
			cleanup();

			searchParams = {
				...searchParams,
				page: 1,
				limit: 20
			};

			servicesStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				lastRelayTimestamp: undefined,
				error: null,
				searchParamsKey: ''
			}));

			await findServicesWithTimeout(searchParams);

			if (unmounted) return;

			servicesStore.update((state) => ({
				...state,
				searchParamsKey: hashSearchParams(searchParams)
			}));
			loadingState = 'loaded';
			syncScrollHasMore();
		} catch (error) {
			if (unmounted) return;
			console.error('[FindServices] Error loading Nostr data:', error);
			loadingState = 'error';
		} finally {
			if (loadingTimeoutTimer) {
				clearTimeout(loadingTimeoutTimer);
				loadingTimeoutTimer = null;
			}
		}
	}

	async function retryLoadServices() {
		const now = Date.now();
		if (now - lastRetryTime < RETRY_COOLDOWN_MS) return;
		lastRetryTime = now;
		retryLoading = true;
		loadingState = 'loading';
		servicesStore.update((state) => ({ ...state, error: null }));
		await loadNostrData();
		retryLoading = false;
	}

	// ── Search & Filters ───────────────────────────────────────────────────────
	const debouncedSearch = debounceWithAbort(
		async (capturedSearchQuery: string, capturedSearchParams: SearchServicesParams) => {
			const currentVersion = ++searchVersion;

			// Abort any in-flight search request
			if (searchAbortController) {
				searchAbortController.abort();
			}
			searchAbortController = new AbortController();

			// Dismiss any pending deferred banner from a previous search
			cancelDeferredBanner();
			await dismissSaveSearchBanner();

			// CRITICAL: set loading state BEFORE clearing the store.
			// servicesStore.update() notifies subscribers synchronously, so if we
			// clear the store first, one render frame sees items=[] + dataLoaded=true
			// which flashes the empty state. Setting showSkeleton first prevents this.
			loadingState = 'loading';

			servicesStore.update((state) => ({
				...state,
				currentPage: 1,
				hasMore: true,
				lastRelayTimestamp: undefined,
				error: null,
				searchParamsKey: ''
			}));

			const newParams: SearchServicesParams = {
				...capturedSearchParams,
				page: 1,
				search: capturedSearchQuery.trim().length >= 1 ? capturedSearchQuery.trim() : undefined
			};
			searchParams = { ...capturedSearchParams, ...newParams };

			const activeQuery = capturedSearchQuery.trim();
			if (activeQuery.length >= 1) {
				try {
					const remote = await querySearchIndex(
						'services',
						activeQuery,
						searchAbortController.signal
					);
					if (currentVersion !== searchVersion) return;
					// An empty index is not proof the title is absent. Keep the query and
					// search the relay, instead of making Clear Filters the only way to see it.
					if (remote.available && remote.hits.length > 0) {
						const items = filterPublicServices(recordsFromHits<Service>(remote.hits), activeQuery);
						if (items.length > 0) {
							beginServicesSearch();
							servicesStore.update((state) => ({
								...state,
								items,
								loading: false,
								error: null,
								currentPage: 1,
								hasMore: false,
								searchParamsKey: hashSearchParams(searchParams)
							}));
							loadingState = 'loaded';
							return;
						}
					}
				} catch (error) {
					if (error instanceof DOMException && error.name === 'AbortError') return;
				}
			}

			try {
				await findServicesWithTimeout(searchParams);
				if (currentVersion !== searchVersion) return;
				servicesStore.update((state) => ({
					...state,
					searchParamsKey: hashSearchParams(searchParams)
				}));
				loadingState = 'loaded';
				syncScrollHasMore();

				// Show save search banner AFTER results load
				// On native mobile: suppress while keyboard is open (input focused), re-trigger on blur
				// On web: always show (no keyboard interruption)
				const shouldSuppress = isNative && isSearchInputFocused;
				if (shouldSuppress) {
					pendingSaveSearchParams = { ...searchParams };
					await dismissSaveSearchBanner();
				} else {
					pendingSaveSearchParams = null;
					await manageSaveSearchBanner(searchParams, 'services', () => (isSaveSearchOpen = true), {
						deferred: true,
						deferMs: 2500
					});
				}
			} catch (err) {
				console.error('[FindServices] Search fetch error:', err);
				loadingState = 'error';
			}
		},
		250
	);

	async function handleFilterApply(filterParams: SearchServicesParams) {
		isApplyingFilters = true;

		// Abort any in-flight search
		if (searchAbortController) {
			searchAbortController.abort();
		}
		searchAbortController = new AbortController();

		// CRITICAL: set loading state BEFORE clearing the store (same race as debouncedSearch)
		loadingState = 'loading';

		servicesStore.update((state) => ({
			...state,
			currentPage: 1,
			hasMore: true,
			lastRelayTimestamp: undefined,
			error: null,
			searchParamsKey: ''
		}));

		searchParams = {
			...getInitialSearchParams(),
			limit: searchParams.limit ?? 20,
			...filterParams,
			page: 1
		};
		searchQuery = filterParams.search || '';

		await persistServiceSearchFilters(searchParams);
		await findServicesWithTimeout(searchParams);
		isApplyingFilters = false;
		isFilterDrawerOpen = false;

		servicesStore.update((state) => ({
			...state,
			searchParamsKey: hashSearchParams(searchParams)
		}));
		loadingState = 'loaded';
		syncScrollHasMore();

		// Show banner after results load
		const shouldSuppressFilter = isNative && isSearchInputFocused;
		if (shouldSuppressFilter) {
			pendingSaveSearchParams = { ...searchParams };
		} else {
			pendingSaveSearchParams = null;
			await manageSaveSearchBanner(searchParams, 'services', () => (isSaveSearchOpen = true), {
				deferred: true,
				deferMs: 2000
			});
		}
	}

	async function clearFilters() {
		searchQuery = '';
		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };

		pendingSaveSearchParams = null;
		cancelDeferredBanner();
		await dismissSaveSearchBanner();

		// Abort any in-flight search
		if (searchAbortController) {
			searchAbortController.abort();
		}

		// CRITICAL: set loading state BEFORE clearing the store (same race as debouncedSearch)
		loadingState = 'loading';

		servicesStore.update((state) => ({
			...state,
			currentPage: 1,
			hasMore: true,
			lastRelayTimestamp: undefined,
			error: null,
			searchParamsKey: ''
		}));

		await persistServiceSearchFilters(searchParams);
		isApplyingFilters = true;
		await findServicesWithTimeout(searchParams);
		servicesStore.update((state) => ({
			...state,
			searchParamsKey: hashSearchParams(searchParams)
		}));
		loadingState = 'loaded';
		isApplyingFilters = false;
		syncScrollHasMore();
	}

	// ── BTC Price ──────────────────────────────────────────────────────────────
	async function fetchBtcPrice(): Promise<void> {
		if (browser) {
			const cached = sessionStorage.getItem(BTC_PRICE_CACHE_KEY);
			if (cached) {
				try {
					const { price, timestamp } = JSON.parse(cached);
					if (Date.now() - timestamp < BTC_PRICE_CACHE_TTL) {
						btcPrice = price;
						return;
					}
				} catch {
					// corrupted cache, ignore
				}
			}
		}
		try {
			const timeoutPromise = new Promise<never>((_, reject) => {
				setTimeout(() => reject(new Error('BTC price fetch timed out')), BTC_PRICE_TIMEOUT_MS);
			});
			btcPrice = await Promise.race([cryptoPriceService.getCurrentPrice('BTC'), timeoutPromise]);
			if (browser) {
				sessionStorage.setItem(
					BTC_PRICE_CACHE_KEY,
					JSON.stringify({ price: btcPrice, timestamp: Date.now() })
				);
			}
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	// ── Lazy loading ───────────────────────────────────────────────────────────
	async function loadMapComponent(): Promise<void> {
		if (mapLoaded) return;
		try {
			TaskLocationMap = (await import('$lib/components/maps/TaskLocationMap.svelte')).default;
			mapLoaded = true;
		} catch (error) {
			console.error('Error loading service map component:', error);
		}
	}

	async function loadRequestQuoteModal(): Promise<void> {
		if (modalLoaded) return;
		try {
			RequestQuoteModal = (await import('$lib/components/service/RequestQuoteModal.svelte'))
				.default;
			modalLoaded = true;
		} catch (error) {
			console.error('Error loading request quote modal:', error);
		}
	}

	async function loadDrawerComponents(): Promise<void> {
		if (drawersLoaded) return;
		try {
			const saveSearchModule = await import('$lib/components/service/SaveServiceSearchForm.svelte');
			SaveServiceSearchForm = saveSearchModule.default;
			drawersLoaded = true;
		} catch (error) {
			console.error('Error loading save search component:', error);
		}
	}

	function attemptMapPreload(): (() => void) | null {
		if (!browser || mapLoaded || mapPreloadAttempted) return null;
		mapPreloadAttempted = true;

		if (windowWidth >= DESKTOP_MIN_WIDTH) {
			void loadMapComponent();
			return null;
		}

		let idleCallbackId: number | undefined;
		let timeoutId: ReturnType<typeof setTimeout> | undefined;

		if (window.requestIdleCallback) {
			idleCallbackId = window.requestIdleCallback(
				() => {
					if (!mapLoaded) void loadMapComponent();
				},
				{ timeout: MAP_PRELOAD_TIMEOUT_MS }
			);
		} else {
			timeoutId = setTimeout(() => {
				if (!mapLoaded) void loadMapComponent();
			}, MAP_PRELOAD_FALLBACK_MS);
		}

		return () => {
			if (idleCallbackId && window.cancelIdleCallback) {
				window.cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId) clearTimeout(timeoutId);
		};
	}

	// ── View & Navigation ──────────────────────────────────────────────────────
	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
		if (viewMode === 'map' && !mapLoaded) {
			void loadMapComponent();
		}

		// On mobile, prevent scrolling when in map view
		if (browser) {
			const scrollEl = document.querySelector('.app-shell__content');
			if (scrollEl instanceof HTMLElement) {
				if (viewMode === 'map' && windowWidth < DESKTOP_MIN_WIDTH) {
					scrollEl.style.overflowY = 'hidden';
				} else {
					scrollEl.style.overflowY = '';
				}
			}
		}
	}

	function selectServiceForMap(service: Service) {
		selectedServiceForMap = service;
		scrollToServiceCard(service.id);
	}

	async function scrollToServiceCard(serviceId: string) {
		await tick();
		if (!serviceListRef) return;
		const cardElement = serviceListRef.querySelector<HTMLElement>(
			`[data-service-id="${serviceId}"]`
		);
		if (cardElement) {
			cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
		}
	}

	// ── Quote modal ────────────────────────────────────────────────────────────
	async function openRequestQuoteModal(service: Service) {
		if (isOwnService(service)) {
			appStore.showErrorToast(
				browseText(
					'dashboard.services.browse.self_quote_blocked',
					"You can't request a quote on your own service."
				)
			);
			return;
		}

		if (!$authState.isAuthenticated) {
			goto(`/auth/login?returnTo=${encodeURIComponent('/services')}`);
			return;
		}
		await loadRequestQuoteModal();
		await tick();
		serviceForQuote = service;
		requestQuoteModalOpen = true;
	}

	async function handleQuoteRequestConfirm(
		payload: QuoteRequestPayload
	): Promise<{ success: boolean; error?: string }> {
		if (!serviceForQuote) {
			return {
				success: false,
				error: $t('dashboard.services.browse.quote_request_unavailable')
			};
		}

		const result = await serviceQuoteUiStore.submitQuoteRequest({
			service: serviceForQuote,
			payload
		});

		if (!result.success || !result.quoteRequestId) {
			return {
				success: false,
				error: result.error || $t('dashboard.services.browse.quote_request_submit_error')
			};
		}

		appStore.showSuccessToast($t('dashboard.services.browse.quote_request_submitted'));
		await goto(
			`/hiring/service-requests?view=tasker&request=${encodeURIComponent(result.quoteRequestId)}`
		);
		serviceQuoteUiStore.setNonBlockingMessage('service_quote_protocol_pending');
		serviceForQuote = null;
		return { success: true };
	}

	function getSearchPlaceholder(): string {
		return $t('dashboard.services.browse.search_placeholder');
	}

	// ── Lifecycle ──────────────────────────────────────────────────────────────
	onMount(() => {
		if (!browser) return;

		windowWidth = window.innerWidth;
		fetchBtcPrice();

		// Scroll-to-top visibility — $appScrollContainer is set by the layout's onMount
		const scrollEl = $appScrollContainer ?? document.querySelector('.app-shell__content');
		let cleanupScroll: (() => void) | undefined;
		if (scrollEl instanceof HTMLElement) {
			const onScroll = () => {
				showScrollToTop = scrollEl.scrollTop > SCROLL_TO_TOP_THRESHOLD;
			};
			scrollEl.addEventListener('scroll', onScroll, { passive: true });
			cleanupScroll = () => scrollEl.removeEventListener('scroll', onScroll);
		}

		// Load persisted search filters before fetching data
		const initPromise = (async () => {
			const persistedFilters = await loadPersistedServiceSearchFilters();
			if (persistedFilters) {
				searchParams = {
					...getInitialSearchParams(),
					...persistedFilters,
					page: 1,
					limit: searchParams.limit ?? 20
				};
				searchQuery = searchParams.search ?? '';
			}

			const savedParamsRaw = sessionStorage.getItem('savedServiceSearchParams');
			if (savedParamsRaw) {
				try {
					const saved = JSON.parse(savedParamsRaw) as SearchServicesParams;
					sessionStorage.removeItem('savedServiceSearchParams');
					searchParams = {
						...getInitialSearchParams(),
						...saved,
						page: 1,
						limit: searchParams.limit ?? 20
					};
					searchQuery = saved.search ?? '';
				} catch (e) {
					console.warn('[FindServices] Invalid savedServiceSearchParams', e);
				}
			}
		})();

		loadingState = 'loading';

		initPromise.then(() => {
			if (unmounted) return;
			loadNostrData().then(() => {
				if (unmounted) return;
				// Measure controls height for sticky map offset
				const controlsWrapper = document.querySelector('.services-controls-wrapper');
				if (controlsWrapper) {
					const height = controlsWrapper.getBoundingClientRect().height;
					document.documentElement.style.setProperty('--listing-controls-height', `${height}px`);
				}
			});
		});

		const cleanupMapPreload = attemptMapPreload();

		// Defer loading save-search drawer
		if (window.requestIdleCallback) {
			window.requestIdleCallback(() => loadDrawerComponents(), { timeout: 1500 });
		} else {
			setTimeout(loadDrawerComponents, 500);
		}

		return () => {
			cleanupMapPreload?.();
			cleanupScroll?.();
		};
	});

	onDestroy(() => {
		if (!browser) return;
		unmounted = true;

		if (loadingTimeoutTimer) {
			clearTimeout(loadingTimeoutTimer);
			loadingTimeoutTimer = null;
		}

		debouncedSearch.abort();
		cancelDeferredBanner();
		if (searchAbortController) {
			searchAbortController.abort();
		}
		cleanup();
	});
</script>

<a href="#services-main" class="sr-only-focusable sr-only">Skip to main content</a>

<main
	id="services-main"
	class="find-services-container mx-auto h-full min-h-0 w-full max-w-6xl flex-1 px-2 py-4 md:px-0 md:py-0"
>
	<div id="panel-find-services" class="flex min-h-0 min-h-full flex-col lg:min-h-0">
		<div class="services-controls-wrapper">
			<ListingControls
				bind:searchQuery
				{searchInputClass}
				searchPlaceholder={getSearchPlaceholder()}
				onSearchInput={() => debouncedSearch(searchQuery, searchParams)}
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
						manageSaveSearchBanner(params, 'services', () => (isSaveSearchOpen = true), {
							deferred: true,
							deferMs: 1500
						});
					}
				}}
				onFilterClick={() => (isFilterDrawerOpen = true)}
				showSaveButton={false}
				{viewMode}
				onToggleViewMode={toggleViewMode}
				user={$user}
				{drawersLoaded}
				{loadDrawerComponents}
				translationNamespace="dashboard.services.browse"
				filterLabelKey="filters_button"
				{activeFilterCount}
				filterDisabled={isApplyingFilters}
			>
				<a href="/create-service" class="btn btn-primary btn-sm gap-2 whitespace-nowrap">
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
					<span>{$t('dashboard.services.browse.create_service') || 'New'}</span>
				</a>
			</ListingControls>
		</div>

		<section class="min-h-0 flex-1" data-services-content-area>
			{#if viewMode === 'list'}
				<div class="grid min-h-0 grid-cols-1 gap-6 lg:grid-cols-2" data-services-list-view>
					{#if $servicesStore.error}
						<div class="col-span-full mb-3">
							<div class="alert alert-error alert-outline mb-3">
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
										d="M10 14l2-2m0 0l2-2m-2 2l-2 2m2-2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<span>
									{$t('dashboard.services.browse.error_loading')?.replace(
										'{error}',
										$servicesStore.error
									) || `Error loading services: ${$servicesStore.error}`}
								</span>
								<button class="btn btn-sm" onclick={retryLoadServices} disabled={retryLoading}>
									{retryLoading ? 'Retrying...' : $t('dashboard.services.browse.refresh')}
								</button>
							</div>
						</div>
					{/if}

					<div
						class="services-list-column min-h-0"
						data-services-list-column
						bind:this={serviceListRef}
					>
						<div
							id="services-load-status"
							role="status"
							aria-live="polite"
							aria-atomic="true"
							class="sr-only"
						>
							{#if dataLoaded && !showSkeleton}
								Services loaded successfully.
								{#if $servicesStore.error}
									However, there was an error loading some services.
								{:else if visibleServices.length === 0 && !$servicesStore.loading}
									No services found.
								{:else if visibleServices.length > 0}
									Found {visibleServices.length} services.
								{/if}
							{/if}
						</div>

						<div role="status" aria-live="polite" aria-atomic="false" class="sr-only">
							{#if dataLoaded && !showSkeleton}
								{#if hasActiveParams}
									{$t('dashboard.services.browse.live_results_filtered', {
										values: { count: visibleServices.length }
									})}
								{:else}
									{$t('dashboard.services.browse.live_results_available', {
										values: { count: visibleServices.length }
									})}
								{/if}
							{:else if $servicesStore.loading}
								{$t('dashboard.services.browse.live_loading')}
							{/if}
						</div>

						<SearchResultBar
							query={searchParams.search || searchQuery}
							count={visibleServices.length}
							loading={$servicesStore.loading || loadingState === 'loading'}
						/>

						{#if showSkeleton}
							<div class="mb-12 grid grid-cols-1 gap-6">
								{#each Array.from({ length: INITIAL_SKELETON_COUNT }, (_, index) => index) as index (index)}
									<div class="card bg-base-100 flex h-full flex-col overflow-hidden shadow-md">
										<figure
											class="bg-base-200 relative h-[88px] w-full shrink-0 animate-pulse overflow-hidden"
										>
											<div
												class="from-primary/20 to-secondary/20 flex h-full w-full items-center justify-center bg-linear-to-br"
											>
												<svg
													xmlns="http://www.w3.org/2000/svg"
													class="text-base-content/30 h-16 w-16"
													fill="none"
													viewBox="0 0 24 24"
													stroke="currentColor"
												>
													<path
														stroke-linecap="round"
														stroke-linejoin="round"
														stroke-width="2"
														d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
													/>
												</svg>
											</div>
										</figure>
										<div class="card-body flex flex-1 animate-pulse flex-col p-4">
											<div class="mb-2 flex items-center gap-2">
												<div class="bg-base-300 h-7 w-7 shrink-0 animate-pulse rounded-full"></div>
												<div class="flex flex-1 items-center gap-1.5">
													<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
													<div class="flex shrink-0 items-center gap-0.5">
														<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
														<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
														<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
														<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
														<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
														<div class="bg-base-300 ml-0.5 h-3 w-8 animate-pulse rounded"></div>
													</div>
												</div>
											</div>
											<div class="mb-1.5 flex items-start justify-between gap-2">
												<div class="bg-base-300 h-6 w-3/4 flex-1 animate-pulse rounded"></div>
												<div class="shrink-0 text-right">
													<div class="bg-base-300 mb-1 h-5 w-16 animate-pulse rounded"></div>
													<div class="bg-base-300 h-3 w-20 animate-pulse rounded"></div>
												</div>
											</div>
											<div class="bg-base-300 mb-1 h-4 w-full animate-pulse rounded"></div>
											<div class="bg-base-300 mb-2 h-4 w-5/6 animate-pulse rounded"></div>
											<div class="mb-2 flex flex-wrap gap-1.5">
												<div class="bg-base-300 h-5 w-20 animate-pulse rounded"></div>
												<div class="bg-base-300 h-5 w-16 animate-pulse rounded"></div>
											</div>
											<div class="mt-auto flex items-center gap-1.5">
												<div class="bg-base-300 h-4 w-4 shrink-0 animate-pulse rounded"></div>
												<div class="bg-base-300 h-3 w-32 animate-pulse rounded"></div>
											</div>
										</div>
									</div>
								{/each}
							</div>
						{:else if loadingTimedOut && $servicesStore.loading}
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
									<h3 class="font-bold">
										{$t('dashboard.services.browse.loading_timeout_title')}
									</h3>
									<div class="text-xs">
										{$t('dashboard.services.browse.loading_timeout_message')}
									</div>
								</div>
								<button
									class="btn btn-sm"
									aria-label="Refresh page"
									onclick={retryLoadServices}
									disabled={retryLoading}
								>
									{retryLoading ? 'Retrying...' : $t('dashboard.services.browse.refresh')}
								</button>
							</div>
						{:else if visibleServices.length > 0}
							<div class="mb-12 grid grid-cols-1 gap-6" in:fade={{ duration: 200 }}>
								{#each visibleServices as service (service.id)}
									<div data-service-id={service.id}>
										<ServiceCard
											{service}
											{btcPrice}
											selectedService={selectedServiceForMap}
											onSelectServiceForMap={selectServiceForMap}
											isMapVisible={true}
											onRequestQuote={openRequestQuoteModal}
											canRequestQuote={service.npub !== $user?.npub}
										/>
									</div>
								{/each}
							</div>

							{#if $servicesStore.loading}
								<div class="grid grid-cols-1 gap-6">
									{#each Array.from({ length: 2 }, (_, index) => index) as index (index)}
										<div class="card bg-base-100 flex h-full flex-col overflow-hidden shadow-md">
											<figure
												class="bg-base-200 relative h-[88px] w-full shrink-0 animate-pulse overflow-hidden"
											>
												<div
													class="from-primary/20 to-secondary/20 flex h-full w-full items-center justify-center bg-linear-to-br"
												>
													<svg
														xmlns="http://www.w3.org/2000/svg"
														class="text-base-content/30 h-16 w-16"
														fill="none"
														viewBox="0 0 24 24"
														stroke="currentColor"
													>
														<path
															stroke-linecap="round"
															stroke-linejoin="round"
															stroke-width="2"
															d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
														/>
													</svg>
												</div>
											</figure>
											<div class="card-body flex flex-1 animate-pulse flex-col p-4">
												<div class="mb-2 flex items-center gap-2">
													<div
														class="bg-base-300 h-7 w-7 shrink-0 animate-pulse rounded-full"
													></div>
													<div class="flex flex-1 items-center gap-1.5">
														<div class="bg-base-300 h-4 w-24 animate-pulse rounded"></div>
														<div class="flex shrink-0 items-center gap-0.5">
															<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 animate-pulse rounded"></div>
															<div class="bg-base-300 ml-0.5 h-3 w-8 animate-pulse rounded"></div>
														</div>
													</div>
												</div>
												<div class="mb-1.5 flex items-start justify-between gap-2">
													<div class="bg-base-300 h-6 w-3/4 flex-1 animate-pulse rounded"></div>
													<div class="shrink-0 text-right">
														<div class="bg-base-300 mb-1 h-5 w-16 animate-pulse rounded"></div>
														<div class="bg-base-300 h-3 w-20 animate-pulse rounded"></div>
													</div>
												</div>
												<div class="bg-base-300 mb-1 h-4 w-full animate-pulse rounded"></div>
												<div class="bg-base-300 mb-2 h-4 w-5/6 animate-pulse rounded"></div>
												<div class="mb-2 flex flex-wrap gap-1.5">
													<div class="bg-base-300 h-5 w-20 animate-pulse rounded"></div>
													<div class="bg-base-300 h-5 w-16 animate-pulse rounded"></div>
												</div>
												<div class="mt-auto flex items-center gap-1.5">
													<div class="bg-base-300 h-4 w-4 shrink-0 animate-pulse rounded"></div>
													<div class="bg-base-300 h-3 w-32 animate-pulse rounded"></div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{/if}

							{#if !$servicesStore.hasMore && visibleServices.length > 0}
								<div class="mt-4 mb-12 text-center">
									<p class="text-base-content/60 mb-4 text-sm">
										{$t('dashboard.services.browse.no_more_services')}
									</p>
									<a href="/create-service" class="btn btn-primary gap-2">
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
												d="M12 4v16m8-8H4"
											/>
										</svg>
										{$t('dashboard.services.browse.list_your_service') || 'List Your Service'}
									</a>
								</div>
							{/if}
						{:else if dataLoaded && visibleServices.length === 0 && !$servicesStore.loading}
							<div class="flex flex-col items-center justify-center py-12">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									class="text-base-content/40 mb-4 h-16 w-16"
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
								<h3 class="mb-2 text-lg font-semibold">
									{$t('dashboard.services.browse.no_services_found')}
								</h3>
								<p class="text-base-content/60 text-center text-sm">
									{#if searchQuery.trim()}
										No services match “{searchQuery.trim()}”. Search titles, descriptions,
										categories, skills, and tags.
									{:else}
										{$t('dashboard.services.browse.no_services_message')}
									{/if}
								</p>
								{#if hasActiveParams}
									<button class="btn btn-primary btn-sm mt-4" onclick={clearFilters}>
										{$t('dashboard.services.browse.clear_filters')}
									</button>
								{/if}
							</div>
						{/if}
					</div>

					<aside
						class="map-container-wrapper hidden min-h-0 overflow-hidden lg:block"
						data-services-map-column
						aria-label={$t('dashboard.services.browse.map')}
					>
						{#if mapLoaded && TaskLocationMap}
							<TaskLocationMap
								services={visibleServices}
								height="100%"
								selectedService={selectedServiceForMap}
								onServiceSelected={(event: { service: Service }) => {
									selectedServiceForMap = event.service;
									scrollToServiceCard(event.service.id);
								}}
								{btcPrice}
							/>
						{:else}
							<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
								<span class="loading loading-spinner loading-lg"></span>
							</div>
						{/if}
					</aside>
				</div>

				{#if showScrollToTop}
					<button
						class="scroll-to-top-button inverted-colors fixed right-4 z-50 flex min-h-11 min-w-11 translate-y-[10px] scale-90 items-center justify-center rounded-4xl p-3 opacity-0 transition-all transition-transform duration-200 duration-300 hover:scale-110 hover:opacity-100 hover:brightness-110 active:scale-95 active:opacity-90 lg:hidden"
						style="bottom: var(--app-bottom-fab);"
						onclick={scrollToTop}
						title={$t('dashboard.services.browse.scroll_to_top')}
						aria-label={$t('dashboard.services.browse.scroll_to_top')}
					>
						<IconChevronUp class="h-5 w-5" />
					</button>
				{/if}
			{:else}
				<section class="map-container-wrapper map-fullscreen relative min-h-0 w-full lg:hidden">
					{#if mapLoaded && TaskLocationMap}
						<TaskLocationMap
							services={visibleServices}
							height="100%"
							selectedService={selectedServiceForMap}
							onServiceSelected={(event: { service: Service }) => {
								selectedServiceForMap = event.service;
								if (viewMode === 'list') {
									scrollToServiceCard(event.service.id);
								}
							}}
							{btcPrice}
						/>
					{:else}
						<div class="bg-base-200 flex h-full w-full items-center justify-center rounded-lg">
							<span class="loading loading-spinner loading-lg"></span>
						</div>
					{/if}
				</section>
			{/if}
		</section>
	</div>
</main>

{#if modalLoaded && RequestQuoteModal}
	<RequestQuoteModal
		bind:open={requestQuoteModalOpen}
		service={serviceForQuote}
		onConfirm={handleQuoteRequestConfirm}
		onClose={() => {
			requestQuoteModalOpen = false;
			serviceForQuote = null;
		}}
	/>
{/if}

<ServiceSearchFilters
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
	initialFilters={searchParams}
/>

{#if drawersLoaded && SaveServiceSearchForm}
	<SaveServiceSearchForm
		isOpen={isSaveSearchOpen}
		{searchParams}
		onClose={() => (isSaveSearchOpen = false)}
		onSaved={() => {}}
	/>
{/if}

<style>
	.find-services-container {
		--listing-controls-height: 60px;
	}

	.services-controls-wrapper {
		position: sticky;
		top: 0;
		z-index: 10;
		padding-top: 0.5rem;
		background-color: var(--color-base-200, oklch(var(--b2)));
	}

	[data-services-content-area] {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	[data-services-list-view] {
		display: grid;
		min-height: 0;
		flex: 1;
	}

	[data-services-list-column] {
		min-height: 0;
		min-width: 0;
	}

	.services-list-column {
		scrollbar-gutter: stable;
	}

	[data-services-map-column] {
		min-height: 0;
		min-width: 0;
	}

	.map-container-wrapper {
		height: 100%;
		overflow: hidden;
	}

	.map-container-wrapper :global(.task-location-map) {
		height: 100% !important;
		min-height: 0;
		overflow: hidden;
	}

	@media (max-width: 1023px) {
		.services-list-column {
			overflow-y: visible;
			height: auto;
		}

		.map-fullscreen {
			flex: 1 1 0%;
			height: 0;
			max-height: none;
		}
	}

	@media (min-width: 1024px) {
		[data-services-list-view] {
			height: auto;
		}

		[data-services-list-column] {
			max-height: none;
		}

		[data-services-map-column] {
			position: sticky;
			top: var(--listing-controls-height);
			height: calc(90dvh - var(--listing-controls-height));
			max-height: calc(90dvh - var(--listing-controls-height));
			align-self: flex-start;
		}

		.services-list-column {
			overflow-y: visible;
			height: auto;
			max-height: none;
		}
	}

	.scroll-to-top-button {
		animation: fadeInScrollButton 0.3s ease-out forwards;
	}

	@keyframes fadeInScrollButton {
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}
</style>
