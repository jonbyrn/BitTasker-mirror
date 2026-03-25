import type { Service, SearchServicesParams } from '$lib/types/service.d';
import { type Event, type Filter } from 'nostr-tools';
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
import { fetchComprehensiveProfile } from '$lib/utils/nostr-message';
import { normalizeServiceTierDeliveryTimes } from '$lib/utils/serviceTierDelivery';

// Constants
const SERVICES_PER_PAGE = 20; // Default services limit per page
/** When user has a search term, fetch more events and filter client-side (relays often don't support NIP-50). */
const SEARCH_FETCH_LIMIT = 150;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100; // Maximum number of services to keep in cache
const DELETION_CACHE_TTL = 5 * 60 * 1000; // 5 minutes for deletion events cache
const PROFILE_FETCH_TIMEOUT_MS = 750;

// Memory cache with indexed services for better performance
const cache = new Map<string, { data: IndexedService[]; timestamp: number }>();

// Deletion events cache (stores deleted service IDs)
const deletionCache = new Map<string, { deletedIds: Set<string>; timestamp: number }>();

async function getCachedViewerNpub(): Promise<string | null> {
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

async function fetchComprehensiveProfileSafe(pubkey: string) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null;

	try {
		return await Promise.race([
			fetchComprehensiveProfile(pubkey),
			new Promise<null>((resolve) => {
				timeoutId = setTimeout(() => resolve(null), PROFILE_FETCH_TIMEOUT_MS);
			})
		]);
	} catch (error) {
		console.error('Error fetching creator profile data:', error);
		return null;
	} finally {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}
	}
}

/**
 * Performance monitor for service filtering
 */
interface FilterPerformanceMetrics {
	totalServices: number;
	filteredServices: number;
	filterTime: number;
	indexTime: number;
	cacheHit: boolean;
}

const performanceMetrics: FilterPerformanceMetrics[] = [];

/**
 * Convert search params to Nostr filter
 * Uses single-character tags from TAG_FILTERS (centralized in tags.ts)
 * Only requests service kinds (SERVICE_ACTIVE) — deleted services are NIP-09 kind 5; we filter those client-side until relay supports exclusion.
 */
