import { describe, expect, it } from 'vitest';
import type { Location } from '$lib/types/task.d';
import {
	deriveApproximateLocation,
	sanitizePublicLocation,
	sanitizeTaskForPublicPublish,
	PRIVACY_JITTER_MAX_METERS,
	PRIVACY_JITTER_MIN_METERS
} from '$lib/utils/location/public-location';

const EXACT_LOCATION: Location = {
	displayName: '123 Main St, San Salvador, El Salvador',
	formattedAddress: '123 Main St, San Salvador, El Salvador',
	latitude: 13.6929,
	longitude: -89.2182,
	zipCode: '1101',
	locationLoaded: true,
	placeId: 'place-123',
	addressComponents: {
		streetNumber: '123',
		street: 'Main St',
		city: 'San Salvador',
		state: 'San Salvador',
		country: 'El Salvador',
		postalCode: '1101'
	}
};

function distanceMeters(a: Location, b: Location): number {
	const earthRadiusMeters = 6_371_000;
	const lat1 = (a.latitude! * Math.PI) / 180;
	const lat2 = (b.latitude! * Math.PI) / 180;
	const dLat = ((b.latitude! - a.latitude!) * Math.PI) / 180;
	const dLon = ((b.longitude! - a.longitude!) * Math.PI) / 180;
	const haversine =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
	return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

describe('public-location privacy helpers', () => {
	it('derives a deterministic approximate location for the same entity and exact point', () => {
		const first = deriveApproximateLocation(EXACT_LOCATION, 'service-123', 'tasker');
		const second = deriveApproximateLocation(EXACT_LOCATION, 'service-123', 'tasker');

		expect(second).toEqual(first);
		expect(first.latitude).not.toBe(EXACT_LOCATION.latitude);
		expect(first.longitude).not.toBe(EXACT_LOCATION.longitude);
	});

	it('keeps the approximate point inside the configured privacy ring', () => {
		const approximate = deriveApproximateLocation(EXACT_LOCATION, 'service-123', 'tasker');
		const distance = distanceMeters(EXACT_LOCATION, approximate);

		expect(distance).toBeGreaterThanOrEqual(PRIVACY_JITTER_MIN_METERS);
		expect(distance).toBeLessThanOrEqual(PRIVACY_JITTER_MAX_METERS);
	});

	it('removes exact address fields from approximate public locations while preserving schema compatibility', () => {
		const approximate = sanitizePublicLocation(EXACT_LOCATION, {
			entityId: 'task-123',
			label: 'pickup',
			mode: 'approximate'
		});

		expect(approximate).toMatchObject({
			locationLoaded: true,
			zipCode: ''
		});
		expect(approximate.formattedAddress).toBeUndefined();
		expect(approximate.placeId).toBeUndefined();
		expect(approximate.addressComponents).toBeUndefined();
		expect(approximate.displayName).toBe('San Salvador, San Salvador, El Salvador');
	});

	it('returns the original location unchanged in exact mode', () => {
		const exact = sanitizePublicLocation(EXACT_LOCATION, {
			entityId: 'service-123',
			label: 'tasker',
			mode: 'exact'
		});

		expect(exact).toEqual(EXACT_LOCATION);
	});

	it('sanitizes task locations even when locationLoaded is false or missing', () => {
		const sanitized = sanitizeTaskForPublicPublish(
			{
				title: 'Move a desk',
				description: 'Pickup and dropoff.',
				pickupLocation: {
					...EXACT_LOCATION,
					locationLoaded: false
				},
				dropOffLocation: {
					...EXACT_LOCATION,
					locationLoaded: undefined
				}
			} as never,
			'task-123'
		);

		expect(sanitized.pickupLocation?.formattedAddress).toBeUndefined();
		expect(sanitized.pickupLocation?.placeId).toBeUndefined();
		expect(sanitized.dropOffLocation?.formattedAddress).toBeUndefined();
		expect(sanitized.dropOffLocation?.placeId).toBeUndefined();
		expect(sanitized.pickupLocation?.displayName).toBe('San Salvador, San Salvador, El Salvador');
		expect(sanitized.dropOffLocation?.displayName).toBe('San Salvador, San Salvador, El Salvador');
	});
});
