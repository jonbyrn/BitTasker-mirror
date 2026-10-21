import type { Service, SearchServicesParams } from '$lib/types/service.d';
import { type Event, type Filter, nip19 } from 'nostr-tools';
import { Preferences } from '@capacitor/preferences';
import { browser } from '$app/environment';
import nostrEventsService from '$lib/api/services/nostr/events';
import KINDS from '$lib/utils/constants/kinds';
import { StorageKeys } from '$lib/utils/constants/storage';
import { TAG_FILTERS } from '$lib/utils/constants/tags';
import {
	indexServiceData,
	filterIndexedServices,
	cleanupIndexedServices,
	type IndexedService
} from '$lib/utils/service-indexing';
import { getNpub } from '$lib/utils/nostrKeys';
import { findServiceByUniqueId } from './service';
import { appStore } from '$lib/stores/app.store';
import { servicesStore } from '$lib/stores/service.store';
import { get } from 'svelte/store';
import { normalizeServiceTierDeliveryTimes } from '$lib/utils/serviceTierDelivery';
import { currentServicesSearchEpoch, isServicesSearchCurrent } from '$lib/search/search-epoch';

// Constants
const SERVICES_PER_PAGE = 20; // Default services limit per page
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of services to keep in cache
const DELETION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for deletion events cache
const MAX_DELETION_CACHE_SIZE = 10; // Maximum deletion cache entries with LRU eviction
const REQUEST_TIMEOUT_MS = 15000;

function commitServices(
	epoch: number | undefined,
	updater: Parameters<typeof servicesStore.update>[0]
): void {
	if (!isServicesSearchCurrent(epoch)) return;
	servicesStore.update(updater);
}

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	const timeout = new Promise<T>((_, reject) =>
		setTimeout(() => reject(new Error('Request timeout')), ms)
	);
	return Promise.race([promise, timeout]);
}

async function findEventsWithRetry(filter: Filter): Promise<{ data?: Event[] }> {
	try {
		return await withTimeout(nostrEventsService.findEvents(filter), REQUEST_TIMEOUT_MS);
	} catch (error) {
		if (error instanceof Error && error.message === 'Request timeout') {
			return await withTimeout(nostrEventsService.findEvents(filter), REQUEST_TIMEOUT_MS);
		}
		throw error;
	}
}

// Memory cache with indexed services for better performance
const cache = new Map<string, { data: IndexedService[]; timestamp: number }>();

// Deletion events cache (stores deleted service IDs) with LRU eviction
const deletionCache = new Map<string, { deletedIds: Set<string>; timestamp: number }>();

function evictOldestDeletionCacheEntry(): void {
	if (deletionCache.size >= MAX_DELETION_CACHE_SIZE) {
		let oldestKey: string | null = null;
		let oldestTime = Infinity;
		for (const [key, value] of deletionCache) {
			if (value.timestamp < oldestTime) {
				oldestTime = value.timestamp;
				oldestKey = key;
			}
		}
		if (oldestKey) {
			deletionCache.delete(oldestKey);
		}
	}
}

export async function getCachedViewerNpub(): Promise<string | null> {
	const inMemoryNpub = get(appStore)?.nostrKeys?.npub;
	if (typeof inMemoryNpub === 'string' && inMemoryNpub.trim().length > 0) {
		return inMemoryNpub;
	}

	try {
		const { value } = await Preferences.get({ key: StorageKeys.NPUB });
		return typeof value === 'string' && value.trim().length > 0 ? value : null;
	} catch (error) {
		console.error('Error reading cached npub for public service filtering:', error);
		return null;
	}
}

interface FilterPerformanceMetrics {
	totalServices: number;
	filteredServices: number;
	filterTime: number;
	indexTime: number;
	cacheHit: boolean;
}

const MAX_PERFORMANCE_METRICS = 100;
const performanceMetrics: FilterPerformanceMetrics[] = [];

/**
 * Convert search params to Nostr filter
 * Uses single-character tags from TAG_FILTERS (centralized in tags.ts)
 * Only requests service kinds (SERVICE_ACTIVE) — deleted services are NIP-09 kind 5; we filter those client-side until relay supports exclusion.
 */
