/**
 * Shared pin resolution for /services and /tasks.
 *
 * Remote-only listings with no city, address, or coordinates stay off the map.
 * Every other listing with stored coordinates or a known city/text location gets a pin.
 * The map's default camera (San Salvador, 13.6929, -89.2182) is never used as a pin
 * unless the label is actually that place.
 *
 * Stored coordinates win. The three-city gazetteer is only an offline seed.
 * Other place text is geocoded through Nominatim.
 */

import { listingGeocodeQuery, lookupNominatim } from '$lib/utils/maps/nominatim';

export interface CoordinateInput {
	latitude?: number | null;
	longitude?: number | null;
	displayName?: string | null;
	formattedAddress?: string | null;
}

export interface ListingPlaceInput {
	id: string;
	labels: string[];
	coordinates: CoordinateInput[];
	/** True only when the listing is remote and has no place text or coordinates. */
	remoteOnly: boolean;
}

export interface ListingPoint {
	id: string;
	latitude: number;
	longitude: number;
	source: 'stored' | 'gazetteer' | 'corrected' | 'nominatim';
}

export interface ListingCluster<T> {
	latitude: number;
	longitude: number;
	items: T[];
	count: number;
}

export const MAP_FALLBACK_CENTER = { latitude: 13.6929, longitude: -89.2182 };

const CITY_MATCH_KM = 50;
const FALLBACK_MATCH_KM = 5;

interface GazetteerCity {
	name: string;
	latitude: number;
	longitude: number;
	match: (label: string) => boolean;
}

const GAZETTEER: GazetteerCity[] = [
	{
		name: 'bogota',
		latitude: 4.711,
		longitude: -74.0721,
		match: (label) => /bogot[aá]/i.test(label)
	},
	{
		name: 'la-libertad-sv',
		latitude: 13.4886,
		longitude: -89.3222,
		match: (label) => /la libertad/i.test(label) && /el salvador|\bsv\b/i.test(label)
	},
	{
		name: 'san-salvador',
		latitude: 13.6929,
		longitude: -89.2182,
		match: (label) => /san salvador/i.test(label)
	}
];

function finitePair(
	latitude: number | null | undefined,
	longitude: number | null | undefined
): { latitude: number; longitude: number } | null {
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (Math.abs(latitude as number) > 90 || Math.abs(longitude as number) > 180) return null;
	return { latitude: latitude as number, longitude: longitude as number };
}

/** Swap when latitude is out of range, or when the swap is the valid pair. */
export function normalizeCoordinate(
	latitude: number | null | undefined,
	longitude: number | null | undefined
): { latitude: number; longitude: number } | null {
	if (latitude == null || longitude == null) return null;
	if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
	if (Math.abs(latitude) > 90 && Math.abs(longitude) <= 90) {
		return finitePair(longitude, latitude);
	}
	return finitePair(latitude, longitude);
}

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180;
}

export function distanceKm(
	a: { latitude: number; longitude: number },
	b: { latitude: number; longitude: number }
): number {
	const earthKm = 6371;
	const dLat = toRadians(b.latitude - a.latitude);
	const dLng = toRadians(b.longitude - a.longitude);
	const lat1 = toRadians(a.latitude);
	const lat2 = toRadians(b.latitude);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
	return 2 * earthKm * Math.asin(Math.min(1, Math.sqrt(h)));
}

function matchingCity(labels: string[]): GazetteerCity | null {
	const text = labels.filter(Boolean).join(', ');
	return (
		GAZETTEER.find(
			(city) => labels.some((label) => label && city.match(label)) || city.match(text)
		) ?? null
	);
}

function labelAllowsFallback(labels: string[]): boolean {
	return labels.some((label) => /el salvador|san salvador|la libertad/i.test(label));
}

function bestStoredCoordinate(
	coordinates: CoordinateInput[],
	city: GazetteerCity | null
): { point: { latitude: number; longitude: number }; corrected: boolean } | null {
	for (const coordinate of coordinates) {
		const raw = normalizeCoordinate(coordinate.latitude, coordinate.longitude);
		if (!raw) continue;
		if (
			city &&
			Number.isFinite(coordinate.latitude) &&
			Number.isFinite(coordinate.longitude) &&
			Math.abs(coordinate.longitude as number) <= 90 &&
			Math.abs(coordinate.latitude as number) <= 180
		) {
			const swapped = finitePair(coordinate.longitude, coordinate.latitude);
			if (swapped && distanceKm(swapped, city) + 1 < distanceKm(raw, city)) {
				return { point: swapped, corrected: true };
			}
		}
		return { point: raw, corrected: false };
	}
	return null;
}

function fromNominatim(input: ListingPlaceInput): ListingPoint | null {
	const query = listingGeocodeQuery(input.labels);
	if (!query) return null;
	const hit = lookupNominatim(query);
	if (!hit) return null;
	return {
		id: input.id,
		latitude: hit.latitude,
		longitude: hit.longitude,
		source: 'nominatim'
	};
}

