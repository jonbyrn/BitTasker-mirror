import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import type { Service } from '$lib/types/service.d';
import { BITTASKER_CANONICAL_BASE } from '$lib/utils/constants/seo.constants';
import { load } from '../../../../routes/(app)/services/[serviceId]/+page';
import { findServiceByUniqueId } from '$lib/nostr/service';

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: vi.fn()
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue({})
}));
/**
 * Mirrors the ServiceSeoPayload defined inside +page.ts so that the test
 * result can be typed without exporting the internal type.
 */
type ServiceSeoPayload = {
	title: string;
	description: string;
	keywords: string;
	canonical: string;
	robots: string;
	ogType: string;
	ogTitle: string;
	ogDescription: string;
	ogImage: string;
	ogImageAlt: string;
	twitterCard: string;
	twitterTitle: string;
	twitterDescription: string;
	twitterImage: string;
	twitterImageAlt: string;
	jsonLd: Record<string, unknown> | null;
};

type ServicePageResult = {
	service: Service | null;
	serviceId: string;
	seo: ServiceSeoPayload;
};

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-unique-id',
		npub: 'b'.repeat(64),
		title: 'Premium Design Service',
		description: 'Detailed design work for your product launch.',
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
				},
				{
					id: 'pro',
					name: 'Pro',
					description: 'Pro package',
					price: 160,
					features: ['Priority support']
				}
			]
		},
		skills: ['Design'],
		categories: [{ id: 'design', name: 'Design', slug: 'design' }],
		portfolio: [{ url: 'https://cdn.example.com/service.jpg', type: 'image/jpeg', alt: 'Service' }],
		createdAt: 1_700_000_000,
		creator: {
			username: 'designer-pro',
			avatar: ''
		},
		...overrides
	} as Service;
}

const canonicalBase = BITTASKER_CANONICAL_BASE.replace(/\/$/, '');

const mockParent = vi
	.fn()
	.mockResolvedValue({ service: null })
	.mockResolvedValue({ service: null }) as unknown as ReturnType<typeof vi.fn> &
	Parameters<typeof load>[0]['parent'];

