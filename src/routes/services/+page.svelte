<script lang="ts">
	import type { SearchServicesParams } from '$lib/types/service.d';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { servicesStore } from '$lib/stores/service.store';
	import { findServices, cleanup } from '$lib/nostr/findServices';
	import cryptoPriceService from '$lib/api/services/crypto-price.service';
	import ServiceCard from '$lib/components/service/ServiceCard.svelte';
	import ServiceSearchFilters from '$lib/components/service/ServiceSearchFilters.svelte';
	import { t } from 'svelte-i18n';

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

	// Loading states
	let loadingTimeout = $state(false);
	let isInitialLoad = $state(true);
	let dataLoaded = $state(false);
	let showSkeleton = $state(true);

	// Lazy loading state
	let serviceListRef = $state<HTMLElement | null>(null);
	let fallbackTimer: ReturnType<typeof setTimeout> | null = null;
	let intersectionObserver: IntersectionObserver | null = null;

	// Infinite scroll state
	let scrollHandler: ((e: Event) => void) | null = null;
	let isLoadingMore = $state(false);
	let lastScrollTop = $state(0);
	let lastLoadScrollTop = $state(0);

	// Has active search parameters
	let hasActiveParams = $state(false);
	$effect(() => {
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
				error: null
			}));

			await findServices(searchParams);
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
		}
	}

	/**
	 * Setup lazy loading with intersection observer and fallback
	 */
	function setupLazyLoading(): void {
		if (!browser || dataLoaded) return;

		intersectionObserver = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !dataLoaded) {
					loadNostrData();
				}
			},
			{
				threshold: 0.1,
				rootMargin: '200px'
			}
		);

		if (serviceListRef) {
			intersectionObserver.observe(serviceListRef);
		}

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
		if (searchQuery.trim().length < 3) {
			servicesStore.update((state) => ({
				...state,
				items: [],
				currentPage: 1,
				hasMore: true,
				error: null
			}));

			const newParams: SearchServicesParams = {
				...searchParams,
				page: 1,
				search: undefined
			};
			searchParams = { ...searchParams, ...newParams };

			try {
				await findServices(searchParams);
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
			error: null
		}));

		try {
			await findServices(searchParams);
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
			error: null
		}));

		searchParams = {
			...searchParams,
			...filterParams,
			page: 1
		};

		searchQuery = filterParams.search || '';

		findServices(searchParams);
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
			error: null
		}));

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
	 * Setup infinite scroll with scroll listener
	 */
	function setupInfiniteScroll(): void {
		if (!browser || !serviceListRef) return;

		scrollHandler = (() => {
			let debounceTimer: ReturnType<typeof setTimeout> | null = null;

			return (e: Event) => {
				if (debounceTimer) clearTimeout(debounceTimer);

				debounceTimer = setTimeout(() => {
					const target = e.target as HTMLElement;
					if (!target) return;

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

	// Initial data fetch and setup
	onMount(() => {
		if (browser) {
			fetchBtcPrice();

			if ($servicesStore.items.length > 0) {
				dataLoaded = true;
				showSkeleton = false;
				if (serviceListRef) {
					setupInfiniteScroll();
				}
			} else {
				setupLazyLoading();
			}
		}
	});

	// Cleanup on component destroy
	onDestroy(() => {
		if (browser) {
			if (intersectionObserver) {
				intersectionObserver.disconnect();
				intersectionObserver = null;
			}
			if (fallbackTimer) {
				clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}

			if (scrollHandler && serviceListRef) {
				serviceListRef.removeEventListener('scroll', scrollHandler);
				scrollHandler = null;
			}

			cleanup();
		}
	});

	// Loading state management effect
	$effect(() => {
		if (isInitialLoad && dataLoaded) {
			isInitialLoad = false;
		}

		let timer: ReturnType<typeof setTimeout> | undefined;
		if ($servicesStore.loading && searchParams.page === 1 && !dataLoaded) {
			timer = setTimeout(() => {
				if ($servicesStore.loading && searchParams.page === 1 && !dataLoaded) {
					loadingTimeout = true;
					console.error('[FindServices] Query timeout - fetching took too long');
				}
			}, 10000);
		} else {
			loadingTimeout = false;
		}

		return () => {
			if (timer) clearTimeout(timer);
		};
	});

	function getSearchPlaceholder(): string {
		if (searchQuery.length > 0 && searchQuery.length < 3) {
			return $t('dashboard.services.browse.search_minimum_chars') || 'Type at least 3 characters';
		}
		return $t('dashboard.services.browse.search_placeholder') || 'Search services...';
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

<div class="mx-auto max-w-6xl p-4 md:p-0">
	<div id="panel-find-services" role="tabpanel" class="">
		<!-- Search and Filter Controls -->
		<div class="mb-4">
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
					{#if hasActiveParams}
						<button class="btn btn-sm btn-ghost" onclick={clearFilters}>
							{$t('dashboard.services.browse.clear_filters') || 'Clear Filters'}
						</button>
					{/if}
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
						{$t('dashboard.services.browse.filters_button') || 'Filters'}
					</button>
				</div>
			</div>
		</div>

		<!-- Main Content - List View -->
		<div class="relative w-full">
			<!-- Error Message -->
			{#if $servicesStore.error}
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
						{$t('dashboard.services.browse.error_loading')?.replace('{error}', $servicesStore.error) ||
							`Error loading services: ${$servicesStore.error}`}
					</span>
				</div>
			{/if}

			<!-- Service Count -->
			{#if $servicesStore.items && $servicesStore.items.length > 0}
				<div class="text-base-content/70 mb-4 text-sm">
					{$t('dashboard.services.browse.showing_services', {
						values: { count: $servicesStore.items.length }
					}) || `Showing ${$servicesStore.items.length} service${$servicesStore.items.length !== 1 ? 's' : ''}`}
				</div>
			{/if}

			<!-- Services List -->
			<div bind:this={serviceListRef}>
				<!-- Skeleton Loading -->
				{#if showSkeleton && !dataLoaded}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 mb-12">
						{#each Array(4) as _}
							<div class="card bg-base-100 shadow-md overflow-hidden h-full flex flex-col">
								<!-- Image placeholder - same as ServiceCard (gradient + icon), with pulse -->
								<figure class="relative w-full h-48 overflow-hidden bg-base-200 shrink-0 animate-pulse">
									<div class="h-full w-full bg-linear-to-br from-primary/20 to-secondary/20 flex items-center justify-center">
										<svg
											xmlns="http://www.w3.org/2000/svg"
											class="h-16 w-16 text-base-content/30"
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
								<div class="card-body p-4 flex-1 flex flex-col animate-pulse">
									<!-- Provider Info Skeleton -->
									<div class="flex items-center gap-2 mb-2">
										<div class="w-7 h-7 rounded-full bg-base-300 shrink-0"></div>
										<div class="flex items-center gap-1.5 flex-1">
											<div class="bg-base-300 h-4 w-24 rounded"></div>
											<div class="flex items-center gap-0.5 shrink-0">
												<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
												<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
												<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
												<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
												<div class="bg-base-300 h-3.5 w-3.5 rounded"></div>
												<div class="bg-base-300 h-3 w-8 rounded ml-0.5"></div>
											</div>
										</div>
									</div>
									<!-- Title and Price Skeleton -->
									<div class="flex items-start justify-between gap-2 mb-1.5">
										<div class="bg-base-300 h-6 w-3/4 rounded flex-1"></div>
										<div class="text-right shrink-0">
											<div class="bg-base-300 h-5 w-16 rounded mb-1"></div>
											<div class="bg-base-300 h-3 w-20 rounded"></div>
										</div>
									</div>
									<!-- Description Skeleton -->
									<div class="bg-base-300 h-4 w-full rounded mb-1"></div>
									<div class="bg-base-300 h-4 w-5/6 rounded mb-2"></div>
									<!-- Tags Skeleton -->
									<div class="flex flex-wrap gap-1.5 mb-2">
										<div class="bg-base-300 h-5 w-20 rounded"></div>
										<div class="bg-base-300 h-5 w-16 rounded"></div>
									</div>
									<!-- Location Skeleton -->
									<div class="flex items-center gap-1.5 mt-auto">
										<div class="bg-base-300 h-4 w-4 rounded shrink-0"></div>
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
								{$t('dashboard.services.browse.loading_timeout_title') || 'Loading Timeout'}
							</h3>
							<div class="text-xs">
								{$t('dashboard.services.browse.loading_timeout_message') ||
									'Services are taking longer than expected to load.'}
							</div>
						</div>
						<button class="btn btn-sm" onclick={() => window.location.reload()}>
							{$t('dashboard.services.browse.refresh') || 'Refresh'}
						</button>
					</div>
				{:else if $servicesStore.items && $servicesStore.items.length > 0}
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
						{#each $servicesStore.items as service (service.id)}
							<ServiceCard {service} {btcPrice} />
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
						<div class="mt-4 mb-12 text-center text-sm text-base-content/60">
							{$t('dashboard.services.browse.no_more_services') || 'No more services to load'}
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
							{$t('dashboard.services.browse.no_services_found') || 'No services found'}
						</h3>
						<p class="text-base-content/60 text-center text-sm">
							{$t('dashboard.services.browse.no_services_message') ||
								'Try adjusting your search or filters to find more services.'}
						</p>
						{#if hasActiveParams}
							<button class="btn btn-primary btn-sm mt-4" onclick={clearFilters}>
								{$t('dashboard.services.browse.clear_filters') || 'Clear Filters'}
							</button>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- Filter Drawer -->
	<ServiceSearchFilters
		isOpen={isFilterDrawerOpen}
		onClose={() => (isFilterDrawerOpen = false)}
		onApply={handleFilterApply}
		initialFilters={searchParams}
	/>
</div>

