<script lang="ts">
	import type { SearchServicesParams, Service } from '$lib/types/service.d';
	import { onMount, onDestroy, tick } from 'svelte';
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { servicesStore } from '$lib/stores/service.store';
	import { findServices, cleanup } from '$lib/nostr/findServices';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import { user } from '$lib/stores/user.store';
	import type { QuoteRequestPayload } from '$lib/types/service.d';
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
	import { DEFAULT_API_HOST } from '$lib/api/apiService';

	const DESKTOP_MIN_WIDTH = 1024;
	const MAP_PRELOAD_TIMEOUT_MS = 2000;
	const MAP_PRELOAD_FALLBACK_MS = 1000;

	// Function to create initial search parameters
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

	// Reactive state for search parameters and UI controls
	let searchParams = $state<SearchServicesParams>(getInitialSearchParams());
	let searchQuery = $state('');

	// Enhanced discovery features
	let isFilterDrawerOpen = $state(false);

	// Save search state (same pattern as Find Tasks)
	let isSaveSearchOpen = $state(false);
	let SaveServiceSearchForm: typeof SaveServiceSearchFormComponent | null = $state(null);
	let TaskLocationMap: typeof TaskLocationMapComponent | null = $state(null);
	let RequestQuoteModal: typeof RequestQuoteModalComponent | null = $state(null);
	let drawersLoaded = $state(false);
	let mapLoaded = $state(false);
	let modalLoaded = $state(false);
	let mapPreloadAttempted = $state(false);
	let windowWidth = $state(0);

	// Loading states
	let loadingTimeout = $state(false);
	let dataLoaded = $state(false);
	let showSkeleton = $state(true);

	// Lazy loading state
	let serviceListRef = $state<HTMLElement | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let loadingTimeoutTimer: ReturnType<typeof setTimeout> | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	// Infinite scroll state
	let scrollHandler: ((e: Event) => void) | null = null;
	let isLoadingMore = $state(false);
	let showScrollToTop = $state(false);

	// App shell reference for scroll prevention (same as Find Tasks)
	let appShellContent: HTMLElement | null = $state.raw(null);
	let lastScrollTop = $state(0);
	let lastLoadScrollTop = $state(0);

	// Has active search parameters
	let hasActiveParams = $state(false);
	let activeFilterCount = $state(0);
	$effect(() => {
		let count = 0;
		if (searchParams.categories && searchParams.categories.length > 0) count++;
		if (searchParams.skills && searchParams.skills.length > 0) count++;
		if (searchParams.serviceLocationTypes && searchParams.serviceLocationTypes.length > 0) count++;
		if (searchParams.pricingType) count++;
		if (searchParams.minPrice !== undefined || searchParams.maxPrice !== undefined) count++;
		if (searchParams.deliveryTime) count++;
		if (searchParams.location) count++;
		activeFilterCount = count;

		hasActiveParams =
			!!searchParams.search ||
			(searchParams.categories && searchParams.categories.length > 0) ||
			(searchParams.skills && searchParams.skills.length > 0) ||
			(searchParams.serviceLocationTypes && searchParams.serviceLocationTypes.length > 0) ||
			!!searchParams.pricingType ||
			searchParams.minPrice !== undefined ||
			searchParams.maxPrice !== undefined ||
			searchParams.deliveryTime !== undefined;
	});

	// BTC price for USDT conversion
	let btcPrice = $state<number>(120000); // Default fallback price

	// View mode state
	let viewMode = $state<'list' | 'map'>('list');

	// Selected service for map display
	let selectedServiceForMap = $state<Service | null>(null);

	// Request quote modal
	let requestQuoteModalOpen = $state(false);
	let serviceForQuote = $state<Service | null>(null);

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
					if (!mapLoaded) {
						void loadMapComponent();
					}
				},
				{ timeout: MAP_PRELOAD_TIMEOUT_MS }
			);
		} else {
			timeoutId = setTimeout(() => {
				if (!mapLoaded) {
					void loadMapComponent();
				}
			}, MAP_PRELOAD_FALLBACK_MS);
		}

		return () => {
			if (idleCallbackId && window.cancelIdleCallback) {
				window.cancelIdleCallback(idleCallbackId);
			}
			if (timeoutId) {
				clearTimeout(timeoutId);
			}
		};
	}

	function browseText(key: string, fallback: string): string {
		const translated = $t(key) as string;
		return !translated || translated === key ? fallback : translated;
	}

	function isOwnService(service: Service | null | undefined): boolean {
		return !!service?.npub && !!$user?.npub && service.npub === $user.npub;
	}

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

	async function handleQuoteRequestConfirm(payload: QuoteRequestPayload) {
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
			`/dashboard?tab=quotes&view=tasker&request=${encodeURIComponent(result.quoteRequestId)}`
		);
		serviceQuoteUiStore.setNonBlockingMessage('service_quote_protocol_pending');
		serviceForQuote = null;
		return { success: true };
	}

	function toggleViewMode() {
		viewMode = viewMode === 'list' ? 'map' : 'list';
	}

	$effect(() => {
		if (viewMode === 'map' && !mapLoaded) {
			void loadMapComponent();
		}
	});

	function selectServiceForMap(service: Service) {
		selectedServiceForMap = service;
		// On mobile, switch to map view so user sees the map (same as tasks)
		if (typeof window !== 'undefined' && window.innerWidth < 1024 && viewMode === 'list') {
			viewMode = 'map';
		} else {
			scrollToServiceCard(service.id);
		}
	}

	async function scrollToServiceCard(serviceId: string) {
		// Wait for DOM updates, especially important when switching views
		await tick();

		if (!serviceListRef) return;

		const cardElement = serviceListRef.querySelector<HTMLElement>(
			`[data-service-id="${serviceId}"]`
		);

		if (cardElement) {
			cardElement.scrollIntoView({
				behavior: 'smooth',
				block: 'center'
			});
		}
	}

	/**
	 * Hash search params for canSaveSearch (same idea as Find Tasks)
	 */
	function hashSearchParams(params: SearchServicesParams): string {
		const parts: string[] = [];
		if (params.search) parts.push(`s:${params.search}`);
		if (params.page) parts.push(`p:${params.page}`);
		if (params.limit) parts.push(`l:${params.limit}`);
		if (params.categories?.length) {
			parts.push(`c:${[...params.categories].sort().join(',')}`);
		}
		if (params.skills?.length) {
			parts.push(`sk:${[...params.skills].sort().join(',')}`);
		}
		if (params.serviceLocationTypes?.length) {
			parts.push(`loc:${[...params.serviceLocationTypes].sort().join(',')}`);
		}
		if (params.pricingType) parts.push(`pt:${params.pricingType}`);
		if (params.minPrice !== undefined) parts.push(`min:${params.minPrice}`);
		if (params.maxPrice !== undefined) parts.push(`max:${params.maxPrice}`);
		if (params.deliveryTime !== undefined) parts.push(`dt:${params.deliveryTime}`);
		if (params.location) parts.push(`locn:${params.location}`);
		if (params.locationCoords) {
			parts.push(`locc:${params.locationCoords.latitude},${params.locationCoords.longitude}`);
		}
		return parts.join('|');
	}

	/**
	 * Load drawer components (Save Search form) when needed - same pattern as Find Tasks
	 */
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

	/**
	 * Fetch current BTC price
	 */
	async function fetchBtcPrice(): Promise<void> {
		try {
			btcPrice = await cryptoPriceService.getCurrentPrice('BTC');
		} catch (error) {
			console.error('Error fetching BTC price:', error);
		}
	}

	/**
	 * Load Nostr data with proper state management
	 */
	async function loadNostrData(): Promise<void> {
		if (dataLoaded) return;

		if (loadingTimeoutTimer) {
			clearTimeout(loadingTimeoutTimer);
			loadingTimeoutTimer = null;
		}
		loadingTimeout = false;

		loadingTimeoutTimer = setTimeout(() => {
			if (get(servicesStore).loading && !dataLoaded) {
				loadingTimeout = true;
				console.error('[FindServices] Query timeout - fetching took too long');
			}
		}, 10000);

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
				error: null,
				searchParamsKey: ''
			}));

			await findServices(searchParams);
			servicesStore.update((state) => ({
				...state,
				searchParamsKey: hashSearchParams(searchParams)
			}));
			dataLoaded = true;
			showSkeleton = false;

			if (serviceListRef) {
				setupInfiniteScroll();
			}

			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
		} catch (error) {
			console.error('[FindServices] Error loading Nostr data:', error);
		} finally {
			if (loadingTimeoutTimer) {
				clearTimeout(loadingTimeoutTimer);
				loadingTimeoutTimer = null;
			}
			loadingTimeout = false;
		}
	}

	// Debounce function
	function debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, delay: number) {
		let timeoutId: ReturnType<typeof setTimeout>;
		return function (...args: TArgs) {
			clearTimeout(timeoutId);
			timeoutId = setTimeout(() => fn.apply(null, args), delay);
		};
	}

	// Debounced function to update searchParams
	const debouncedSearch = debounce(async () => {
		if (searchQuery.trim().length < 3) {
			servicesStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null,
				searchParamsKey: ''
			}));

			const newParams: SearchServicesParams = {
				...searchParams,
				page: 1,
				search: undefined
			};
			searchParams = { ...searchParams, ...newParams };

			try {
				await findServices(searchParams);
				servicesStore.update((state) => ({
					...state,
					searchParamsKey: hashSearchParams(searchParams)
				}));
			} catch (err) {
				console.error('[FindServices] Search fetch error:', err);
			}
			return;
		}

		const newParams: SearchServicesParams = {
			...searchParams,
			page: 1,
			search: searchQuery.trim()
		};

		searchParams = { ...searchParams, ...newParams };

		servicesStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));

		try {
			await findServices(searchParams);
			servicesStore.update((state) => ({
				...state,
				searchParamsKey: hashSearchParams(searchParams)
			}));
		} catch (err) {
			console.error('[FindServices] Search fetch error:', err);
		}
	}, 1000);

	// Handle filter apply
	function handleFilterApply(filterParams: SearchServicesParams) {
		isFilterDrawerOpen = false;
		servicesStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
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

		// Persist filters to localStorage
		persistServiceSearchFilters(searchParams);

		findServices(searchParams).then(() => {
			servicesStore.update((state) => ({
				...state,
				searchParamsKey: hashSearchParams(searchParams)
			}));
		});
	}

	// Clear filters
	function clearFilters() {
		searchQuery = '';
		const currentLimit = searchParams.limit;
		searchParams = { ...getInitialSearchParams(), limit: currentLimit };

		servicesStore.update((state) => ({
			...state,
			items: [],
			currentPage: 1,
			hasMore: true,
			error: null,
			searchParamsKey: ''
		}));

		// Clear persisted filters
		persistServiceSearchFilters(searchParams);

		findServices(searchParams);
	}

	// Load more services
	async function loadMoreServices() {
		if (!$servicesStore.hasMore || $servicesStore.loading || isLoadingMore) {
			return;
		}

		try {
			isLoadingMore = true;

			const nextPage = $servicesStore.currentPage + 1;
			const newParams: SearchServicesParams = {
				...searchParams,
				page: nextPage
			};

			await findServices(newParams);
		} catch (error) {
			console.error('[FindServices] Error loading more services:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	/**
	 * Scroll to top of service list
	 */
	function scrollToTop() {
		if (serviceListRef) {
			serviceListRef.scrollTo({
				top: 0,
				behavior: 'smooth'
			});
		}
	}

	/**
	 * Setup infinite scroll with scroll listener (includes scroll-to-top button visibility)
	 */
	function setupInfiniteScroll(): void {
		if (!browser || !serviceListRef) return;

		const SCROLL_TO_TOP_THRESHOLD = 300;

		scrollHandler = (() => {
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;

			return (e: Event) => {
				const target = e.target as HTMLElement;
				if (!target) return;

				// Show/hide scroll to top button (immediate, no debounce)
				showScrollToTop = target.scrollTop > SCROLL_TO_TOP_THRESHOLD;

				if (debounceTimer) clearTimeout(debounceTimer);

				debounceTimer = setTimeout(() => {
					const { scrollTop, scrollHeight, clientHeight } = target;

					if (scrollTop <= lastScrollTop) {
						lastScrollTop = scrollTop;
						return;
					}

					lastScrollTop = scrollTop;

					if (scrollHeight <= clientHeight) {
						return;
					}

					const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;
					const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

					if (
						scrollPercentage > 0.7 &&
						scrollTop - lastLoadScrollTop > 200 &&
						distanceFromBottom < 500
					) {
						lastLoadScrollTop = scrollTop;
						loadMoreServices();
					}
				}, 200);
			};
		})();

		serviceListRef.addEventListener('scroll', scrollHandler, { passive: true });
	}

	function logServicesApiConfiguration(): void {
		if (!browser) return;

		const viteApiUrl = import.meta.env.VITE_API_URL || null;
		const viteNostrRelayNestjs = import.meta.env.VITE_NOSTR_RELAY_NESTJS || null;
		const resolvedApiBase = viteApiUrl || DEFAULT_API_HOST;
		const resolvedEventsBase = viteNostrRelayNestjs || resolvedApiBase;
		const eventsGetUrl = new URL('/api/v1/events', resolvedEventsBase).toString();

		console.log('[ServicesPage] API configuration', {
			pathname: window.location.pathname,
			origin: window.location.origin,
			viteApiUrl,
			viteNostrRelayNestjs,
			resolvedApiBase,
			resolvedEventsBase,
			eventsGetUrl
		});
	}

	// Initial data fetch and setup - apply saved service search from dashboard if present (same pattern as Find Tasks)
	onMount(() => {
		if (browser) {
			logServicesApiConfiguration();
			windowWidth = window.innerWidth;
			const persistedFilters = loadPersistedServiceSearchFilters();
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

			// Prevent app-shell scroll on mobile (same as Find Tasks - scroll happens inside list)
			let retryCount = 0;
			const addDataAttr = () => {
				const content = document.querySelector('.app-shell__content');
				if (content instanceof HTMLElement && !content.hasAttribute('data-find-services-page')) {
					appShellContent = content;
					content.setAttribute('data-find-services-page', 'true');
				} else if (!content && retryCount < 10) {
					retryCount++;
					requestAnimationFrame(addDataAttr);
				}
			};
			requestAnimationFrame(addDataAttr);

			fetchBtcPrice();
			dataLoaded = false;
			showSkeleton = true;
			loadNostrData().then(() => {
				if (serviceListRef) {
					setupInfiniteScroll();
				}
			});

			const cleanupMapPreload = attemptMapPreload();

			// Defer loading save-search drawer (same as Find Tasks)
			if (window.requestIdleCallback) {
				window.requestIdleCallback(() => loadDrawerComponents(), { timeout: 1500 });
			} else {
				setTimeout(loadDrawerComponents, 500);
			}

			return () => {
				cleanupMapPreload?.();
			};
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			// Remove data attribute from app-shell__content
			if (appShellContent) {
				appShellContent.removeAttribute('data-find-services-page');
			} else {
				const content = document.querySelector('.app-shell__content');
				if (content instanceof HTMLElement) {
					content.removeAttribute('data-find-services-page');
				}
			}

			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
			if (loadingTimeoutTimer) {
				clearTimeout(loadingTimeoutTimer);
				loadingTimeoutTimer = null;
			}

			if (scrollHandler && serviceListRef) {
				serviceListRef.removeEventListener('scroll', scrollHandler);
				scrollHandler = null;
			}

			cleanup();
		}
	});

	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return $t('dashboard.services.browse.search_minimum_chars');
		}
		return $t('dashboard.services.browse.search_placeholder');
	}

	function getSearchInputClass(): string {
		let baseClass = 'input input-bordered w-full pl-10';
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			baseClass += ' input-warning';
		} else if (searchQuery.length >= 3) {
			baseClass += ' input-success';
		}
		return baseClass;
	}