describe('services/[serviceId] page load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockParent.mockResolvedValue({ service: null });
	});

	it('returns structured service json-ld for a found service', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(createService());

		const result = (await load({
			params: { serviceId: 'service-unique-id' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.serviceId).toBe('service-unique-id');
		expect(result.seo.title).toBe('Premium Design Service - BitTasker');
		expect(result.seo.ogTitle).toBe('Premium Design Service - BitTasker');
		expect(result.seo.twitterTitle).toBe('Premium Design Service - BitTasker');
		expect(result.seo.ogDescription).toBe(result.seo.description);
		expect(result.seo.twitterDescription).toBe(result.seo.description);
		expect(result.seo.ogImage).toBe(result.seo.twitterImage);
		expect(result.seo.robots).toBe('index, follow, max-image-preview:large');
		expect(result.seo.jsonLd).toMatchObject({
			'@context': 'https://schema.org',
			'@type': 'Service',
			'@id': `${canonicalBase}/services/service-unique-id#service`,
			name: 'Premium Design Service',
			url: `${canonicalBase}/services/service-unique-id`,
			mainEntityOfPage: `${canonicalBase}/services/service-unique-id`,
			serviceType: 'Design',
			areaServed: 'Remote',
			provider: {
				'@type': 'Organization',
				name: 'designer-pro'
			},
			offers: {
				'@type': 'AggregateOffer',
				lowPrice: 85,
				highPrice: 160,
				offerCount: 2,
				priceCurrency: 'USD'
			}
		});
	});

	it('falls back to default seo payload when the service is missing', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(null);

		const result = (await load({
			params: { serviceId: 'missing-service' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.service).toBeNull();
		expect(result.serviceId).toBe('missing-service');
		expect(result.seo.jsonLd).toBeNull();
		expect(result.seo.canonical).toBe(`${canonicalBase}/services/missing-service`);
		expect(result.seo.robots).toBe('noindex, follow');
		expect(result.seo.ogTitle).toBe('Service Details - BitTasker');
		expect(result.seo.twitterTitle).toBe('Service Details - BitTasker');
	});

	it('emits a fixed-price offer with provider-location fallback metadata', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(
			createService({
				title: '',
				description: '',
				categories: [],
				portfolio: [
					{
						url: '/images/service-preview.png',
						key: 'img1',
						type: 'image/png',
						alt: 'Preview',
						size: 1024
					},
					{
						url: 'https://cdn.example.com/preview.mp4',
						key: 'vid1',
						type: 'video/mp4',
						alt: 'Preview',
						size: 2048
					}
				],
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					currency: 'USD',
					amount: 120
				},
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {} as never
					}
				},
				creator: {
					username: '',
					avatar: ''
				}
			}) as Service
		);

		const result = (await load({
			params: { serviceId: 'fixed-service' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.seo.description).toBe('No description available');
		expect(result.seo.ogImage).toBe(`${canonicalBase}/images/service-preview.png`);
		expect(result.seo.ogImageAlt).toBe('Untitled Service service preview');
		expect(result.seo.jsonLd).toMatchObject({
			name: 'Untitled Service',
			serviceType: 'Professional service',
			areaServed: 'At provider location',
			provider: {
				name: 'BitTasker provider'
			},
			offers: {
				'@type': 'Offer',
				price: 120,
				priceCurrency: 'USD'
			}
		});
	});

	it('emits an hourly offer with taskee-location metadata and canonical fallback id', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(
			createService({
				uniqueId: '  ' as string,
				pricing: {
					type: ServicePricingTypeEnum.HOURLY,
					currency: 'USD',
					hourlyRate: 75
				},
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKEE_LOCATION],
				locationDetails: {
					taskeeLocation: {
						useGlobalLocation: false,
						locationDisplayName: 'Travels to central Austin'
					}
				}
			})
		);

		const result = (await load({
			params: { serviceId: 'hourly-service' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.serviceId).toBe('hourly-service');
		expect(result.seo.canonical).toBe(`${canonicalBase}/services/hourly-service`);
		expect(result.seo.jsonLd).toMatchObject({
			url: `${canonicalBase}/services/hourly-service`,
			areaServed: 'Travels to central Austin',
			offers: {
				'@type': 'Offer',
				price: 75,
				priceCurrency: 'USD',
				priceSpecification: {
					'@type': 'UnitPriceSpecification',
					price: 75,
					unitText: 'HUR'
				}
			}
		});
	});

	it('omits offers when pricing is inquiry-based or unsupported', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(
			createService({
				pricing: {
					type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
					currency: 'USD'
				},
				serviceLocationTypes: []
			})
		);

		const result = (await load({
			params: { serviceId: 'quote-only-service' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.seo.jsonLd).not.toHaveProperty('offers');
		expect(result.seo.jsonLd).not.toHaveProperty('areaServed');
	});

	it('encodes the canonical url and keeps inactive services out of the index', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(
			createService({
				uniqueId: 'custom service slug',
				status: 'inactive',
				portfolio: [
					{
						url: '//cdn.example.com/service.png',
						type: 'image/png',
						alt: 'Service',
						key: 'k',
						size: 0
					}
				]
			})
		);

		const result = (await load({
			params: { serviceId: 'custom service slug' },
			parent: mockParent
		} as unknown as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.serviceId).toBe('custom service slug');
		expect(result.seo.canonical).toBe(`${canonicalBase}/services/custom%20service%20slug`);
		expect(result.seo.robots).toBe('noindex, follow');
		expect(result.seo.ogImage).toBe('https://cdn.example.com/service.png');
		expect(result.seo.twitterImage).toBe('https://cdn.example.com/service.png');
		expect(result.seo.jsonLd).toMatchObject({
			url: `${canonicalBase}/services/custom%20service%20slug`
		});
	});
});