export function createServiceFilter(params: SearchServicesParams): Filter {
	const filter: Filter & { [key: string]: string[] | number[] | string | number | undefined } = {
		kinds: params.kinds || [KINDS.SERVICE_ACTIVE],
		limit: params.limit || SERVICES_PER_PAGE,
		until: params.until || undefined,
		since: params.since || undefined
	};

	// Same as Find Tasks: send search to relay (NIP-50). Results are always filtered client-side with normalizeText so matches show regardless of case.
	if (params.search) {
		filter.search = params.search.trim();
	}

	// Centralized single-char tag filters (TAG_FILTERS)
	// Status is a browse filter. An exact title search must not require it.
	if (params.status && params.status.length > 0 && !params.search?.trim()) {
		Object.assign(filter, TAG_FILTERS.byServiceStatus(params.status));
	}
	if (params.pricingType) {
		Object.assign(filter, TAG_FILTERS.byServicePricingType(params.pricingType));
	}
	if (params.serviceLocationTypes && params.serviceLocationTypes.length > 0) {
		Object.assign(filter, TAG_FILTERS.byServiceLocationTypes(params.serviceLocationTypes));
	}
	if (params.minPrice !== undefined) {
		Object.assign(filter, TAG_FILTERS.byServiceMinPrice(params.minPrice));
	}
	if (params.maxPrice !== undefined) {
		Object.assign(filter, TAG_FILTERS.byServiceMaxPrice(params.maxPrice));
	}
	if (params.deliveryTime !== undefined) {
		Object.assign(filter, TAG_FILTERS.byServiceDeliveryTime(params.deliveryTime));
	}

	return filter;
}

/**
 * Convert a Nostr event to a Service
 * Also fetches creator profile data (reviews, rating) if available
 */
export function convertEventToService(event: Event): Service {
	try {
		const contentData = normalizeServiceTierDeliveryTimes(JSON.parse(event.content));
		return {
			...contentData,
			id: event.id,
			npub: event.pubkey,
			eventKind: event.kind,
			createdAt: event.created_at
		} as Service;
	} catch (error) {
		console.error('Error parsing service event content:', error);
		throw error;
	}
}

export function dedupeServicesByUniqueId(services: Service[]): Service[] {
	const latestByUniqueId = new Map<string, Service>();

	for (const service of services) {
		const key = service.uniqueId?.trim() || service.id;
		const existing = latestByUniqueId.get(key);
		const candidateTimestamp = service.updatedAt ?? service.createdAt ?? 0;
		const existingTimestamp = existing?.updatedAt ?? existing?.createdAt ?? 0;

		if (!existing || candidateTimestamp > existingTimestamp) {
			latestByUniqueId.set(key, service);
		}
	}

	return Array.from(latestByUniqueId.values());
}

/**
 * Fetch deletion events and cache deleted service IDs
 */
async function getDeletedServiceIds(): Promise<Set<string>> {
	const cacheKey = 'deleted_services';
	const cached = deletionCache.get(cacheKey);

	// Return cached deletion IDs if still valid
	if (cached && Date.now() - cached.timestamp < DELETION_CACHE_TTL) {
		return cached.deletedIds;
	}

	try {
		// Query for deletion events (kind 5) that reference service events
		const filter: Filter = {
			kinds: [5], // NIP-09 deletion events
			limit: 1000 // Get up to 1000 deletion events
		};

		const response = await withTimeout(
			nostrEventsService.requestEvents({ filters: [filter] }),
			REQUEST_TIMEOUT_MS
		);

		const deletedIds = new Set<string>();

		if (response.data) {
			// Extract service IDs from deletion events
			// Deletion events have ['e', serviceId] tags
			for (const deletionEvent of response.data) {
				for (const tag of deletionEvent.tags) {
					if (tag[0] === 'e' && tag[1]) {
						deletedIds.add(tag[1]);
					}
				}
			}
		}

		// Evict oldest entry if at capacity before caching
		evictOldestDeletionCacheEntry();

		// Cache the deleted IDs
		deletionCache.set(cacheKey, {
			deletedIds,
			timestamp: Date.now()
		});

		return deletedIds;
	} catch (error) {
		console.error('Error fetching deletion events:', error);
		// Return empty set on error (better to show services than hide them all)
		return new Set<string>();
	}
}

