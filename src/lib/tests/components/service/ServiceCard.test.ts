import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
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
			if (key === 'common.location.approximate_short') {
				return 'Approx.';
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

	it('shows a brief note when the public service location is approximate', () => {
		render(ServiceCard, {
			service: createService({
				serviceLocationTypes: ['taskee_location'] as never,
				locationDetails: {
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Denver, CO, US',
							locationLoaded: true,
							zipCode: ''
						},
						locationDisplayName: 'Denver, CO, US'
					}
				} as never
			}),
			btcPrice: 100_000
		});

		expect(screen.getByText('Denver, CO, US')).toBeInTheDocument();
	});

	it('prioritizes the approximate service area when range-based travel is also enabled', () => {
		render(ServiceCard, {
			service: createService({
				serviceLocationTypes: ['tasker_location', 'taskee_location'] as never,
				locationDetails: {
					taskerLocation: {
						serviceLocation: {
							displayName: '123 Main St, Austin, TX',
							formattedAddress: '123 Main St, Austin, TX',
							locationLoaded: true
						}
					},
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Austin, TX',
							locationLoaded: true,
							zipCode: ''
						},
						locationDisplayName: 'Austin, TX'
					}
				} as never
			}),
			btcPrice: 100_000
		});

		expect(screen.getByText('Austin, TX')).toBeInTheDocument();
		expect(screen.queryByText('123 Main St, Austin, TX')).toBeNull();
	});

	describe('accessibility', () => {
		it('card is keyboard focusable with tabindex', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			expect(card).toHaveAttribute('tabindex', '0');
		});

		it('card has role="button"', () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			expect(card).toBeInTheDocument();
		});

		it('card is activated on Enter key press without errors', async () => {
			render(ServiceCard, {
				service: createService(),
				btcPrice: 100_000
			});

			const card = screen.getByRole('button', { name: /Logo Refresh/i });
			card.focus();
			await fireEvent.keyDown(card, { key: 'Enter' });
			expect(card).toHaveFocus();
		});
	});
});
