import type { Service, SearchServicesParams } from '$lib/types/service.d';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from './enums/service.enum';
import { PRIVACY_JITTER_MAX_METERS } from '$lib/utils/location/public-location';

/**
 * Interface for pre-indexed service data to enable O(1) lookups
 */
export interface IndexedService extends Service {
	// Pre-computed normalized data for fast filtering
	_skillsSet?: Set<string>;
	_categoriesSet?: Set<string>;
	_locationTypesSet?: Set<string>;
	_normalizedTitle?: string;
	_normalizedDescription?: string;
	_searchableText?: string;
	_minPrice?: number; // Minimum price for tiered pricing
	_maxPrice?: number; // Maximum price for tiered pricing
	_deliveryTimeMax?: number; // Maximum delivery time in hours (for filtering)
}

/**
 * Interface for filter performance metrics
 */
export interface FilterPerformanceMetrics {
	totalServices: number;
	filteredServices: number;
	filterTime: number;
	indexTime: number;
	cacheHit: boolean;
}

/**
 * Normalize text by removing accents and converting to lowercase.
 * Same as Find Tasks: we always show matching results regardless of case or accents—no extra case checks.
 */
function normalizeText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '') // Remove diacritics (accents)
		.toLowerCase()
		.trim();
}

function locationSearchTerms(
	location:
		| {
				displayName?: string | null;
				formattedAddress?: string | null;
				addressComponents?: {
					city?: string | null;
					state?: string | null;
					country?: string | null;
				} | null;
		  }
		| null
		| undefined,
	locationDisplayName?: string | null
): string[] {
	const structured = [
		location?.addressComponents?.city,
		location?.addressComponents?.state,
		location?.addressComponents?.country
	]
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.map((value) => normalizeText(value));

	const raw = [locationDisplayName, location?.displayName, location?.formattedAddress]
		.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
		.map((value) => normalizeText(value));

	return [...new Set([...raw, ...structured])];
}

/**
 * Pre-index service data to enable fast filtering operations
 * This converts arrays to Sets and normalizes text for O(1) lookups
 */
