import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import type { SearchServicesParams } from '$lib/types/service.d';

/**
 * Persist service search filters to storage
 */
export async function persistServiceSearchFilters(filters: SearchServicesParams): Promise<void> {
	if (!browser) return;

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

		await Preferences.set({
			key: StorageKeys.SERVICE_SEARCH_FILTERS,
			value: JSON.stringify(persistedFilters)
		});
	} catch (error) {
		console.warn('Failed to persist service search filters:', error);
	}
}

/**
 * Load persisted service search filters from storage
 */
export async function loadPersistedServiceSearchFilters(): Promise<Partial<SearchServicesParams> | null> {
	if (!browser) return null;

	try {
		const { value: stored } = await Preferences.get({ key: StorageKeys.SERVICE_SEARCH_FILTERS });
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
export async function clearPersistedServiceSearchFilters(): Promise<void> {
	if (!browser) return;

	try {
		await Preferences.remove({ key: StorageKeys.SERVICE_SEARCH_FILTERS });
	} catch (error) {
		console.warn('Failed to clear persisted service search filters:', error);
	}
}