export function resolveListingPoint(input: ListingPlaceInput): ListingPoint | null {
	if (input.remoteOnly) return null;

	const city = matchingCity(input.labels);
	const stored = bestStoredCoordinate(input.coordinates, city);

	if (city) {
		if (!stored) {
			return {
				id: input.id,
				latitude: city.latitude,
				longitude: city.longitude,
				source: 'gazetteer'
			};
		}
		const nearFallback = distanceKm(stored.point, MAP_FALLBACK_CENTER) < FALLBACK_MATCH_KM;
		const farFromCity = distanceKm(stored.point, city) > CITY_MATCH_KM;
		if ((nearFallback && city.name !== 'san-salvador') || farFromCity) {
			return {
				id: input.id,
				latitude: city.latitude,
				longitude: city.longitude,
				source: 'gazetteer'
			};
		}
		return {
			id: input.id,
			latitude: stored.point.latitude,
			longitude: stored.point.longitude,
			source: stored.corrected ? 'corrected' : 'stored'
		};
	}

	if (!stored) return fromNominatim(input);
	const nearFallback = distanceKm(stored.point, MAP_FALLBACK_CENTER) < FALLBACK_MATCH_KM;
	if (nearFallback && !labelAllowsFallback(input.labels)) return fromNominatim(input);
	return {
		id: input.id,
		latitude: stored.point.latitude,
		longitude: stored.point.longitude,
		source: stored.corrected ? 'corrected' : 'stored'
	};
}

export function clusterListingPoints<T extends { latitude: number; longitude: number }>(
	items: T[],
	thresholdDegrees = 0.001
): ListingCluster<T>[] {
	const clusters: ListingCluster<T>[] = [];
	for (const item of items) {
		const existing = clusters.find(
			(cluster) =>
				Math.abs(cluster.latitude - item.latitude) < thresholdDegrees &&
				Math.abs(cluster.longitude - item.longitude) < thresholdDegrees
		);
		if (existing) {
			existing.items.push(item);
			existing.count = existing.items.length;
			continue;
		}
		clusters.push({
			latitude: item.latitude,
			longitude: item.longitude,
			items: [item],
			count: 1
		});
	}
	return clusters;
}

function labelsFromCoordinate(coordinate: CoordinateInput | null | undefined): string[] {
	if (!coordinate) return [];
	return [coordinate.displayName, coordinate.formattedAddress].filter((value): value is string =>
		Boolean(value)
	);
}

function hasResolvablePlace(labels: string[], coordinates: CoordinateInput[]): boolean {
	if (labels.some((label) => label.trim().length > 0)) return true;
	return coordinates.some(
		(coordinate) => normalizeCoordinate(coordinate.latitude, coordinate.longitude) !== null
	);
}

export function serviceToListingPlace(service: {
	id?: string;
	uniqueId?: string;
	serviceLocationTypes?: string[];
	locationDetails?: {
		taskerLocation?: {
			serviceLocation?: CoordinateInput;
			locationDisplayName?: string | null;
		};
		taskeeLocation?: {
			serviceLocation?: CoordinateInput;
			locationDisplayName?: string | null;
		};
	};
}): ListingPlaceInput {
	const tasker = service.locationDetails?.taskerLocation;
	const taskee = service.locationDetails?.taskeeLocation;
	const labels = [
		...labelsFromCoordinate(tasker?.serviceLocation),
		tasker?.locationDisplayName,
		...labelsFromCoordinate(taskee?.serviceLocation),
		taskee?.locationDisplayName
	].filter((value): value is string => Boolean(value));
	const coordinates = [tasker?.serviceLocation, taskee?.serviceLocation].filter(
		(value): value is CoordinateInput => Boolean(value)
	);
	const types = service.serviceLocationTypes ?? [];
	const remoteOnly =
		types.length > 0 &&
		types.every((type) => type === 'remote') &&
		!hasResolvablePlace(labels, coordinates);
	return {
		id: service.uniqueId || service.id || '',
		labels,
		coordinates,
		remoteOnly
	};
}

export function taskToListingPlace(task: {
	id: string;
	taskType?: string;
	pickupLocation?: CoordinateInput | null;
	dropOffLocation?: CoordinateInput | null;
}): ListingPlaceInput {
	const labels = [
		...labelsFromCoordinate(task.pickupLocation),
		...labelsFromCoordinate(task.dropOffLocation)
	];
	const coordinates = [task.pickupLocation, task.dropOffLocation].filter(
		(value): value is CoordinateInput => Boolean(value)
	);
	const remoteOnly = task.taskType === 'remote' && !hasResolvablePlace(labels, coordinates);
	return {
		id: task.id,
		labels,
		coordinates,
		remoteOnly
	};
}

export function resolveServiceMarkers<T extends Parameters<typeof serviceToListingPlace>[0]>(
	services: T[]
): Array<ListingPoint & { item: T }> {
	return services.flatMap((service) => {
		const point = resolveListingPoint(serviceToListingPlace(service));
		return point ? [{ ...point, item: service }] : [];
	});
}

export function resolveTaskMarkers<T extends Parameters<typeof taskToListingPlace>[0]>(
	tasks: T[]
): Array<ListingPoint & { item: T }> {
	return tasks.flatMap((task) => {
		const point = resolveListingPoint(taskToListingPlace(task));
		return point ? [{ ...point, item: task }] : [];
	});
}
