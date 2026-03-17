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
							features: []
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
		hoisted.mockGetCurrentPrice.mockResolvedValue(100_000);
	});

	function readTierPrice(tierId: string) {
		let currentValue = 0;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue =
				value.service.pricing.tiers.find((tier: { id: string; price: number }) => tier.id === tierId)
					?.price ?? 0;
		});
		unsubscribe();
		return currentValue;
	}

	it('updates tier pricing from USD and sats inputs through the shared component', async () => {
		render(ServiceTiers, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.input(document.getElementById('tier-price-usd-tier-basic') as HTMLInputElement, {
			target: { value: '300' }
		});
		expect(readTierPrice('tier-basic')).toBe(300);

		await fireEvent.input(
			document.getElementById('tier-price-sats-tier-basic') as HTMLInputElement,
			{
				target: { value: '500000' }
			}
		);

		await waitFor(() => expect(readTierPrice('tier-basic')).toBe(500));
	});
});
