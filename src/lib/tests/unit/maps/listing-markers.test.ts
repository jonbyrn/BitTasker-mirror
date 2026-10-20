import { describe, expect, it } from 'vitest';
import {
	clusterListingPoints,
	resolveListingPoint,
	serviceToListingPlace,
	taskToListingPlace
} from '$lib/utils/maps/listing-markers';

describe('listing markers', () => {
	it('pins a city-only service such as La Libertad, El Salvador', () => {
		const point = resolveListingPoint(
			serviceToListingPlace({
				id: 'svc-1',
				serviceLocationTypes: ['tasker_location'],
				locationDetails: {
					taskerLocation: {
						locationDisplayName: 'La Libertad, El Salvador',
						serviceLocation: {
							displayName: 'La Libertad, El Salvador',
							latitude: null,
							longitude: null
						}
					}
				}
			})
		);
		expect(point?.source).toBe('gazetteer');
		expect(point?.latitude).toBeCloseTo(13.4886, 3);
		expect(point?.longitude).toBeCloseTo(-89.3222, 3);
	});

	it('leaves remote-only services with no place off the map', () => {
		const point = resolveListingPoint(
			serviceToListingPlace({
				id: 'svc-remote',
				serviceLocationTypes: ['remote']
			})
		);
		expect(point).toBeNull();
	});

	it('pins a remote service that still names a city', () => {
		const point = resolveListingPoint(
			serviceToListingPlace({
				id: 'svc-remote-city',
				serviceLocationTypes: ['remote'],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							displayName: 'La Libertad, El Salvador',
							latitude: null,
							longitude: null
						}
					}
				}
			})
		);
		expect(point).not.toBeNull();
	});

	it('uses Bogotá instead of the San Salvador fallback for a Bogotá task', () => {
		const point = resolveListingPoint(
			taskToListingPlace({
				id: 'task-bogota',
				taskType: 'onsite',
				pickupLocation: {
					displayName: 'Bogotá, Bogotá, Colombia',
					latitude: 13.6929,
					longitude: -89.2182
				}
			})
		);
		expect(point?.latitude).toBeCloseTo(4.711, 3);
		expect(point?.longitude).toBeCloseTo(-74.0721, 3);
	});

	it('corrects swapped latitude and longitude when the city is known', () => {
		const point = resolveListingPoint(
			taskToListingPlace({
				id: 'task-swapped',
				pickupLocation: {
					displayName: 'Bogotá, Colombia',
					latitude: -74.0721,
					longitude: 4.711
				}
			})
		);
		expect(point?.source).toBe('corrected');
		expect(point?.latitude).toBeCloseTo(4.711, 3);
		expect(point?.longitude).toBeCloseTo(-74.0721, 3);
	});

	it('keeps a remote task with no place off the map and pins one that has coordinates', () => {
		expect(
			resolveListingPoint(
				taskToListingPlace({
					id: 'remote',
					taskType: 'remote'
				})
			)
		).toBeNull();
		const point = resolveListingPoint(
			taskToListingPlace({
				id: 'remote-coord',
				taskType: 'remote',
				pickupLocation: { displayName: 'Medellín', latitude: 6.2476, longitude: -75.5658 }
			})
		);
		expect(point?.latitude).toBeCloseTo(6.2476, 3);
	});

	it('accepts latitude 0 and clusters overlapping pins with a count', () => {
		const equator = resolveListingPoint({
			id: 'equator',
			labels: ['Gulf'],
			coordinates: [{ latitude: 0, longitude: 0 }],
			remoteOnly: false
		});
		expect(equator?.latitude).toBe(0);
		const clusters = clusterListingPoints([
			{ latitude: 4.711, longitude: -74.0721, id: 'a' },
			{ latitude: 4.71105, longitude: -74.0721, id: 'b' },
			{ latitude: 6.2, longitude: -75.5, id: 'c' }
		]);
		expect(clusters).toHaveLength(2);
		expect(clusters[0].count).toBe(2);
	});
});
