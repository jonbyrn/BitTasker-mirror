import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ServiceTab from '$lib/components/service/ServiceTab.svelte';
import { ServicePricingTypeEnum, ServiceLocationTypeEnum } from '$lib/utils/enums/service.enum';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
			}
			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: { title: string }) => service.title),
	getServiceDisplayDescription: vi.fn((service: { description: string }) => service.description),
	getServiceDisplayTiers: vi.fn(() => []),
	getServiceDisplayAddOns: vi.fn(() => []),
	getServiceDisplayFaqs: vi.fn(() => [])
}));

vi.mock('$lib/components/service/ServiceShareButton.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/Gallery.svelte', () => ({
	default: () => null
}));

describe('ServiceTab approximate public location display', () => {
	it('prefers an approximate city-level label over the exact formatted address when only address components are available', () => {
		render(ServiceTab, {
			service: {
				id: 'service-1',
				uniqueId: 'service-1',
				title: 'Home studio recording',
				description: 'Professional voice recording service.',
				status: 'active',
				serviceLocationTypes: [ServiceLocationTypeEnum.TASKER_LOCATION],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							displayName: 'San Salvador, El Salvador',
							locationLoaded: true
						}
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					currency: 'USD',
					amount: 120
				},
				skills: [],
				categories: []
			} as never,
			isOwner: false
		});

		expect(screen.getByText('San Salvador, El Salvador')).toBeInTheDocument();
		expect(screen.queryByText('Approx.')).not.toBeInTheDocument();
	});

	it('prioritizes the approximate service area when both fixed and range-based locations are available', () => {
		render(ServiceTab, {
			service: {
				id: 'service-2',
				uniqueId: 'service-2',
				title: 'Mobile tech support',
				description: 'In-shop or on-site.',
				status: 'active',
				serviceLocationTypes: [
					ServiceLocationTypeEnum.TASKER_LOCATION,
					ServiceLocationTypeEnum.TASKEE_LOCATION
				],
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							displayName: '123 Main St, Austin, TX',
							formattedAddress: '123 Main St, Austin, TX',
							locationLoaded: true
						}
					},
					taskeeLocation: {
						locationDisplayName: 'Austin, TX',
						serviceRadius: 5,
						serviceLocation: {
							displayName: 'Austin, TX',
							locationLoaded: true,
							zipCode: ''
						}
					}
				},
				pricing: {
					type: ServicePricingTypeEnum.FIXED,
					currency: 'USD',
					amount: 120
				},
				skills: [],
				categories: []
			} as never,
			isOwner: false
		});

		expect(screen.getByText('Austin, TX')).toBeInTheDocument();
		expect(screen.getByText(/\(5 km\/3.1 mi\)/)).toBeInTheDocument();
		expect(screen.getByText(/\(Approx\.\)/)).toBeInTheDocument();
		expect(screen.queryByText('123 Main St, Austin, TX')).not.toBeInTheDocument();
	});
});