export function indexServiceData(services: Service[]): IndexedService[] {
	const startTime = performance.now();

	const normalizeToKey = (value: unknown): string => {
		if (typeof value === 'string') return normalizeText(value);
		if (value && typeof value === 'object') {
			const v = value as Record<string, unknown>;
			if (typeof v.id === 'string' || typeof v.id === 'number') return normalizeText(String(v.id));
			if (typeof v.name === 'string') return normalizeText(v.name);
			if (typeof v.title === 'string') return normalizeText(v.title);
		}
		return normalizeText(String(value ?? ''));
	};

	const indexedServices = services.map((service): IndexedService => {
		// Create normalized skill and category sets for O(1) lookups
		const skillsSet = new Set((service.skills || []).map((skill) => normalizeToKey(skill)));

		const categoriesSet = new Set(
			(service.categories || []).map((category) => normalizeToKey(category))
		);

		// Create location types set
		const locationTypesSet = new Set(
			(service.serviceLocationTypes || []).map((type) => normalizeToKey(type))
		);

		// Pre-normalize text fields for search (with accent normalization)
		const normalizedTitle = service.title ? normalizeText(service.title) : '';
		const normalizedDescription = service.description ? normalizeText(service.description) : '';

		// Include translations in searchable text for multilingual search
		const translationTexts: string[] = [];
		if (service.translations?.translations) {
			Object.values(service.translations.translations).forEach((translation) => {
				if (translation.title) {
					translationTexts.push(normalizeText(translation.title));
				}
				if (translation.description) {
					translationTexts.push(normalizeText(translation.description));
				}
			});
		}

		// Create combined searchable text for full-text search (includes translations)
		const searchableText = [
			normalizedTitle,
			normalizedDescription,
			...translationTexts,
			...locationSearchTerms(
				service.locationDetails?.taskerLocation?.serviceLocation,
				(service.locationDetails?.taskerLocation as Record<string, unknown>)
					?.locationDisplayName as string | undefined
			),
			...locationSearchTerms(
				service.locationDetails?.taskeeLocation?.serviceLocation,
				(service.locationDetails?.taskeeLocation as Record<string, unknown>)
					?.locationDisplayName as string | undefined
			),
			...Array.from(skillsSet),
			...Array.from(categoriesSet)
		].join(' ');

		// Calculate price range for tiered pricing
		let minPrice: number | undefined;
		let maxPrice: number | undefined;
		if (service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers) {
			const prices = service.pricing.tiers
				.map((tier) => tier.price)
				.filter((price): price is number => typeof price === 'number' && price > 0);
			if (prices.length > 0) {
				minPrice = Math.min(...prices);
				maxPrice = Math.max(...prices);
			}
		} else if (service.pricing?.type === ServicePricingTypeEnum.FIXED && service.pricing.amount) {
			minPrice = service.pricing.amount;
			maxPrice = service.pricing.amount;
		} else if (
			service.pricing?.type === ServicePricingTypeEnum.HOURLY &&
			service.pricing.hourlyRate
		) {
			minPrice = service.pricing.hourlyRate;
			maxPrice = service.pricing.hourlyRate;
		}

		// Calculate maximum delivery time in hours for filtering
		let deliveryTimeMax: number | undefined;
		if (service.pricing?.type === ServicePricingTypeEnum.TIERED && service.pricing.tiers) {
			// For tiered pricing, use the maximum delivery time from all tiers
			const deliveryTimes = service.pricing.tiers
				.map((tier) => {
					if (tier.deliveryTime?.value && tier.deliveryTime?.unit) {
						const hoursPerUnit: Record<string, number> = {
							hour: 1,
							day: 24,
							week: 168,
							month: 720
						};
						return tier.deliveryTime.value * (hoursPerUnit[tier.deliveryTime.unit] || 1);
					}
					return undefined;
				})
				.filter((time): time is number => typeof time === 'number');
			if (deliveryTimes.length > 0) {
				deliveryTimeMax = Math.max(...deliveryTimes);
			}
		} else if (service.pricing?.deliveryTime?.max && service.pricing.deliveryTime?.unit) {
			const hoursPerUnit: Record<string, number> = {
				hour: 1,
				day: 24,
				week: 168,
				month: 720
			};
			deliveryTimeMax =
				service.pricing.deliveryTime.max * (hoursPerUnit[service.pricing.deliveryTime.unit] || 1);
		}

		return {
			...service,
			_skillsSet: skillsSet,
			_categoriesSet: categoriesSet,
			_locationTypesSet: locationTypesSet,
			_normalizedTitle: normalizedTitle,
			_normalizedDescription: normalizedDescription,
			_searchableText: searchableText,
			_minPrice: minPrice,
			_maxPrice: maxPrice,
			_deliveryTimeMax: deliveryTimeMax
		};
	});

	const indexTime = performance.now() - startTime;
	console.debug(
		`[ServiceIndexing] Indexed ${services.length} services in ${indexTime.toFixed(2)}ms`
	);

	return indexedServices;
}

/**
 * Check if search params have active filters
 */
function hasActiveFilters(params: SearchServicesParams): boolean {
	return !!(
		params.search ||
		(params.categories && params.categories.length > 0) ||
		(params.skills && params.skills.length > 0) ||
		(params.serviceLocationTypes && params.serviceLocationTypes.length > 0) ||
		params.pricingType ||
		params.minPrice !== undefined ||
		params.maxPrice !== undefined ||
		params.deliveryTime !== undefined ||
		params.location ||
		params.radius !== undefined ||
		(params.status && params.status.length > 0)
	);
}

/**
 * Optimized service filtering using pre-indexed data
 * Replaces O(n*m*k) nested loops with O(n) filtering after O(m) pre-processing
 */