function createServiceFilter(params: SearchServicesParams): Filter {
	// When search is present, request more events and filter client-side (many relays don't support NIP-50).
	const requestLimit = params.search?.trim()
		? SEARCH_FETCH_LIMIT
		: params.limit || SERVICES_PER_PAGE;

	const filter: Filter & { [key: string]: string[] | number[] | string | number | undefined } = {
		kinds: params.kinds || [KINDS.SERVICE_ACTIVE],
		limit: requestLimit,
		until: params.until || undefined,
		since: params.since || undefined
	};

	// Same as Find Tasks: send search to relay (NIP-50). Results are always filtered client-side with normalizeText so matches show regardless of case.
	if (params.search) {
		filter.search = params.search.trim();
	}

	// Centralized single-char tag filters (TAG_FILTERS)
	if (params.status && params.status.length > 0) {
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
async function convertEventToService(event: Event): Promise<Service> {
	try {
		const contentData = normalizeServiceTierDeliveryTimes(JSON.parse(event.content));
		const service: Service = {
			...contentData,
			id: event.id,
			npub: event.pubkey,
			eventKind: event.kind,
			createdAt: event.created_at
		} as Service;

		// Fetch creator profile data (reviews, rating) if creator info exists
		if (service.creator && event.pubkey) {
			// Discovery must fail open when secondary profile hydration is slow or unavailable.
			const profile = await fetchComprehensiveProfileSafe(event.pubkey);

			// Update creator with reviews and rating
			if (profile?.reviews && profile.reviews.length > 0) {
				const totalRating = profile.reviews.reduce((sum, review) => sum + (review.rating || 0), 0);
				service.creator.rating = totalRating / profile.reviews.length;
			}
		}

		return service;
	} catch (error) {
		console.error('Error parsing service event content:', error);
		throw error;
	}
}

function dedupeServicesByUniqueId(services: Service[]): Service[] {
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

		const response = await nostrEventsService.requestEvents({
			filters: [filter]
		});

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
	params: SearchServicesParams
): Promise<{ services: Service[]; total: number; hasMore: boolean }> {
	try {
		servicesStore.update((state) => ({ ...state, loading: true, error: null }));

		const filter = createServiceFilter(params);
		const cacheKey = JSON.stringify(filter);

		// Check cache
		const cached = cache.get(cacheKey);
		if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
			// Use optimized filtering with pre-indexed data
			const { services: filteredServices, metrics } = filterIndexedServices(cached.data, params);
			metrics.cacheHit = true;
			performanceMetrics.push(metrics);

			// Convert back to regular Service objects
			const cleanServices = cleanupIndexedServices(filteredServices);

			const limit = params.limit || SERVICES_PER_PAGE;
			const currentItemsCount = get(servicesStore).items.length;

			// If we're loading more (page > 1), get the next batch from cache
			if (params.page && params.page > 1) {
				const startIndex = currentItemsCount;
				const endIndex = Math.min(startIndex + limit, cleanServices.length);
				const limitedServices = cleanServices.slice(startIndex, endIndex);
				const hasMore = endIndex < cleanServices.length || cleanServices.length >= MAX_CACHE_SIZE;

				servicesStore.update((state) => ({
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
			const hasMore = limitedServices.length >= limit && cleanServices.length > limit;

			servicesStore.update((state) => ({
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

		// Fetch from Nostr (same as Find Tasks: we send search; if relay returns 0, fallback and filter client-side so we always show results)
		let response = await nostrEventsService.findEvents(filter);
		let events = response.data || [];

		if (params.search?.trim() && events.length === 0) {
			const fallbackFilter = { ...filter } as Filter & { search?: string };
			delete fallbackFilter.search;
			fallbackFilter.limit = SEARCH_FETCH_LIMIT;
			response = await nostrEventsService.findEvents(fallbackFilter);
			events = response.data || [];
		}

		// Convert events to services (with async profile data fetching)
		const rawServices = await Promise.all(
			events.map((event: Event) => convertEventToService(event))
		);

		// Keep only the latest version per logical listing before applying visibility rules.
		const latestServices = dedupeServicesByUniqueId(rawServices);

		// Filter out deleted services
		const visibleServices = await filterDeletedServices(latestServices);

		// Public browse only surfaces active published listings.
		const activeServices = visibleServices.filter((service) => service.status === 'active');

		// For public users, exclude own services (if npub available and valid Bech32)
		let filteredServices = activeServices;
		try {
			const npub = await getCachedViewerNpub();
			if (npub && typeof npub === 'string' && npub.startsWith('npub1')) {
				const { nip19 } = await import('nostr-tools');
				const decoded = nip19.decode(npub);
				if (decoded.type === 'npub') {
					const hexPubkey = decoded.data;
					filteredServices = activeServices.filter((service) => service.npub !== hexPubkey);
				}
			}
		} catch (error) {
			console.error('Error filtering own services:', error);
			console.debug('NPUB not available or invalid, showing all services');
		}

		// Pre-index services for optimized filtering
		const indexedServices = indexServiceData(filteredServices);

		// Apply optimized frontend filtering
		const { services: filteredIndexedServices, metrics } = filterIndexedServices(
			indexedServices,
			params
		);
		performanceMetrics.push(metrics);

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

		// Update cache with merged indexed data
		cache.set(cacheKey, { data: allCachedServices, timestamp: Date.now() });

		// Convert back to regular Service objects
		const cleanServices = cleanupIndexedServices(filteredIndexedServices);

		const limit = params.limit || SERVICES_PER_PAGE;
		const limitedServices = cleanServices.slice(0, limit);
		const hasMore = events.length >= limit || cleanServices.length > limit;

		// Update store
		servicesStore.update((state) => ({
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
	} catch (error) {
		console.error('Error finding services:', error);
		servicesStore.update((state) => ({
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
				const { nip19 } = await import('nostr-tools');
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

		// Convert events to services (with async profile data fetching)
		const rawServices = await Promise.all(
			events.map((event: Event) => convertEventToService(event))
		);

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
		const hasMore = events.length >= limit || cleanServices.length > limit;

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
 * Cleanup function to handle cleanup tasks
 */
export function cleanup(): void {
	invalidateServiceDiscoveryCaches();
	performanceMetrics.length = 0;
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
if (browser) {
	window.addEventListener('beforeunload', () => {
		invalidateServiceDiscoveryCaches();
	});
}
