import type { ServiceBody } from '$lib/types/service.d';
import type { Location, TaskBody } from '$lib/types/task.d';
import { ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';

export const PRIVACY_JITTER_MIN_METERS = 250;
export const PRIVACY_JITTER_MAX_METERS = 500;
const EARTH_RADIUS_METERS = 6_371_000;

type PublicLocationMode = 'exact' | 'approximate';

function fnv1a32(input: string): number {
	let hash = 0x811c9dc5;
	for (let index = 0; index < input.length; index += 1) {
		hash ^= input.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}

	return hash >>> 0;
}

function seededUnit(seed: string): number {
	return fnv1a32(seed) / 0xffffffff;
}

function toRadians(value: number): number {
	return (value * Math.PI) / 180;
}

function toDegrees(value: number): number {
	return (value * 180) / Math.PI;
}

function deriveCoarseDisplayName(location: Location): string {
	const city = location.addressComponents?.city?.trim();
	const state = location.addressComponents?.state?.trim();
	const country = location.addressComponents?.country?.trim();

	const structured = [city, state, country].filter(
		(value): value is string => typeof value === 'string' && value.length > 0
	);
	if (structured.length > 0) {
		return structured.join(', ');
	}

	const rawDisplay = location.displayName || location.formattedAddress || '';
	const parts = rawDisplay
		.split(',')
		.map((part) => part.trim())
		.filter((part) => part.length > 0);
	if (parts.length > 1) {
		return parts.slice(1).join(', ');
	}

	return rawDisplay.trim().length > 0 ? rawDisplay.trim() : 'Approximate location';
}

export function deriveApproximateLocation(
	location: Location,
	entityId: string,
	label: string
): Location {
	if (location.latitude == null || location.longitude == null) {
		return {
			...location,
			formattedAddress: undefined,
			placeId: undefined,
			addressComponents: undefined,
			zipCode: '',
			displayName: deriveCoarseDisplayName(location)
		};
	}

	const baseSeed = `${entityId}:${label}:${location.latitude}:${location.longitude}`;
	const angle = seededUnit(`${baseSeed}:angle`) * Math.PI * 2;
	const distanceMeters =
		PRIVACY_JITTER_MIN_METERS +
		seededUnit(`${baseSeed}:distance`) * (PRIVACY_JITTER_MAX_METERS - PRIVACY_JITTER_MIN_METERS);

	const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
	const latitudeRad = toRadians(location.latitude);
	const longitudeRad = toRadians(location.longitude);

	const approximateLatitudeRad = Math.asin(
		Math.sin(latitudeRad) * Math.cos(angularDistance) +
			Math.cos(latitudeRad) * Math.sin(angularDistance) * Math.cos(angle)
	);
	const approximateLongitudeRad =
		longitudeRad +
		Math.atan2(
			Math.sin(angle) * Math.sin(angularDistance) * Math.cos(latitudeRad),
			Math.cos(angularDistance) - Math.sin(latitudeRad) * Math.sin(approximateLatitudeRad)
		);

	return {
		...location,
		displayName: deriveCoarseDisplayName(location),
		latitude: Number(toDegrees(approximateLatitudeRad).toFixed(6)),
		longitude: Number(toDegrees(approximateLongitudeRad).toFixed(6)),
		zipCode: '',
		formattedAddress: undefined,
		placeId: undefined,
		addressComponents: undefined
	};
}

export function sanitizePublicLocation(
	location: Location,
	options: {
		entityId: string;
		label: string;
		mode: PublicLocationMode;
	}
): Location {
	if (options.mode === 'exact') {
		return location;
	}

	return deriveApproximateLocation(location, options.entityId, options.label);
}

export function isApproximatePublicLocation(
	location:
		| Pick<
				Location,
				'displayName' | 'formattedAddress' | 'placeId' | 'addressComponents' | 'zipCode'
		  >
		| null
		| undefined
): boolean {
	if (!location?.displayName?.trim()) {
		return false;
	}

	return (
		!location.formattedAddress &&
		!location.placeId &&
		!location.addressComponents &&
		(location.zipCode ?? '') === ''
	);
}

export function sanitizeTaskForPublicPublish(taskData: TaskBody, entityId: string): TaskBody {
	return {
		...taskData,
		pickupLocation: taskData.pickupLocation
			? sanitizePublicLocation(taskData.pickupLocation, {
					entityId,
					label: 'pickup',
					mode: 'approximate'
				})
			: taskData.pickupLocation,
		dropOffLocation: taskData.dropOffLocation
			? sanitizePublicLocation(taskData.dropOffLocation, {
					entityId,
					label: 'dropoff',
					mode: 'approximate'
				})
			: taskData.dropOffLocation
	};
}

export function sanitizeServiceForPublicPublish(
	serviceData: ServiceBody,
	entityId: string
): ServiceBody {
	const isRangeBasedService = serviceData.serviceLocationTypes?.includes(
		ServiceLocationTypeEnum.TASKEE_LOCATION
	);
	if (!isRangeBasedService || !serviceData.locationDetails?.taskeeLocation?.serviceLocation) {
		return serviceData;
	}

	// TASKER_LOCATION remains exact publicly on purpose. In this codebase it represents the
	// provider's fixed/storefront location, while this privacy pass is scoped to the
	// range-based TASKEE_LOCATION flow where the provider travels to the client.

	return {
		...serviceData,
		locationDetails: {
			...serviceData.locationDetails,
			taskeeLocation: {
				...serviceData.locationDetails.taskeeLocation,
				serviceLocation: sanitizePublicLocation(
					serviceData.locationDetails.taskeeLocation.serviceLocation,
					{
						entityId,
						label: 'service-range-base',
						mode: 'approximate'
					}
				),
				locationDisplayName: deriveCoarseDisplayName(
					serviceData.locationDetails.taskeeLocation.serviceLocation
				)
			}
		}
	};
}
