import type { Location } from '$lib/types/task';

/**
 * Generate a Google Maps link for a location
 * Works on both mobile and desktop, opening in user's preferred map app on mobile
 */
export function generateGoogleMapsLink(location: Location, options?: { label?: string }): string {
	if (!location.latitude || !location.longitude) {
		// Fallback to address search if coordinates not available
		const address = location.formattedAddress || location.displayName;
		return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
	}

	const lat = location.latitude;
	const lng = location.longitude;
	const label = options?.label || location.displayName || 'Location';

	// Use Google Maps URL scheme that works on both mobile and desktop
	// On mobile, this will open in the user's preferred map app (Google Maps, Apple Maps, etc.)
	// On desktop, it opens in Google Maps web
	return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}&query_place_id=${location.placeId || ''}`;
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
	const label = options?.label || destination.displayName || 'Destination';

	let url = `https://www.google.com/maps/dir/?api=1&destination=${destLat},${destLng}`;

	// Add destination place ID if available
	if (destination.placeId) {
		url += `&destination_place_id=${destination.placeId}`;
	}

	// Add origin if specified
	if (options?.origin) {
		if (options.origin === 'current') {
			url += '&origin=current+location';
		} else if ('latitude' in options.origin && 'longitude' in options.origin) {
			url += `&origin=${options.origin.latitude},${options.origin.longitude}`;
		} else if (options.origin.latitude && options.origin.longitude) {
			url += `&origin=${options.origin.latitude},${options.origin.longitude}`;
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
	dropoff: Location,
	options?: { label?: string }
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