/**
 * Filter out deleted services using NIP-09 deletion events
 */
async function filterDeletedServices(services: Service[]): Promise<Service[]> {
	const deletedIds = await getDeletedServiceIds();
	return services.filter((service) => !deletedIds.has(service.id));
}

/**
 * Find services based on search parameters
 */
export async function findServices(
	params: SearchServicesParams,
	epoch?: number
): Promise<{ services: Service[]; total: number; hasMore: boolean }> {
	const activeEpoch = epoch ?? currentServicesSearchEpoch();
	try {
		commitServices(activeEpoch, (state) => ({ ...state, loading: true, error: null }));

		const filter = createServiceFilter(params);
		const { limit: _limit, ...filterWithoutLimit } = filter;
		const cacheKey = JSON.stringify(filterWithoutLimit);

		// Check cache — bypass when `until` cursor is set (pagination always goes to relay)
		const cached = cache.get(cacheKey);
		if (!params.until && cached && Date.now() - cached.timestamp < CACHE_TTL) {
			// Use optimized filtering with pre-indexed data
			const { services: filteredServices, metrics } = filterIndexedServices(cached.data, params);
			metrics.cacheHit = true;
			if (performanceMetrics.length >= MAX_PERFORMANCE_METRICS) performanceMetrics.length = 0;
			performanceMetrics.push(metrics);

			// Convert back to regular Service objects
			const cleanServices = cleanupIndexedServices(filteredServices);

			const limit = params.limit || SERVICES_PER_PAGE;
			const currentItemsCount = get(servicesStore).items.length;

			// If we're loading more (page > 1), get the next batch from cache
			if (params.page && params.page > 1) {
				const startIndex = currentItemsCount;
				const endIndex = Math.min(startIndex + limit, cleanServices.length);
				let limitedServices = cleanServices.slice(startIndex, endIndex);

				const existingIds = new Set(get(servicesStore).items.map((s) => s.uniqueId));
				limitedServices = limitedServices.filter((s) => !existingIds.has(s.uniqueId));

				const hasMore = endIndex < cleanServices.length || cleanServices.length >= MAX_CACHE_SIZE;

				commitServices(activeEpoch, (state) => ({
					...state,
					items: [...state.items, ...limitedServices],
					loading: false,
					currentPage: params.page || 1,
					hasMore
				}));

				return {
					services: limitedServices,
					total: limitedServices.length,
					hasMore
				};
			}

			// Limit results to requested batch size for initial load
			const limitedServices = cleanServices.slice(0, limit);
			// If we got a full page, there might be more on the relay.
			// Match the fresh-fetch logic: hasMore = items >= limit.
			// An extra request returning 0 is better than killing infinite scroll.
			const hasMore = limitedServices.length >= limit;

			commitServices(activeEpoch, (state) => ({
				...state,
				items: params.page === 1 ? limitedServices : [...state.items, ...limitedServices],
				loading: false,
				currentPage: params.page || 1,
				hasMore
			}));

			return {
				services: limitedServices,
				total: limitedServices.length,
				hasMore
			};
		}

		// NIP-50 first. A miss pages the catalog without the term and keeps only
		// client-side matches, instead of stopping after a single unfiltered page.
		const pageLimit = params.limit || SERVICES_PER_PAGE;
		const MAX_FILL_ROUNDS = 10;
		let until = params.until;
		let rounds = 0;
		let hasMore = true;
		let usedFallback = false;
		let lastRelayTimestamp: number | undefined;
		const matched: IndexedService[] = [];
		const seen = new Set<string>();

		while (matched.length < pageLimit && hasMore && rounds < MAX_FILL_ROUNDS) {
			rounds++;
			const roundFilter = createServiceFilter({ ...params, until, limit: pageLimit });
			let response = await findEventsWithRetry(roundFilter);
			let events = response.data || [];

			if (params.search?.trim() && events.length === 0) {
				usedFallback = true;
				const fallbackFilter = { ...roundFilter } as Filter & { search?: string };
				delete fallbackFilter.search;
				response = await findEventsWithRetry(fallbackFilter);
				events = response.data || [];
			}

			hasMore = events.length >= pageLimit;
			if (events.length > 0) {
				lastRelayTimestamp = events[events.length - 1].created_at;
				until = (lastRelayTimestamp ?? 0) - 1;
			} else {
				hasMore = false;
				break;
			}

			const rawServices = events.map((event: Event) => convertEventToService(event));
			const latestServices = dedupeServicesByUniqueId(rawServices);
			const visibleServices = await filterDeletedServices(latestServices);
			const activeServices = visibleServices.filter((service) => service.status === 'active');

			let filteredServices = activeServices;
			try {
				const npub = await getCachedViewerNpub();
				if (npub && typeof npub === 'string' && npub.startsWith('npub1')) {
					const decoded = nip19.decode(npub);
					if (decoded.type === 'npub') {
						const hexPubkey = decoded.data;
						filteredServices = activeServices.filter((service) => service.npub !== hexPubkey);
					}
				}
			} catch (error) {
				console.error('Error filtering own services:', error);
			}

			const indexedServices = indexServiceData(filteredServices);
			const { services: filteredIndexedServices, metrics } = filterIndexedServices(
				indexedServices,
				params
			);
			if (performanceMetrics.length >= MAX_PERFORMANCE_METRICS) performanceMetrics.length = 0;
			performanceMetrics.push(metrics);

			for (const service of filteredIndexedServices) {
				const key = service.uniqueId || service.id;
				if (!key || seen.has(key)) continue;
				seen.add(key);
				matched.push(service);
			}

			// A full page of non-matches is not the end of the catalog.
			if (filteredIndexedServices.length === 0 && !hasMore) break;
		}

		const filteredIndexedServices = matched;

		// Get existing cached data if available
		const existingCached = cache.get(cacheKey);
		let allCachedServices: IndexedService[] = [];

		if (existingCached && Date.now() - existingCached.timestamp < CACHE_TTL) {
			// Merge with existing cache, avoiding duplicates
			const existingIds = new Set(existingCached.data.map((s) => s.id));
			const newServices = filteredIndexedServices.filter((s) => !existingIds.has(s.id));
			allCachedServices = [...existingCached.data, ...newServices];
		} else {
			allCachedServices = filteredIndexedServices;
		}

		// Limit cache to MAX_CACHE_SIZE to prevent memory issues
		if (allCachedServices.length > MAX_CACHE_SIZE) {
			allCachedServices = allCachedServices.slice(0, MAX_CACHE_SIZE);
		}

		// Cache a finished scan, including a stable empty result. A scan that
		// stopped at the page cap still has more of the catalog, so leave it
		// uncached and let the next search continue.
		const filled = filteredIndexedServices.length >= (params.limit || SERVICES_PER_PAGE);
		if (!hasMore || filled) {
			cache.set(cacheKey, { data: allCachedServices, timestamp: Date.now() });
		} else if (usedFallback) {
			console.debug(
				`[FindServices] search scan for "${params.search}" hit the page cap with more listings left`
			);
		}

		// Convert back to regular Service objects
		const cleanServices = cleanupIndexedServices(filteredIndexedServices);

		const limit = params.limit || SERVICES_PER_PAGE;
		const limitedServices = cleanServices.slice(0, limit);

		// Update store
		const page = params.page || 1;
		let itemsToAdd = limitedServices;
		if (page > 1) {
			const existingIds = new Set(get(servicesStore).items.map((s) => s.uniqueId));
			itemsToAdd = limitedServices.filter((s) => !existingIds.has(s.uniqueId));
		}
		commitServices(activeEpoch, (state) => ({
			...state,
			items: page === 1 ? itemsToAdd : [...state.items, ...itemsToAdd],
			loading: false,
			currentPage: page,
			hasMore,
			lastRelayTimestamp: lastRelayTimestamp ?? state.lastRelayTimestamp
		}));

		return {
			services: limitedServices,
			total: limitedServices.length,
			hasMore
		};
	} catch (error) {
		console.error('Error finding services:', error);
		commitServices(activeEpoch, (state) => ({
			...state,
			loading: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred'
		}));
		return {
			services: [],
			total: 0,
			hasMore: false
		};
	}
}

