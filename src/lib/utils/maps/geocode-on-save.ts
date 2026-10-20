/**
 * Fill missing listing coordinates once, when a task or service is saved.
 * Map views keep reading the stored coordinates. Nominatim stays the fallback
 * for listings that were saved before this, or whose lookup missed.
 */

import type { ServiceBody } from '$lib/types/service';
import type { Location, TaskBody } from '$lib/types/task';
import { geocodeWithNominatim, listingGeocodeQuery, normalizeGeocodeQuery } from './nominatim';

const SAVE_GEOCODE_TIMEOUT_MS = 8_000;

type PlaceText = {
	latitude?: number | null;
	longitude?: number | null;
	displayName?: string | null;
	formattedAddress?: string | null;
};

export function hasStoredCoordinates(location: PlaceText | null | undefined): boolean {
	return (
		typeof location?.latitude === 'number' &&
		typeof location?.longitude === 'number' &&
		Number.isFinite(location.latitude) &&
		Number.isFinite(location.longitude) &&
		Math.abs(location.latitude) <= 90 &&
		Math.abs(location.longitude) <= 180
	);
}

function placeQuery(
	location: PlaceText | null | undefined,
	extraLabels: string[] = []
): string | null {
	const labels = [location?.formattedAddress, location?.displayName, ...extraLabels].filter(
		(label): label is string => {
			if (typeof label !== 'string') return false;
			const normalized = normalizeGeocodeQuery(label);
			return normalized.length > 0 && normalized !== 'remote';
		}
	);
	return listingGeocodeQuery(labels);
}

/** A listing place is usable when it already has coordinates or names a place. */
export function hasPlaceOrCoordinates(location: PlaceText | null | undefined): boolean {
	if (!location) return false;
	if (hasStoredCoordinates(location)) return true;
	return placeQuery(location) != null;
}

async function lookupForSave(
	query: string
): Promise<{ latitude: number; longitude: number } | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			geocodeWithNominatim(query),
			new Promise<null>((resolve) => {
				timer = setTimeout(() => resolve(null), SAVE_GEOCODE_TIMEOUT_MS);
			})
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}

export async function fillLocationCoordinates<T extends Location>(
	location: T | null | undefined,
	extraLabels: string[] = []
): Promise<T | null | undefined> {
	if (location && hasStoredCoordinates(location)) return location;
	const query = placeQuery(location, extraLabels);
	if (!query) return location;
	const hit = await lookupForSave(query);
	if (!hit) return location;
	if (!location) {
		const displayName = extraLabels.find((label) => label.trim())?.trim() || query;
		return {
			displayName,
			latitude: hit.latitude,
			longitude: hit.longitude,
			zipCode: '',
			locationLoaded: true
		} as T;
	}
	return {
		...location,
		latitude: hit.latitude,
		longitude: hit.longitude,
		locationLoaded: true
	};
}

export async function geocodeTaskForSave(task: TaskBody): Promise<TaskBody> {
	const [pickupLocation, dropOffLocation] = await Promise.all([
		fillLocationCoordinates(task.pickupLocation),
		fillLocationCoordinates(task.dropOffLocation)
	]);
	return {
		...task,
		pickupLocation: pickupLocation ?? undefined,
		dropOffLocation: dropOffLocation ?? undefined
	};
}

export async function geocodeServiceForSave(service: ServiceBody): Promise<ServiceBody> {
	const details = service.locationDetails;
	if (!details) return service;

	const taskee = details.taskeeLocation;
	const [taskerServiceLocation, taskeeServiceLocation] = await Promise.all([
		fillLocationCoordinates(details.taskerLocation?.serviceLocation),
		fillLocationCoordinates(
			taskee?.serviceLocation,
			taskee?.locationDisplayName ? [taskee.locationDisplayName] : []
		)
	]);

	return {
		...service,
		locationDetails: {
			...details,
			taskerLocation: details.taskerLocation
				? {
						...details.taskerLocation,
						serviceLocation: taskerServiceLocation ?? details.taskerLocation.serviceLocation
					}
				: details.taskerLocation,
			taskeeLocation: taskee
				? {
						...taskee,
						serviceLocation: taskeeServiceLocation ?? taskee.serviceLocation,
						locationDisplayName: taskee.locationDisplayName ?? taskeeServiceLocation?.displayName
					}
				: taskee
		}
	};
}
