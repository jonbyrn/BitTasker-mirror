import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ServiceTiers from '$lib/components/service/steps/ServiceTiers.svelte';

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
			update(updater: (currentValue: T) => T) {
				this.set(updater(value));
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
				pricing: {
					type: 'TIERED',
					currency: 'USDt',
					tiers: [
						{
							id: 'tier-basic',
							name: 'Basic',
							description: 'Basic tier',
							price: 125,
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
				}
			}
		}),
		mockGetCurrentPrice: vi.fn()
	};
});

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

vi.mock('$lib/stores/service.store', () => ({
	serviceStore: {
		subscribe: hoisted.storeState.subscribe,
		updateService: (updates: Record<string, unknown>) => {
			hoisted.storeState.update((state) => ({
				...state,
				service: {
					...state.service,
					...updates,
					pricing: {
						...state.service.pricing,
						...((updates.pricing as Record<string, unknown> | undefined) ?? {})
					}
				}
			}));
		}
	}
}));

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getCurrentPrice: (...args: Parameters<typeof hoisted.mockGetCurrentPrice>) =>
			hoisted.mockGetCurrentPrice(...args)
	}
}));

describe('ServiceTiers shared usd/sats input integration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.storeState.set({
			service: {
				pricing: {
					type: 'TIERED',
					currency: 'USDt',
					tiers: [
						{
							id: 'tier-basic',
							name: 'Basic',
							description: 'Basic tier',
							price: 125,
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
				}
			}
		});
		hoisted.mockGetCurrentPrice.mockResolvedValue(100_000);
	});

	function readTierPrice(tierId: string) {
		let currentValue = 0;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue =
				value.service.pricing.tiers.find(
					(tier: { id: string; price: number }) => tier.id === tierId
				)?.price ?? 0;
		});
		unsubscribe();
		return currentValue;
	}

	function readPopularTierIds() {
		let currentValue: string[] = [];
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue = value.service.pricing.tiers
				.filter((tier: { id: string; isPopular?: boolean }) => tier.isPopular)
				.map((tier: { id: string }) => tier.id);
		});
		unsubscribe();
		return currentValue;
	}

	it('updates tier pricing from USD and sats inputs through the shared component', async () => {
		render(ServiceTiers, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.input(
			document.getElementById('tier-price-usd-tier-basic') as HTMLInputElement,
			{
				target: { value: '300' }
			}
		);
		expect(readTierPrice('tier-basic')).toBe(300);

		await fireEvent.input(
			document.getElementById('tier-price-sats-tier-basic') as HTMLInputElement,
			{
				target: { value: '500000' }
			}
		);

		await waitFor(() => expect(readTierPrice('tier-basic')).toBe(500));
	});

	it('allows only one tier to be marked as popular', async () => {
		const { getAllByTitle } = render(ServiceTiers, {
			errors: {},
			direction: 'forward'
		});

		const toggleButtons = getAllByTitle('dashboard.services.create.tiers.toggle_popular');
		expect(toggleButtons[0].className).toContain('text-base-content/40');
		expect(toggleButtons[0]).toHaveAttribute('aria-pressed', 'false');
		expect(toggleButtons[1].className).toContain('text-primary');
		expect(toggleButtons[1]).toHaveAttribute('aria-pressed', 'true');

		await fireEvent.click(toggleButtons[0]);

		expect(readPopularTierIds()).toEqual(['tier-basic']);

		// Clicking the already-popular tier does nothing (must always have one popular)
		await fireEvent.click(getAllByTitle('dashboard.services.create.tiers.toggle_popular')[0]);

		expect(readPopularTierIds()).toEqual(['tier-basic']);
	});

	it('uses single-value delivery and rush delivery controls', async () => {
		const { container, queryByText } = render(ServiceTiers, {
			errors: {},
			direction: 'forward'
		});

		expect(container.textContent).toContain('dashboard.services.create.pricing.btc_price');
		expect(queryByText('dashboard.services.create.tiers.features_label')).toBeNull();

		await fireEvent.click(
			document.getElementById('delivery-time-label-tier-basic')!.querySelector('input')!
		);

		expect(document.getElementById('delivery-value-tier-basic')).toBeTruthy();
		// Unit is now a daisyUI dropdown button, not a native select
		expect(container.querySelector('.dropdown button')).toBeTruthy();
		expect(document.getElementById('delivery-min-tier-basic')).toBeNull();
		expect(document.getElementById('delivery-max-tier-basic')).toBeNull();
		expect(container.textContent).not.toContain('dashboard.services.create.tiers.delivery_display');

		await fireEvent.input(
			document.getElementById('delivery-value-tier-basic') as HTMLInputElement,
			{
				target: { value: '7' }
			}
		);

		let deliveryValue = 0;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			deliveryValue =
				(
					value.service.pricing.tiers.find(
						(tier: { id: string }) => tier.id === 'tier-basic'
					) as unknown as { deliveryTime?: { value: number } }
				)?.deliveryTime?.value ?? 0;
		});
		unsubscribe();
		expect(deliveryValue).toBe(7);

		await fireEvent.click(
			document.getElementById('rush-delivery-label-tier-basic')!.querySelector('input')!
		);

		expect(document.getElementById('rush-value-tier-basic')).toBeTruthy();
		// Unit is now a daisyUI dropdown button, not a native select
		expect(container.querySelectorAll('.dropdown button').length).toBeGreaterThanOrEqual(2);
		expect(document.getElementById('rush-min-tier-basic')).toBeNull();
		expect(document.getElementById('rush-max-tier-basic')).toBeNull();
		expect(container.textContent).not.toContain('dashboard.services.create.tiers.delivery_display');
	});
});
