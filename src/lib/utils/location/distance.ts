import type { Location } from '$lib/types/task';

/**
 * Convert degrees to radians
 */
function toRad(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * @returns distance in kilometers
 */
export function calculateDistanceKm(
	lat1: number,
	lon1: number,
	lat2: number,
	lon2: number
): number {
	const R = 6371; // Earth's radius in kilometers
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);

	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

/**
 * Calculate distance between two Location objects
 * @returns distance in kilometers, or null if coordinates are missing
 */
export function calculateDistanceBetweenLocations(
	location1: Location,
	location2: Location
): number | null {
	if (
		location1.latitude == null ||
		location1.longitude == null ||
		location2.latitude == null ||
		location2.longitude == null
	) {
		return null;
	}

	return calculateDistanceKm(
		location1.latitude,
		location1.longitude,
		location2.latitude,
		location2.longitude
	);
}

export type RadiusValidationErrorCode =
	| 'OUTSIDE_RADIUS'
	| 'MISSING_TASKER_COORDINATES'
	| 'MISSING_TASKEE_COORDINATES';

export interface RadiusValidationResult {
	valid: boolean;
	distanceKm: number | null;
	maxRadiusKm: number;
	errorCode?: RadiusValidationErrorCode;
}

/**
 * Validate that the Tasker's (client's) location is within the Taskee's (provider's) service radius.
 *
 * For TASKER_LOCATION services:
 * - taskerLocation = where the client wants the service performed (provided during booking)
 * - taskeeBaseLocation = the provider's base/home location (set during service creation)
 * - serviceRadiusKm = how far the provider is willing to travel
 *
 * @param taskerLocation - The client's desired service location
 * @param taskeeBaseLocation - The provider's base location
 * @param serviceRadiusKm - Maximum distance the provider will travel (in km)
 */
export function validateLocationWithinRadius(
	taskerLocation: Location | null | undefined,
	taskeeBaseLocation: Location | null | undefined,
	serviceRadiusKm: number
): RadiusValidationResult {
	// Validate Tasker's location
	if (!taskerLocation?.latitude || !taskerLocation?.longitude) {
		return {
			valid: false,
			distanceKm: null,
			maxRadiusKm: serviceRadiusKm,
			errorCode: 'MISSING_TASKER_COORDINATES'
		};
	}

	// Validate Taskee's base location
	if (!taskeeBaseLocation?.latitude || !taskeeBaseLocation?.longitude) {
		return {
			valid: false,
			distanceKm: null,
			maxRadiusKm: serviceRadiusKm,
			errorCode: 'MISSING_TASKEE_COORDINATES'
		};
	}

	const distance = calculateDistanceKm(
		taskerLocation.latitude,
		taskerLocation.longitude,
		taskeeBaseLocation.latitude,
		taskeeBaseLocation.longitude
	);

	// Round to 1 decimal place for cleaner display
	const roundedDistance = Math.round(distance * 10) / 10;

	if (distance > serviceRadiusKm) {
		return {
			valid: false,
			distanceKm: roundedDistance,
			maxRadiusKm: serviceRadiusKm,
			errorCode: 'OUTSIDE_RADIUS'
		};
	}

	return {
		valid: true,
		distanceKm: roundedDistance,
		maxRadiusKm: serviceRadiusKm
	};
}

/**
 * Check if a location has valid coordinates
 */
export function hasValidCoordinates(location: Location | null | undefined): boolean {
	return location?.latitude != null && location?.longitude != null;
}

/**
 * Format distance for display
 * @param distanceKm - Distance in kilometers
 * @returns Formatted string like "5.2 km" or "0.5 km"
 */
export function formatDistanceKm(distanceKm: number): string {
	if (distanceKm < 1) {
		return `${Math.round(distanceKm * 10) / 10} km`;
	}
	return `${Math.round(distanceKm * 10) / 10} km`;
}
