import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import DashboardServiceCard from '$lib/components/service/DashboardServiceCard.svelte';

const translations: Record<string, string> = {
	'dashboard.services.my_services.pricing_type.from': 'From',
	'dashboard.services.my_services.status_active': 'Active',
	'dashboard.services.my_services.location.tasker_location': 'Tasker Location',
	'dashboard.services.my_services.timing.lead_time': 'Lead Time',
	'dashboard.services.my_services.timing.delivery_time': 'Delivery Time',
	'dashboard.services.my_services.book_now': 'Book Now',
	'dashboard.services.my_services.duration.day': 'day',
	'dashboard.services.my_services.duration.days': 'days',
	'dashboard.services.my_services.duration.week': 'week',
	'dashboard.services.my_services.duration.weeks': 'weeks'
};

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => translations[key] ?? key),
		locale: readable('en')
	};
});

vi.mock('$lib/components/service/ServiceShareButton.svelte', () => ({
	default: () => null
}));

describe('DashboardServiceCard', () => {
	it('shows the lowest tier price, timing rows, and Book Now badge for bookable tiered services', () => {
		const service = {
			id: 'service-1',
			uniqueId: 'service-1',
			title: 'Logo package',
			description: 'Professional logo design packages.',
			status: 'active',
			providerWalletAddress: '0x45aFd3dAdc7CeFcc6c4B6bAf66299da085583361',
			serviceLocationTypes: ['tasker_location'],
			locationDetails: {
				types: ['tasker_location'],
				taskerLocation: {
					serviceLocation: {
						displayName: 'San Salvador, El Salvador'
					}
				}
			},
			instantBuyLeadHours: 48,
			pricing: {
				type: 'TIERED',
				currency: 'USD',
				tiers: [
					{
						id: 'basic',
						name: 'Basic',
						description: 'Basic tier',
						price: 75,
						deliveryTime: {
							value: 3,
							unit: 'day',
							display: '3 days'
						},
						features: []
					},
					{
						id: 'pro',
						name: 'Pro',
						description: 'Pro tier',
						price: 150,
						deliveryTime: {
							value: 1,
							unit: 'week',
							display: '1 week'
						},
						features: []
					}
				]
			}
		};

		const { getByText } = render(DashboardServiceCard, {
			service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getByText('From $75')).toBeTruthy();
		expect(getByText('Lead Time:')).toBeTruthy();
		expect(getByText('2 days')).toBeTruthy();
		expect(getByText('Delivery Time:')).toBeTruthy();
		expect(getByText('3 days')).toBeTruthy();
		expect(getByText('Book Now')).toBeTruthy();
	});
});