</script>

<!-- Same layout and structure as Find Tasks -->
<main
	class="find-services-container mx-auto h-full min-h-0 w-full max-w-6xl flex-1 px-2 py-6 md:px-0 md:py-0"
	data-find-services-page="true"
>
	<div
		id="panel-find-services"
		role="tabpanel"
		class="grid h-full min-h-0 grid-rows-[auto_1fr] overflow-hidden"
	>
		<!-- Same controls as Find Tasks: shared listing controls with services translation namespace -->
		<ListingControls
			bind:searchQuery
			searchInputClass={getSearchInputClass()}
			searchPlaceholder={getSearchPlaceholder()}
			onSearchInput={() => debouncedSearch()}
			onFilterClick={() => (isFilterDrawerOpen = true)}
			onSaveSearch={async () => {
				if (!drawersLoaded) await loadDrawerComponents();
				await tick();
				isSaveSearchOpen = true;
			}}
			canSaveSearch={$servicesStore.searchParamsKey !== ''}
			{viewMode}
			onToggleViewMode={toggleViewMode}
			user={$user}
			{drawersLoaded}
			{loadDrawerComponents}
			translationNamespace="dashboard.services.browse"
			filterLabelKey="filters_button"
			{activeFilterCount}
		/>

		<!-- Main Content Area - same structure as Find Tasks -->
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
							</div>
						</div>
					{/if}

					<!-- Services List Column (same as tasks list column) -->
					<div class="min-h-0" data-services-list-column>
						<!-- Accessibility: Announce search results updates -->
						<div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
							{#if dataLoaded && !showSkeleton}
								{#if hasActiveParams}
									{$t('dashboard.services.browse.live_results_filtered', {
										values: { count: $servicesStore.items?.length || 0 }
									})}
								{:else}
									{$t('dashboard.services.browse.live_results_available', {
										values: { count: $servicesStore.items?.length || 0 }
									})}
								{/if}
							{:else if $servicesStore.loading}
								{$t('dashboard.services.browse.live_loading')}
							{/if}
						</div>

						<div
							class="task-list-scroll-container box-border h-full max-h-[65vh] w-full overflow-y-auto lg:max-h-none"
							bind:this={serviceListRef}
						>
							<!-- Skeleton Loading -->
							{#if showSkeleton && !dataLoaded}
								<div class="mb-12 grid grid-cols-1 gap-4">
									{#each Array.from({ length: 4 }, (_, index) => index) as index (index)}
										<div class="card bg-base-100 flex h-full flex-col overflow-hidden shadow-md">
											<!-- Image placeholder - same as ServiceCard (gradient + icon), with pulse -->
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
											<!-- Card Body - same as ServiceCard -->
											<div class="card-body flex flex-1 animate-pulse flex-col p-4">
												<!-- Provider Info Skeleton -->
												<div class="mb-2 flex items-center gap-2">
													<div class="bg-base-300 h-7 w-7 shrink-0 rounded-full"></div>
													<div class="flex flex-1 items-center gap-1.5">
														<div class="bg-base-300 h-4 w-24 rounded"></div>
														<div class="flex shrink-0 items-center gap-0.5">
															<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
															<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
															<div class="bg-base-300 ml-0.5 h-3 w-8 rounded"></div>
														</div>
													</div>
												</div>
												<!-- Title and Price Skeleton -->
												<div class="mb-1.5 flex items-start justify-between gap-2">
													<div class="bg-base-300 h-6 w-3/4 flex-1 rounded"></div>
													<div class="shrink-0 text-right">
														<div class="bg-base-300 mb-1 h-5 w-16 rounded"></div>
														<div class="bg-base-300 h-3 w-20 rounded"></div>
													</div>
												</div>
												<!-- Description Skeleton -->
												<div class="bg-base-300 mb-1 h-4 w-full rounded"></div>
												<div class="bg-base-300 mb-2 h-4 w-5/6 rounded"></div>
												<!-- Tags Skeleton -->
												<div class="mb-2 flex flex-wrap gap-1.5">
													<div class="bg-base-300 h-5 w-20 rounded"></div>
													<div class="bg-base-300 h-5 w-16 rounded"></div>
												</div>
												<!-- Location Skeleton -->
												<div class="mt-auto flex items-center gap-1.5">
													<div class="bg-base-300 h-4 w-4 shrink-0 rounded"></div>
													<div class="bg-base-300 h-3 w-32 rounded"></div>
												</div>
											</div>
										</div>
									{/each}
								</div>
							{:else if loadingTimeout}
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
									<button class="btn btn-sm" onclick={() => window.location.reload()}>
										{$t('dashboard.services.browse.refresh')}
									</button>
								</div>
							{:else if $servicesStore.items && $servicesStore.items.length > 0}
								<div class="mb-12 grid grid-cols-1 gap-4">
									{#each $servicesStore.items as service (service.id)}
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

								<!-- Loading More Indicator -->
								{#if isLoadingMore || $servicesStore.loading}
									<div class="mt-4 flex justify-center">
										<span class="loading loading-spinner loading-md"></span>
									</div>
								{/if}

								<!-- End of Results -->
								{#if !$servicesStore.hasMore && $servicesStore.items.length > 0}
									<div class="text-base-content/60 mt-4 mb-12 text-center text-sm">
										{$t('dashboard.services.browse.no_more_services')}
									</div>
								{/if}
							{:else if dataLoaded && $servicesStore.items.length === 0}
								<!-- Empty State -->
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
										{$t('dashboard.services.browse.no_services_message')}
									</p>
									{#if hasActiveParams}
										<button class="btn btn-primary btn-sm mt-4" onclick={clearFilters}>
											{$t('dashboard.services.browse.clear_filters')}
										</button>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Desktop Map Sidebar - same as Find Tasks (map-container-wrapper, hidden on mobile) -->
					<aside
						class="map-container-wrapper hidden min-h-0 overflow-hidden lg:block"
						data-services-map-column
						aria-label={$t('dashboard.services.browse.map')}
					>
						{#if mapLoaded && TaskLocationMap}
							<TaskLocationMap
								services={$servicesStore.items}
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

				<!-- Mobile Floating Button - Scroll to Top (same as Find Tasks) -->
				{#if showScrollToTop}
					<button
						class="scroll-to-top-button inverted-colors fixed right-4 z-50 flex translate-y-[10px] scale-90 items-center justify-center rounded-4xl p-3 opacity-0 transition-all duration-300 hover:scale-110 hover:opacity-100 hover:brightness-110 active:scale-95 active:opacity-90 lg:hidden"
						style="bottom: var(--app-bottom-fab);"
						onclick={scrollToTop}
						title={$t('dashboard.services.browse.scroll_to_top')}
						aria-label={$t('dashboard.services.browse.scroll_to_top')}
					>
						<IconChevronUp class="h-5 w-5" />
					</button>
				{/if}
			{:else}
				<!-- Map View - Full width on mobile/tablet, same as Find Tasks -->
				<section class="map-container-wrapper relative min-h-0 w-full lg:hidden">
					{#if mapLoaded && TaskLocationMap}
						<TaskLocationMap
							services={$servicesStore.items}
							height="100%"
							selectedService={selectedServiceForMap}
							onServiceSelected={(event: { service: Service }) => {
								selectedServiceForMap = event.service;
								// Keep map view and show popup on pin click (same as tasks) — do not switch to list
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
	<!-- Request Quote Modal -->
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

<!-- Filter Drawer -->
<ServiceSearchFilters
	isOpen={isFilterDrawerOpen}
	onClose={() => (isFilterDrawerOpen = false)}
	onApply={handleFilterApply}
	initialFilters={searchParams}
/>

<!-- Save Search Form (same pattern as Find Tasks) -->
{#if drawersLoaded && SaveServiceSearchForm}
	<SaveServiceSearchForm
		isOpen={isSaveSearchOpen}
		{searchParams}
		onClose={() => (isSaveSearchOpen = false)}
		onSaved={() => {}}
	/>
{/if}

<style>
	/* Prevent app-shell__content from scrolling on mobile (same as Find Tasks) */
	/* This page handles its own internal scrolling inside the list */
	:global(.app-shell__content[data-find-services-page]) {
		display: flex;
		flex-direction: column;
		flex: 1;
		min-height: 0;
	}

	@media (min-width: 1024px) {
		:global(.app-shell__content[data-find-services-page]) {
			overflow-y: auto;
			height: auto;
			min-height: 100%;
		}
	}

	/* Same map container styles as Find Tasks - prevent overflow */
	.find-services-container {
		--services-content-height: calc(
			100vh - var(--app-dock-height, var(--app-footer-height, 64px)) -
				var(--header-controls-height, 10rem)
		);
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

	[data-services-list-column],
	[data-services-map-column] {
		height: 100%;
		min-height: 0;
		min-width: 0;
	}

	.map-container-wrapper {
		height: 100%;
		max-height: 100%;
		overflow: hidden;
	}

	.map-container-wrapper :global(.task-location-map) {
		height: 100% !important;
		min-height: 0;
		overflow: hidden;
	}

	@media (max-width: 1023px) {
		.task-list-scroll-container {
			max-height: var(--services-content-height);
		}

		.map-container-wrapper {
			max-height: var(--services-content-height);
			height: var(--services-content-height);
		}
	}

	@media (min-width: 1024px) {
		[data-services-list-view] {
			height: 100%;
			max-height: 65vh;
		}

		[data-services-list-column],
		[data-services-map-column] {
			max-height: 100%;
		}

		.task-list-scroll-container {
			height: 100%;
			max-height: 100%;
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
