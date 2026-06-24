import { beforeEach, describe, expect, it, vi } from 'vitest';
import { load } from '../../../routes/(app)/services/[serviceId]/+page';
import { readable } from 'svelte/store';
import { findServiceByUniqueId } from '$lib/nostr/service';
import { getServicesBrowseSeo } from '$lib/utils/seo/servicesBrowseSeo';
import { ServiceLocationTypeEnum, ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import type { Service } from '$lib/types/service.d';

vi.mock('$lib/nostr/service', () => ({
	findServiceByUniqueId: vi.fn()
}));

vi.mock('$lib/i18n/i18n', () => ({
	loadNamespace: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		locale: readable('en'),
		_getLocale: () => 'en',
		t: readable((key: string) => key),
		initialized: readable(true),
		store: readable({ locale: 'en' })
	};
});

vi.mock('$lib/utils/network-status', () => ({
	browserNetworkStatus: readable({ online: true, lastTransition: 'initial' })
}));

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
		uniqueId: 'premium-logo-package',
		npub: 'a'.repeat(64),
		title: 'Premium Logo Package',
		description: 'Logo system and brand guide',
		status: 'active',
		serviceLocationTypes: [ServiceLocationTypeEnum.REMOTE],
		locationDetails: {},
		pricing: {
			type: ServicePricingTypeEnum.FIXED,
			currency: 'USD',
			amount: 250
		},
		skills: ['Branding'],
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

describe('services seo integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('keeps canonical, OG, Twitter, and JSON-LD metadata aligned for active services', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(createService());

		const result = (await load({
			params: { serviceId: 'premium-logo-package' },
			parent: () => Promise.resolve({})
		} as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.seo.canonical).toBe('https://bittasker.com/services/premium-logo-package');
		expect(result.seo.ogTitle).toBe(result.seo.title);
		expect(result.seo.twitterTitle).toBe(result.seo.title);
		expect(result.seo.ogDescription).toBe(result.seo.description);
		expect(result.seo.twitterDescription).toBe(result.seo.description);
		expect(result.seo.ogImage).toBe(result.seo.twitterImage);
		expect(result.seo.jsonLd).toMatchObject({
			'@type': 'Service',
			url: result.seo.canonical,
			mainEntityOfPage: result.seo.canonical,
			offers: {
				'@type': 'Offer',
				price: 250,
				priceCurrency: 'USD'
			}
		});
	});

	it('fails closed to noindex metadata when the service cannot be resolved', async () => {
		vi.mocked(findServiceByUniqueId).mockResolvedValue(null);

		const result = (await load({
			params: { serviceId: 'missing-service' },
			parent: () => Promise.resolve({})
		} as Parameters<typeof load>[0])) as ServicePageResult;

		expect(result.seo.canonical).toBe('https://bittasker.com/services/missing-service');
		expect(result.seo.robots).toBe('noindex, follow');
		expect(result.seo.ogTitle).toBe(result.seo.title);
		expect(result.seo.twitterTitle).toBe(result.seo.title);
		expect(result.seo.jsonLd).toBeNull();
	});

	it('keeps browse-route canonical, image, and JSON-LD metadata aligned', () => {
		const result = getServicesBrowseSeo('https://bittasker.com');

		expect(result.canonical).toBe('https://bittasker.com/services');
		expect(result.ogImage).toBe('https://bittasker.com/images/og-task-default.jpg');
		expect(result.title).toBe('Services - BitTasker');
		expect(result.description).toBe('Browse and search for services on BitTasker.');
		expect(result.jsonLd).toMatchObject({
			'@type': 'CollectionPage',
			url: result.canonical,
			mainEntity: {
				'@type': 'ItemList',
				name: 'BitTasker Services'
			}
		});
	});
});