export function filterIndexedServices(
	indexedServices: IndexedService[],
	params: SearchServicesParams
): { services: IndexedService[]; metrics: FilterPerformanceMetrics } {
	const startTime = performance.now();

	// Early return if no filters applied
	if (!hasActiveFilters(params)) {
		const metrics: FilterPerformanceMetrics = {
			totalServices: indexedServices.length,
			filteredServices: indexedServices.length,
			filterTime: performance.now() - startTime,
			indexTime: 0,
			cacheHit: false
		};
		return { services: indexedServices, metrics };
	}

	// Pre-process filter criteria for O(1) lookups
	const normalizeToKey = (value: unknown): string => {
		if (typeof value === 'string') return normalizeText(value);
		if (value && typeof value === 'object') {
			const v = value as Record<string, unknown>;
			if (typeof v.id === 'string' || typeof v.id === 'number') return normalizeText(String(v.id));
			if (typeof v.name === 'string') return normalizeText(v.name);
			if (typeof v.title === 'string') return normalizeText(v.title);
		}
		return normalizeText(String(value ?? ''));
	};

	const normalizedSkills = (params.skills || []).map(normalizeToKey);
	const normalizedCategories = (params.categories || []).map(normalizeToKey);
	const normalizedLocationTypes = (params.serviceLocationTypes || []).map(normalizeToKey);
	// Normalized search term: always show results regardless of input case (same as Find Tasks).
	const searchTerm = params.search ? normalizeText(params.search) : '';

	// Convert to Sets for O(1) lookup performance
	const skillsFilter = new Set(normalizedSkills);
	const categoriesFilter = new Set(normalizedCategories);
	const locationTypesFilter = new Set(normalizedLocationTypes);

	let filteredServices = indexedServices;

	// Text search filter (O(n) with pre-normalized text); matches always shown, no case check.
	if (searchTerm) {
		filteredServices = filteredServices.filter((service) => {
			return service._searchableText?.includes(searchTerm) ?? false;
		});
	}

	// Skills filter (O(1) lookup per service)
	if (skillsFilter.size > 0) {
		filteredServices = filteredServices.filter((service) => {
			if (!service._skillsSet) return false;
			for (const skill of skillsFilter) {
				if (service._skillsSet.has(skill)) return true;
			}
			return false;
		});
	}

	// Categories filter (O(1) lookup per service)
	if (categoriesFilter.size > 0) {
		filteredServices = filteredServices.filter((service) => {
			if (!service._categoriesSet) return false;
			for (const category of categoriesFilter) {
				if (service._categoriesSet.has(category)) return true;
			}
			return false;
		});
	}

	// Location types filter (O(1) lookup per service)
	if (locationTypesFilter.size > 0) {
		filteredServices = filteredServices.filter((service) => {
			if (!service._locationTypesSet) return false;
			for (const locationType of locationTypesFilter) {
				if (service._locationTypesSet.has(locationType)) return true;
			}
			return false;
		});
	}

	// Pricing type filter
	if (params.pricingType) {
		filteredServices = filteredServices.filter((service) => {
			return service.pricing?.type === params.pricingType;
		});
	}

	// Price range filter
	if (params.minPrice !== undefined || params.maxPrice !== undefined) {
		filteredServices = filteredServices.filter((service) => {
			const serviceMinPrice = service._minPrice;
			const serviceMaxPrice = service._maxPrice;

			if (serviceMinPrice === undefined && serviceMaxPrice === undefined) return false;

			// Check if service price range overlaps with filter range
			const minPrice = params.minPrice ?? 0;
			const maxPrice = params.maxPrice ?? Infinity;

			if (serviceMinPrice !== undefined && serviceMaxPrice !== undefined) {
				// Service has a price range (tiered pricing)
				return (
					(serviceMinPrice >= minPrice && serviceMinPrice <= maxPrice) ||
					(serviceMaxPrice >= minPrice && serviceMaxPrice <= maxPrice) ||
					(serviceMinPrice <= minPrice && serviceMaxPrice >= maxPrice)
				);
			} else if (serviceMinPrice !== undefined) {
				// Service has a single price (fixed or hourly)
				return serviceMinPrice >= minPrice && serviceMinPrice <= maxPrice;
			}

			return false;
		});
	}

	// Delivery time filter (in hours)
	if (params.deliveryTime !== undefined) {
		filteredServices = filteredServices.filter((service) => {
			const maxDeliveryTime = service._deliveryTimeMax;
			if (maxDeliveryTime === undefined) return false;
			return maxDeliveryTime <= params.deliveryTime!;
		});
	}

	// Status filter
	if (params.status && params.status.length > 0) {
		const statusSet = new Set(params.status);
		filteredServices = filteredServices.filter((service) => {
			return statusSet.has(service.status);
		});
	}

	// Location and radius filtering (requires distance calculation)
	if (params.location && params.radius !== undefined) {
		const filterLat =
			params.locationCoords?.latitude ??
			(() => {
				const [latStr] = params.location.split(',');
				return parseFloat(latStr);
			})();
		const filterLng =
			params.locationCoords?.longitude ??
			(() => {
				const [, lngStr] = params.location.split(',');
				return parseFloat(lngStr);
			})();

		if (!isNaN(filterLat) && !isNaN(filterLng)) {
			filteredServices = filteredServices.filter((service) => {
				// Check if service has location data
				const taskerLocation = service.locationDetails?.taskerLocation?.serviceLocation;
				const taskeeLocation = service.locationDetails?.taskeeLocation?.serviceLocation;

				// For tasker location type ("At My Location"), match the provider's fixed location
				if (
					taskerLocation?.latitude != null &&
					taskerLocation?.longitude != null &&
					service.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKER_LOCATION)
				) {
					const distance = calculateDistance(
						filterLat,
						filterLng,
						taskerLocation.latitude,
						taskerLocation.longitude
					);
					return distance <= params.radius!;
				}

				// For taskee location type ("At Tasker Location"), include the provider travel radius
				if (
					taskeeLocation?.latitude != null &&
					taskeeLocation?.longitude != null &&
					service.serviceLocationTypes?.includes(ServiceLocationTypeEnum.TASKEE_LOCATION)
				) {
					const distance = calculateDistance(
						filterLat,
						filterLng,
						taskeeLocation.latitude,
						taskeeLocation.longitude
					);
					const serviceRadius = service.locationDetails?.taskeeLocation?.serviceRadius || 0;
					return distance <= params.radius! + serviceRadius + PRIVACY_JITTER_MAX_METERS / 1000;
				}

				// Remote services are always included
				if (service.serviceLocationTypes?.includes(ServiceLocationTypeEnum.REMOTE)) {
					return true;
				}

				return false;
			});
		}
	}

	// Sort results
	if (params.sortBy) {
		filteredServices = sortServices(filteredServices, params.sortBy);
	}

	const filterTime = performance.now() - startTime;
	const metrics: FilterPerformanceMetrics = {
		totalServices: indexedServices.length,
		filteredServices: filteredServices.length,
		filterTime,
		indexTime: 0,
		cacheHit: false
	};

	return { services: filteredServices, metrics };
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in kilometers
 */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function toRad(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Sort services by specified criteria
 */
function sortServices(
	services: IndexedService[],
	sortBy: 'relevance' | 'date' | 'price'
): IndexedService[] {
	const sorted = [...services];

	switch (sortBy) {
		case 'date':
			sorted.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
			break;
		case 'price':
			sorted.sort((a, b) => {
				const priceA = a._minPrice ?? Infinity;
				const priceB = b._minPrice ?? Infinity;
				return priceA - priceB;
			});
			break;
		case 'relevance':
		default:
			// Relevance is already handled by search term matching
			// Keep original order
			break;
	}

	return sorted;
}

/**
 * Cleanup indexed services - remove indexing metadata
 */
export function cleanupIndexedServices(services: IndexedService[]): Service[] {
	return services.map(({ ...service }) => service);
}
