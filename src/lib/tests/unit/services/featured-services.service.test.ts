import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeaturedServicesService } from '$lib/services/featuredServices.service';
import { findServices } from '$lib/nostr/findServices';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import type { Service } from '$lib/types/service.d';

vi.mock('$lib/nostr/findServices', () => ({
	findServices: vi.fn()
}));

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'featured-service-1',
		npub: 'b'.repeat(64),
		title: 'Featured Service',
		description: 'Featured description',
		status: 'active',
		serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
		locationDetails: {},
		pricing: {
			type: ServicePricingTypeEnum.TIERED,
			currency: 'USD',
			tiers: [
				{
					id: 'basic',
					name: 'Basic',
					description: 'Basic package',
					price: 85,
					features: ['One revision']
				}
			]
		},
		skills: ['Design'],
		categories: [{ id: 'design', name: 'Design', slug: 'design' }],
		portfolio: [{ url: 'https://cdn.example.com/service.jpg', type: 'image/jpeg', alt: 'Service' }],
		createdAt: 1_700_000_000,
		creator: {
			username: 'designer',
			avatar: ''
		},
		...overrides
	} as Service;
}

describe('FeaturedServicesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		FeaturedServicesService.clearCache();
	});

	it('converts active services into homepage cards with pricing and location meta', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [createService()],
			total: 1,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(8);

		expect(findServices).toHaveBeenCalledWith({
			limit: 24,
			page: 1,
			sortBy: 'date'
		});
		expect(result.success).toBe(true);
		expect(result.services).toEqual([
			expect.objectContaining({
				id: 'service-event-1',
				href: '/services/featured-service-1',
				title: 'Featured Service',
				priceLabel: 'From $85.00',
				meta: [],
				location: 'Remote',
				ctaLabel: 'View Service'
			})
		]);
	});

	it('url-encodes canonical hrefs and accepts localized labels', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [
				createService({
					id: 'service-encoded',
					uniqueId: 'brand sprint / premium',
					serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION]
				})
			],
			total: 1,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(8, {
			locale: 'es',
			labels: {
				requestQuoteLabel: 'Solicitar Cotizacion',
				serviceListingLabel: 'Listado de servicio',
				remoteLabel: 'Remoto',
				atProviderLocationLabel: 'En la ubicacion del proveedor',
				travelsToYouLabel: 'Se desplaza hasta ti',
				viewServiceLabel: 'Ver Servicio'
			}
		});

		expect(result.success).toBe(true);
		expect(result.services[0]).toEqual(
			expect.objectContaining({
				href: '/services/brand%20sprint%20%2F%20premium',
				ctaLabel: 'Ver Servicio',
				meta: [],
				location: 'Se desplaza hasta ti'
			})
		);
	});

	it('filters inactive services and caps the result set to the requested limit', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [
				createService({ id: 'service-1', uniqueId: 'service-1', createdAt: 10 }),
				createService({ id: 'service-2', uniqueId: 'service-2', createdAt: 20 }),
				createService({
					id: 'service-3',
					uniqueId: 'service-3',
					status: 'inactive',
					createdAt: 30
				})
			],
			total: 3,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(1);

		expect(result.success).toBe(true);
		expect(result.services).toHaveLength(1);
		expect(result.services[0].href).toBe('/services/service-2');
	});

	it('filters deleted services and keeps the best homepage candidate per route identity', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [
				createService({
					id: 'older-duplicate',
					uniqueId: 'shared-service',
					createdAt: 10,
					portfolio: []
				}),
				createService({
					id: 'deleted-service',
					uniqueId: 'deleted-service',
					createdAt: 50,
					isDeleted: true
				}),
				createService({
					id: 'newer-duplicate',
					uniqueId: 'shared-service',
					createdAt: 40,
					portfolio: [
						{
							url: 'https://cdn.example.com/preferred.jpg',
							type: 'image/jpeg',
							alt: 'Preferred',
							key: 'k',
							size: 0
						}
					]
				}),
				createService({
					id: 'deleted-at-service',
					uniqueId: 'deleted-at-service',
					createdAt: 60,
					deletedAt: 1_700_000_100
				}),
				createService({
					id: 'fallback-id-service',
					uniqueId: '   ',
					createdAt: 30
				})
			],
			total: 5,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(8);

		expect(result.success).toBe(true);
		expect(result.services).toHaveLength(2);
		expect(result.services[0]).toEqual(
			expect.objectContaining({
				id: 'newer-duplicate',
				href: '/services/shared-service',
				image: 'https://cdn.example.com/preferred.jpg'
			})
		);
		expect(result.services[1]).toEqual(
			expect.objectContaining({
				id: 'fallback-id-service',
				href: '/services/fallback-id-service'
			})
		);
	});

	it('formats fixed, hourly, and inquiry-required pricing deterministically', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [
				createService({
					id: 'fixed-service',
					uniqueId: 'fixed-service',
					pricing: {
						type: ServicePricingTypeEnum.FIXED,
						currency: 'USD',
						amount: 99.5
					}
				}),
				createService({
					id: 'hourly-service',
					uniqueId: 'hourly-service',
					pricing: {
						type: ServicePricingTypeEnum.HOURLY,
						currency: 'USD',
						hourlyRate: 75
					}
				}),
				createService({
					id: 'quote-service',
					uniqueId: 'quote-service',
					pricing: {
						type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
						currency: 'USD'
					}
				})
			],
			total: 3,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(3);

		expect(result.success).toBe(true);
		expect(result.services.map((service) => service.priceLabel)).toEqual([
			'$99.50',
			'$75.00/hr',
			'Request Quote'
		]);
	});

	it('falls back to location-specific labels and service-listing meta when needed', async () => {
		vi.mocked(findServices).mockResolvedValue({
			services: [
				createService({
					id: 'tasker-location-service',
					uniqueId: 'tasker-location-service',
					serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
					locationDetails: {
						taskerLocation: {
							serviceLocation: {
								displayName: 'Downtown Studio'
							} as never
						}
					}
				}),
				createService({
					id: 'taskee-location-service',
					uniqueId: 'taskee-location-service',
					serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
					locationDetails: {
						taskeeLocation: {
							useGlobalLocation: false,
							locationDisplayName: 'Travels across Austin'
						}
					}
				}),
				createService({
					id: 'meta-fallback-service',
					uniqueId: 'meta-fallback-service',
					serviceLocationTypes: [],
					pricing: undefined
				})
			],
			total: 3,
			hasMore: false
		});

		const result = await FeaturedServicesService.getFeaturedServices(3);

		expect(result.success).toBe(true);
		expect(result.services[0].meta).toEqual([]);
		expect(result.services[0].location).toBe('Downtown Studio');
		expect(result.services[1].meta).toEqual([]);
		expect(result.services[1].location).toBe('Travels across Austin');
		expect(result.services[2].meta).toEqual([]);
		expect(result.services[2].location).toBeUndefined();
		expect(result.services[2].priceLabel).toBe('Request Quote');
	});

	it('fails gracefully with error info when discovery throws', async () => {
		vi.mocked(findServices).mockRejectedValue(new Error('relay unavailable'));

		const result = await FeaturedServicesService.getFeaturedServices(8);

		expect(result.success).toBe(false);
		expect(result.error).toBe('relay unavailable');
		expect(result.services).toEqual([]);
	});
});
