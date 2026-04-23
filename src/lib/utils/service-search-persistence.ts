import type { SearchServicesParams } from '$lib/types/service.d';

const STORAGE_KEY = 'bittasker_service_search_filters';

/**
 * Persist service search filters to localStorage
 */
export function persistServiceSearchFilters(filters: SearchServicesParams): void {
	if (typeof window === 'undefined') return;

	try {
		// Only persist filter-related fields, not pagination
		const persistedFilters = {
			categories: filters.categories || [],
			skills: filters.skills || [],
			serviceLocationTypes: filters.serviceLocationTypes || [],
			pricingType: filters.pricingType,
			minPrice: filters.minPrice,
			maxPrice: filters.maxPrice,
			deliveryTime: filters.deliveryTime,
			location: filters.location,
			locationCoords: filters.locationCoords,
			radius: filters.radius
		};

		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persistedFilters));
	} catch (error) {
		console.warn('Failed to persist service search filters:', error);
	}
}

/**
 * Load persisted service search filters from localStorage
 */
export function loadPersistedServiceSearchFilters(): Partial<SearchServicesParams> | null {
	if (typeof window === 'undefined') return null;

	try {
		const stored = window.localStorage.getItem(STORAGE_KEY);
		if (!stored) return null;

		return JSON.parse(stored);
	} catch (error) {
		console.warn('Failed to load persisted service search filters:', error);
		return null;
	}
}

/**
 * Clear persisted service search filters
 */
export function clearPersistedServiceSearchFilters(): void {
	if (typeof window === 'undefined') return;

	try {
		window.localStorage.removeItem(STORAGE_KEY);
	} catch (error) {
		console.warn('Failed to clear persisted service search filters:', error);
	}
}
