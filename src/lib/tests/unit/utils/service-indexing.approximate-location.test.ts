import { describe, expect, it } from 'vitest';
import { indexServiceData, filterIndexedServices } from '$lib/utils/service-indexing';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';

describe('service-indexing approximate public location compatibility', () => {
	it('matches text search against an approximate provider location derived from existing location data', () => {
		const indexed = indexServiceData([
			{
				id: 'service-1',
				uniqueId: 'service-1',
				title: 'Home studio recording',
				description: 'Professional voice recording service.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							formattedAddress: '123 Main St, San Salvador, El Salvador',
							addressComponents: {
								city: 'San Salvador',
								country: 'El Salvador'
							}
						}
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 120,
					currency: 'USD'
				},
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedServices(indexed, {
			search: 'san salvador'
		} as never);

		expect(result.services).toHaveLength(1);
		expect(result.services[0]?.id).toBe('service-1');
	});

	it('keeps range-based service matches inside the privacy tolerance buffer', () => {
		const indexed = indexServiceData([
			{
				id: 'service-buffered',
				uniqueId: 'service-buffered',
				title: 'Mobile notary',
				description: 'I travel to nearby clients.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
				locationDetails: {
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Buffered range anchor',
							latitude: 1.03054,
							longitude: 1,
							locationLoaded: true
						},
						serviceRadius: 2
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 120,
					currency: 'USD'
				},
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedServices(indexed, {
			location: '1,1',
			radius: 1
		} as never);

		expect(result.services).toHaveLength(1);
		expect(result.services[0]?.id).toBe('service-buffered');
	});

	it('excludes range-based service matches outside the privacy tolerance buffer', () => {
		const indexed = indexServiceData([
			{
				id: 'service-outside-buffer',
				uniqueId: 'service-outside-buffer',
				title: 'Mobile notary',
				description: 'I travel to nearby clients.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
				locationDetails: {
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Outside buffered range anchor',
							latitude: 1.03234,
							longitude: 1,
							locationLoaded: true
						},
						serviceRadius: 2
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 120,
					currency: 'USD'
				},
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedServices(indexed, {
			location: '1,1',
			radius: 1
		} as never);

		expect(result.services).toHaveLength(0);
	});

	it('treats zero latitude and longitude as valid service coordinates', () => {
		const indexed = indexServiceData([
			{
				id: 'service-zero',
				uniqueId: 'service-zero',
				title: 'Equator storefront',
				description: 'Fixed service at the equator.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							displayName: 'Zero Point',
							latitude: 0,
							longitude: 0,
							locationLoaded: true
						}
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					amount: 50,
					currency: 'USD'
				},
				skills: [],
				categories: []
			} as never
		]);

		const result = filterIndexedServices(indexed, {
			location: 'Zero Point',
			locationCoords: {
				latitude: 0,
				longitude: 0
			},
			radius: 1
		} as never);

		expect(result.services).toHaveLength(1);
		expect(result.services[0]?.id).toBe('service-zero');
	});
});
