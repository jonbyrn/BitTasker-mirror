import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import type { Service } from '$lib/types/service.d';
import { ServicePricingTypeEnum } from '$lib/utils/enums/service.enum';
import ServiceCard from '$lib/components/service/ServiceCard.svelte';

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => {
			if (key === 'dashboard.services.browse.quote') {
				return 'Quote';
			}
			if (key === 'dashboard.services.browse.view') {
				return 'View';
			}
			if (key === 'dashboard.services.browse.pricing.request_quote') {
				return 'Request Quote';
			}
			if (key === 'dashboard.services.browse.pricing.inquiry_required') {
				return 'Request Quote';
			}
			return key;
		}),
		locale: readable('en')
	};
});

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$lib/utils/serviceDisplayTranslation', () => ({
	getServiceDisplayTitle: vi.fn((service: Service) => service.title),
	getServiceDisplayDescription: vi.fn((service: Service) => service.description)
}));

vi.mock('$lib/components/Avatar.svelte', () => ({
	default: () => null
}));

vi.mock('$lib/components/service/ServiceShareButton.svelte', () => ({
	default: () => null
}));

function createService(overrides: Partial<Service> = {}): Service {
	return {
		id: 'service-event-1',
		uniqueId: 'service-123',
		npub: 'a'.repeat(64),
		status: 'active',
		title: 'Logo Refresh',
		description: 'Clean up an outdated brand mark.',
		serviceLocationTypes: [],
		pricing: {
			type: ServicePricingTypeEnum.INQUIRY_REQUIRED,
			currency: 'USDt'
		},
		skills: [],
		categories: [],
		portfolio: [],
		createdAt: 1_700_000_000,
		creator: {
			username: 'Designer',
			avatar: ''
		},
		...overrides
	} as Service;
}

describe('ServiceCard', () => {
	it('shows the quote button for inquiry-required services when requests are allowed', () => {
		render(ServiceCard, {
			service: createService(),
			btcPrice: 100_000,
			onRequestQuote: vi.fn()
		});

		expect(screen.getByRole('button', { name: 'Quote' })).toBeTruthy();
	});

	it('hides the quote button for inquiry-required services when requests are blocked', () => {
		render(ServiceCard, {
			service: createService(),
			btcPrice: 100_000,
			onRequestQuote: vi.fn(),
			canRequestQuote: false
		});

		expect(screen.queryByRole('button', { name: 'Quote' })).toBeNull();
		expect(screen.getByRole('button', { name: 'View' })).toBeTruthy();
	});
});
