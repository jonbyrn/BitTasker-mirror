import type { Location } from '$lib/types/task';

export interface MapLinkOptions {
	label?: string;
	navigateMode?: boolean;
}

export interface MapLinkSet {
	universal: string;
	google: string;
	apple: string;
	waze: string;
}

/**
 * Generate universal map link that works across all platforms.
 * Uses maps.rbt.no for automatic platform detection and native app opening:
 * - Android: Opens native maps app
 * - iOS/macOS: Opens Apple Maps
 * - Windows/Linux: Opens Google Maps web
 */
export function generateUniversalMapLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude != null && location.longitude != null) {
		const coords = `${location.latitude},${location.longitude}`;
		const label = options?.label || location.displayName || '';
		// Include label in query for better display on map
		const query = label ? `${coords} ${label}` : coords;
		return `https://maps.rbt.no/?q=${encodeURIComponent(query)}`;
	}

	const query = options?.label || location.formattedAddress || location.displayName || '';
	return `https://maps.rbt.no/?q=${encodeURIComponent(query)}`;
}

/**
 * Generate Apple Maps link (native on iOS/macOS)
 */
export function generateAppleMapsLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude != null && location.longitude != null) {
		const label = options?.label || location.displayName || 'Location';
		return `https://maps.apple.com/?ll=${location.latitude},${location.longitude}&q=${encodeURIComponent(label)}`;
	}

	const query = location.formattedAddress || location.displayName || '';
	return `https://maps.apple.com/?q=${encodeURIComponent(query)}`;
}

/**
 * Generate Waze deep link (navigation-focused)
 * If navigateMode is true, immediately starts navigation
 */
export function generateWazeLink(location: Location, options?: MapLinkOptions): string {
	if (location.latitude != null && location.longitude != null) {
		const base = `https://waze.com/ul?ll=${location.latitude},${location.longitude}`;
		return options?.navigateMode ? `${base}&navigate=yes` : base;
	}

	const query = location.formattedAddress || location.displayName || '';
	const base = `https://waze.com/ul?q=${encodeURIComponent(query)}`;
	return options?.navigateMode ? `${base}&navigate=yes` : base;
}

/**
 * Generate all map links for a location
 * Returns links for universal (auto-detect platform), Google, Apple, and Waze
 */
export function generateAllMapLinks(location: Location, options?: MapLinkOptions): MapLinkSet {
	return {
		universal: generateUniversalMapLink(location /*options*/),
		google: generateGoogleMapsLink(location /*options*/),
		apple: generateAppleMapsLink(location, options),
		waze: generateWazeLink(location, options)
	};
}

/**
 * Generate a Google Maps link for a location
 * Works on both mobile and desktop, opening in user's preferred map app on mobile
 */
export function generateGoogleMapsLink(location: Location /*options?: MapLinkOptions*/): string {
	if (location.latitude == null || location.longitude == null) {
		// Fallback to address search if coordinates not available
		const address = location.formattedAddress || location.displayName || '';
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
	}

	const lat = location.latitude;
	const lng = location.longitude;

	// Use coordinate-based search for accuracy
	let url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

	// Add place ID if available for better accuracy
	if (location.placeId) {
		url += `&query_place_id=${location.placeId}`;
	}

	return url;
}

/**
 * Generate a Google Maps directions link from current location to destination
 * Works on both mobile and desktop
 */
export function generateGoogleMapsDirectionsLink(
	destination: Location,
	options?: {
		origin?: Location | { latitude: number; longitude: number } | 'current';
		label?: string;
	}
): string {
	if (!destination.latitude || !destination.longitude) {
		// Fallback to address search if coordinates not available
		const address = destination.formattedAddress || destination.displayName;
		return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`;
	}

	const destLat = destination.latitude;
	const destLng = destination.longitude;

	let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;

	// Add destination place ID if available
	if (destination.placeId) {
		url += `&destination_place_id=${destination.placeId}`;
	}

	// Add origin if specified
	if (options?.origin) {
		if (options.origin === 'current') {
			url += '&origin=current+location';
		} else {
			// Type guard: options.origin is now Location | { latitude: number; longitude: number }
			const origin = options.origin;
			if ('latitude' in origin && 'longitude' in origin) {
				const lat = origin.latitude;
				const lng = origin.longitude;
				// Handle both Location (which may have null) and coordinate object (which has numbers)
				if (lat != null && lng != null) {
					url += `&origin=${lat},${lng}`;
				}
			}
		}
	} else {
		// Default to current location
		url += '&origin=current+location';
	}

	return url;
}

/**
 * Generate a Google Maps directions link for a route with pickup and dropoff locations
 */
export function generateRouteDirectionsLink(
	pickup: Location,
	dropoff: Location
	/*options?: { label?: string }*/
): string {
	if (!pickup.latitude || !pickup.longitude || !dropoff.latitude || !dropoff.longitude) {
		// Fallback to address-based directions
		const pickupAddr = pickup.formattedAddress || pickup.displayName;
		const dropoffAddr = dropoff.formattedAddress || dropoff.displayName;
		return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pickupAddr)}&destination=${encodeURIComponent(dropoffAddr)}`;
	}

	let url = `https://www.google.com/maps/dir/?api=1&origin=${pickup.latitude},${pickup.longitude}&destination=${dropoff.latitude},${dropoff.longitude}`;

	// Add place IDs if available
	if (pickup.placeId) {
		url += `&origin_place_id=${pickup.placeId}`;
	}
	if (dropoff.placeId) {
		url += `&destination_place_id=${dropoff.placeId}`;
	}

	return url;
}

/**
 * Format a location address for display
 */
export function formatLocationAddress(location: Location): string {
	if (location.formattedAddress) {
		return location.formattedAddress;
	}

	if (location.addressComponents) {
		const components = location.addressComponents;
		const parts: string[] = [];

		// Build address from components
		if (components.streetNumber && components.street) {
			parts.push(`${components.streetNumber} ${components.street}`);
		} else if (components.street) {
			parts.push(components.street);
		}

		if (components.neighborhood) {
			parts.push(components.neighborhood);
		}

		if (components.city) {
			parts.push(components.city);
		}

		if (components.state) {
			parts.push(components.state);
		}

		if (components.postalCode) {
			parts.push(components.postalCode);
		}

		if (components.country) {
			parts.push(components.country);
		}

		return parts.join(', ');
	}

	return location.displayName || 'Location';
}