/**
 * Find user's own services
 */
export async function findMyServices(
	params: SearchServicesParams & { refresh?: boolean }
): Promise<{ services: Service[]; total: number; hasMore: boolean }> {
	try {
		const npub = await getNpub();

		if (!npub || typeof npub !== 'string') {
			console.warn('findMyServices: No public key found');
			return { services: [], total: 0, hasMore: false };
		}

		// Support both npub and raw hex public keys (same behavior as findMyTasks)
		let pubkeyHex = npub;
		if (npub.startsWith('npub')) {
			try {
				const decoded = nip19.decode(npub);
				if (decoded.type !== 'npub') {
					console.error('findMyServices: Invalid npub type from nip19.decode');
					return { services: [], total: 0, hasMore: false };
				}
				pubkeyHex = decoded.data as string;
			} catch (error) {
				console.error('findMyServices: Error decoding npub', error);
				return { services: [], total: 0, hasMore: false };
			}
		}

		const filter: Filter = {
			kinds: params.kinds || [KINDS.SERVICE_ACTIVE, KINDS.SERVICE_DRAFT],
			authors: [pubkeyHex],
			limit: params.limit || SERVICES_PER_PAGE,
			until: params.until || undefined,
			since: params.since || undefined
		};

		// Add search filter if provided
		if (params.search) {
			filter.search = params.search.trim();
		}

		if (params.status && params.status.length > 0) {
			Object.assign(filter, TAG_FILTERS.byServiceStatus(params.status));
		}

		const response = await nostrEventsService.findEvents(filter);
		const events = response.data || [];

		// Convert events to services (synchronous)
		const rawServices: Service[] = [];
		for (const event of events) {
			try {
				rawServices.push(convertEventToService(event));
			} catch (error) {
				console.error('Error converting event to service:', error);
			}
		}

		// NIP-33: keep only the latest version per service (same uniqueId = same logical service)
		const latestByUniqueId = new Map<string, Service>();
		for (const s of rawServices) {
			const uid = s.uniqueId || s.id;
			const existing = latestByUniqueId.get(uid);
			if (!existing || (s.createdAt ?? 0) > (existing.createdAt ?? 0)) {
				latestByUniqueId.set(uid, s);
			}
		}
		const dedupedServices = Array.from(latestByUniqueId.values());

		// Filter out deleted services (even for own services, respect deletions)
		const activeServices = await filterDeletedServices(dedupedServices);

		// Pre-index services for optimized filtering
		const indexedServices = indexServiceData(activeServices);

		// Apply optimized frontend filtering
		const { services: filteredIndexedServices } = filterIndexedServices(indexedServices, params);

		// Convert back to regular Service objects
		const cleanServices = cleanupIndexedServices(filteredIndexedServices);

		const limit = params.limit || SERVICES_PER_PAGE;
		const limitedServices = cleanServices.slice(0, limit);
		const hasMore = events.length >= limit;

		return {
			services: limitedServices,
			total: limitedServices.length,
			hasMore
		};
	} catch (error) {
		console.error('Error finding my services:', error);
		return {
			services: [],
			total: 0,
			hasMore: false
		};
	}
}

