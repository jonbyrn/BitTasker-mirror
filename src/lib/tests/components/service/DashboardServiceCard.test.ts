import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import DashboardServiceCard from '$lib/components/service/DashboardServiceCard.svelte';

const translations: Record<string, string> = {
	'dashboard.services.my_services.pricing_type.from': 'From',
	'dashboard.services.my_services.pricing_type.quote_required': 'Quote required',
	'dashboard.services.my_services.pricing_type.fixed': 'Fixed',
	'dashboard.services.my_services.pricing_type.tiered': 'Tiered',
	'dashboard.services.my_services.status_active': 'Active',
	'dashboard.services.my_services.location.remote': 'Remote',
	'dashboard.services.my_services.location.my_location': 'My Location',
	'dashboard.services.my_services.location.tasker_location': 'Tasker Location',
	'dashboard.services.my_services.timing.lead_time': 'Lead Time',
	'dashboard.services.my_services.timing.delivery_time': 'Delivery Time',
	'dashboard.services.my_services.book_now': 'Book Now',
	'dashboard.services.my_services.duration.day': 'day',
	'dashboard.services.my_services.duration.days': 'days',
	'dashboard.services.my_services.duration.week': 'week',
	'dashboard.services.my_services.duration.weeks': 'weeks',
	'common.location.approximate_short': 'Approx.'
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
			npub: 'a'.repeat(64),
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
			skills: [],
			categories: [],
			createdAt: 1,
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
			service: service as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getByText('From')).toBeTruthy();
		expect(getByText('$75.00')).toBeTruthy();
		expect(getByText('Lead Time:')).toBeTruthy();
		expect(getByText('2 days')).toBeTruthy();
		expect(getByText('Delivery Time:')).toBeTruthy();
		expect(getByText('3 days')).toBeTruthy();
		expect(getByText('Book Now')).toBeTruthy();
	});

	it('shows a fallback location label for inquiry-only services that only define serviceLocationTypes', () => {
		const service = {
			id: 'service-2',
			uniqueId: 'service-2',
			npub: 'a'.repeat(64),
			title: 'On-site troubleshooting',
			description: 'Send details and I will quote the visit.',
			status: 'active',
			serviceLocationTypes: ['taskee_location'],
			locationDetails: {
				taskeeLocation: {
					useGlobalLocation: false
				}
			},
			skills: [],
			categories: [],
			createdAt: 1,
			pricing: {
				type: 'INQUIRY_REQUIRED',
				currency: 'USD'
			}
		};

		const { getAllByText, queryByText } = render(DashboardServiceCard, {
			service: service as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getAllByText('Tasker Location')).toHaveLength(1);
		expect(queryByText('My Location')).toBeNull();
	});

	it('renders the top-level serviceLocationTypes through the main location line when locationDetails.types is absent', () => {
		const service = {
			id: 'service-3',
			uniqueId: 'service-3',
			npub: 'a'.repeat(64),
			title: 'Remote audit',
			description: 'Remote accessibility review.',
			status: 'active',
			serviceLocationTypes: ['remote', 'tasker_location'],
			skills: [],
			categories: [],
			createdAt: 1,
			locationDetails: {
				taskerLocation: {
					serviceLocation: {
						displayName: 'San Salvador, El Salvador'
					}
				}
			},
			pricing: {
				type: 'INQUIRY_REQUIRED',
				currency: 'USD'
			}
		};

		const { getByText, queryByText } = render(DashboardServiceCard, {
			service: service as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getByText('San Salvador, El Salvador')).toBeTruthy();
		expect(queryByText('My Location')).toBeNull();
	});

	it('prioritizes the approximate service area when a service supports both fixed and range-based locations', () => {
		const service = {
			id: 'service-mixed',
			uniqueId: 'service-mixed',
			npub: 'a'.repeat(64),
			title: 'Hybrid repair',
			description: 'Storefront and mobile support.',
			status: 'active',
			skills: [],
			categories: [],
			createdAt: 1,
			serviceLocationTypes: ['tasker_location', 'taskee_location'],
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
				type: 'INQUIRY_REQUIRED',
				currency: 'USD'
			}
		};

		const { getByText, queryByText } = render(DashboardServiceCard, {
			service: service as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getByText('Austin, TX')).toBeTruthy();
		expect(getByText(/\(5 km\/3\.1 mi\)/)).toBeTruthy();
		expect(queryByText('123 Main St, Austin, TX')).toBeNull();
	});

	it('renders the contracts action with a clickable icon path', async () => {
		const actionSpy = vi.fn();
		const service = {
			id: 'service-4',
			uniqueId: 'service-4',
			npub: 'a'.repeat(64),
			title: 'Brand sprint',
			description: 'Fast identity package.',
			status: 'active',
			skills: [],
			categories: [],
			createdAt: 1,
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: {
				type: 'INQUIRY_REQUIRED',
				currency: 'USD'
			}
		};

		const { getByRole } = render(DashboardServiceCard, {
			service: service as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [
				{
					label: 'Contracts',
					class: 'btn-outline btn-sm',
					onclick: actionSpy,
					icon: 'contracts'
				}
			],
			btcPrice: 100000
		});

		const contractsButton = getByRole('button', { name: 'Contracts' });
		await fireEvent.click(contractsButton);

		expect(actionSpy).toHaveBeenCalledTimes(1);
		expect(contractsButton.querySelector('svg')).not.toBeNull();
	});

	it('shows the Book Now badge for eligible fixed-price services and hides it when the provider wallet is missing', () => {
		const eligibleService = {
			id: 'service-5',
			uniqueId: 'service-5',
			title: 'Resume review',
			description: 'Fixed-price resume review.',
			status: 'active',
			providerWalletAddress: '0x45aFd3dAdc7CeFcc6c4B6bAf66299da085583361',
			serviceLocationTypes: ['remote'],
			instantBuyLeadHours: 24,
			instantBuyDeliveryHours: 72,
			pricing: {
				type: 'FIXED',
				currency: 'USD',
				amount: 125
			}
		};

		const { getByText, unmount } = render(DashboardServiceCard, {
			service: eligibleService as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(getByText('Book Now')).toBeTruthy();
		unmount();

		const missingWalletService = {
			...eligibleService,
			id: 'service-6',
			uniqueId: 'service-6',
			providerWalletAddress: undefined
		};

		const withoutWallet = render(DashboardServiceCard, {
			service: missingWalletService as unknown as import('$lib/types/service').Service,
			getActionButtons: () => [],
			btcPrice: 100000
		});

		expect(withoutWallet.queryByText('Book Now')).toBeNull();
	});
});
