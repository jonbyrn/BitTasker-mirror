import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import ServiceReview from '$lib/components/service/steps/ServiceReview.svelte';

const translations: Record<string, string> = {
	'dashboard.services.create.review.description': 'Review your service before publishing.',
	'dashboard.services.create.review.basics_title': 'Service Details',
	'dashboard.services.create.review.tiers_title': 'Pricing Tiers',
	'dashboard.services.create.review.tiers_label': 'Tiers',
	'dashboard.services.create.review.tiers_count': 'tiers',
	'dashboard.services.create.review.tier_no_name': 'Unnamed tier',
	'dashboard.services.create.review.title_label': 'Title',
	'dashboard.services.create.review.description_label': 'Description',
	'dashboard.services.create.review.categories_label': 'Categories',
	'dashboard.services.create.review.skills_label': 'Skills',
	'dashboard.services.create.review.location_types_label': 'Location Types',
	'dashboard.services.create.review.book_now_label': 'Book Now',
	'dashboard.services.create.review.book_now_lead_time':
		'Lead time before service starts: {hours} hours',
	'dashboard.services.create.review.book_now_delivery_time': 'Delivery time: {hours} hours',
	'dashboard.services.create.review.not_set': 'Not set',
	'dashboard.services.create.pricing.fixed_title': 'Fixed Price',
	'dashboard.services.create.pricing.hour': 'hour',
	'dashboard.services.create.location.taskee_title': 'At Tasker location',
	'dashboard.services.create.tiers.popular': 'Popular'
};

const hoisted = vi.hoisted(() => {
	function createStore<T>(initialValue: T) {
		let value = initialValue;
		const subscribers = new Set<(nextValue: T) => void>();

		return {
			set(nextValue: T) {
				value = nextValue;
				for (const subscriber of subscribers) {
					subscriber(value);
				}
			},
			subscribe(subscriber: (nextValue: T) => void) {
				subscriber(value);
				subscribers.add(subscriber);
				return () => subscribers.delete(subscriber);
			}
		};
	}

	return {
		storeState: createStore({
			service: {
				title: 'Launch audit',
				description: 'Review deployment setup and go-live checklist.',
				categories: [{ id: 'devops', name: 'DevOps', slug: 'devops' }],
				skills: ['CI/CD'],
				serviceLocationTypes: ['taskee_location'],
				locationDetails: {
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Austin, TX',
							latitude: 30.2672,
							longitude: -97.7431,
							zipCode: '78701',
							locationLoaded: true
						},
						serviceRadius: 25
					}
				},
				pricing: {
					type: 'FIXED',
					currency: 'USD',
					amount: 100
				},
				instantBuyLeadHours: 24,
				instantBuyDeliveryHours: 48,
				portfolio: [],
				faqs: []
			}
		}),
		mockGetCurrentPrice: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string, options?: { values?: Record<string, string | number> }) => {
			const template = translations[key] ?? key;
			return template.replace(/\{(\w+)\}/g, (_, name) => String(options?.values?.[name] ?? ''));
		})
	};
});

vi.mock('$lib/stores/service.store', () => ({
	serviceStore: {
		subscribe: hoisted.storeState.subscribe
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
}));

describe('ServiceReview', () => {
	beforeEach(() => {
		hoisted.mockGetCurrentPrice.mockResolvedValue(100_000);
		hoisted.storeState.set({
			service: {
				title: 'Launch audit',
				description: 'Review deployment setup and go-live checklist.',
				categories: [{ id: 'devops', name: 'DevOps', slug: 'devops' }],
				skills: ['CI/CD'],
				serviceLocationTypes: ['taskee_location'],
				locationDetails: {
					taskeeLocation: {
						serviceLocation: {
							displayName: 'Austin, TX',
							latitude: 30.2672,
							longitude: -97.7431,
							zipCode: '78701',
							locationLoaded: true
						},
						serviceRadius: 25
					}
				},
				pricing: {
					type: 'FIXED',
					currency: 'USD',
					amount: 100
				},
				instantBuyLeadHours: 24,
				instantBuyDeliveryHours: 48,
				portfolio: [],
				faqs: []
			}
		});
	});

	it('renders service details pricing and book now information in the primary details card', () => {
		const { getAllByText, getByText, queryByText } = render(ServiceReview, {
			errors: {},
			direction: 'forward'
		});

		expect(getByText('Service Details')).toBeTruthy();
		expect(getByText('Fixed Price')).toBeTruthy();
		expect(getByText('$100')).toBeTruthy();
		expect(getByText(/Location Types/)).toBeTruthy();
		expect(getAllByText(/At Tasker location/)).toHaveLength(2);
		expect(getByText('Austin, TX')).toBeTruthy();
		expect(getByText('25 km')).toBeTruthy();
		expect(getByText(/Book Now/)).toBeTruthy();
		expect(getByText('Lead time before service starts: 24 hours')).toBeTruthy();
		expect(getByText('Delivery time: 48 hours')).toBeTruthy();
		expect(queryByText('Pricing Type')).toBeNull();
		expect(queryByText('Amount')).toBeNull();
	});

	it('uses a primary border for popular tiers in the review step', () => {
		hoisted.storeState.set({
			service: {
				title: 'Launch audit',
				description: 'Review deployment setup and go-live checklist.',
				categories: [],
				skills: [],
				serviceLocationTypes: [],
				locationDetails: {},
				pricing: {
					type: 'TIERED',
					currency: 'USD',
					tiers: [
						{
							id: 'tier-basic',
							name: 'Basic',
							description: 'Basic tier',
							price: 100,
							features: []
						},
						{
							id: 'tier-pro',
							name: 'Pro',
							description: 'Pro tier',
							price: 250,
							features: [],
							isPopular: true
						}
					]
				},
				portfolio: [],
				faqs: []
			}
		});

		const { getByText } = render(ServiceReview, {
			errors: {},
			direction: 'forward'
		});

		const popularBadge = getByText('Popular');
		const popularCard = popularBadge.closest('.collapse');

		expect(popularCard?.className).toContain('border-primary');
		expect(popularCard?.className).toContain('border-2');
		expect(popularCard?.className).not.toContain('border-base-300');
	});
});