/**
 * Re-export findServiceByUniqueId from service.ts for convenience
 */
export { findServiceByUniqueId };

export function invalidateServiceDiscoveryCaches(): void {
	cache.clear();
	deletionCache.clear();
}

/**
 * Get performance metrics for service filtering operations
 */
export function getFilterPerformanceReport() {
	return {
		metrics: performanceMetrics,
		averageFilterTime:
			performanceMetrics.length > 0
				? performanceMetrics.reduce((sum, m) => sum + m.filterTime, 0) / performanceMetrics.length
				: 0,
		totalQueries: performanceMetrics.length,
		cacheHits: performanceMetrics.filter((m) => m.cacheHit).length
	};
}

// Cleanup cache when browser closes
let beforeUnloadHandler: (() => void) | null = null;

if (browser) {
	beforeUnloadHandler = () => {
		invalidateServiceDiscoveryCaches();
	};
	window.addEventListener('beforeunload', beforeUnloadHandler);
}

/**
 * Cleanup function to handle cleanup tasks and remove beforeunload listener
 */
export function cleanup(): void {
	invalidateServiceDiscoveryCaches();
	performanceMetrics.length = 0;
	if (browser && beforeUnloadHandler) {
		window.removeEventListener('beforeunload', beforeUnloadHandler);
		beforeUnloadHandler = null;
	}
}
