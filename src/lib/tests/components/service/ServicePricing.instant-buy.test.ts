import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';
import ServicePricing from '$lib/components/service/steps/ServicePricing.svelte';

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
					type: 'FIXED',
					currency: 'USDt',
					amount: 125
				},
				instantBuyLeadHours: undefined as number | undefined,
				instantBuyDeliveryHours: undefined as number | undefined
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

describe('ServicePricing instant-buy authoring controls', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hoisted.mockGetCurrentPrice.mockResolvedValue(100_000);
		hoisted.storeState.set({
			service: {
				pricing: {
					type: 'FIXED',
					currency: 'USDt',
					amount: 125
				},
				instantBuyLeadHours: undefined,
				instantBuyDeliveryHours: undefined
			}
		});
	});

	function readStoreState() {
		let currentValue: {
			service: {
				pricing: {
					type: string;
					currency: string;
					amount?: number;
				};
				instantBuyLeadHours?: number;
				instantBuyDeliveryHours?: number;
			};
		} | null = null;
		const unsubscribe = hoisted.storeState.subscribe((value) => {
			currentValue = value;
		});
		unsubscribe();
		return currentValue;
	}

	it('enables instant buy with a deterministic default lead time and allows edits', async () => {
		const { getByTestId } = render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(getByTestId('service-pricing-instant-buy-toggle'));

		await waitFor(() =>
			expect(getByTestId('service-pricing-instant-buy-lead-hours')).toHaveValue(1)
		);
		expect(getByTestId('service-pricing-instant-buy-lead-unit')).toHaveValue('day');

		await fireEvent.input(getByTestId('service-pricing-instant-buy-lead-hours'), {
			target: { value: '2' }
		});
		await fireEvent.change(getByTestId('service-pricing-instant-buy-delivery-unit'), {
			target: { value: 'week' }
		});
		await fireEvent.input(getByTestId('service-pricing-instant-buy-delivery-hours'), {
			target: { value: '1' }
		});

		await waitFor(() =>
			expect(getByTestId('service-pricing-instant-buy-lead-hours')).toHaveValue(2)
		);
		expect(getByTestId('service-pricing-instant-buy-delivery-unit')).toHaveValue('week');
		expect(readStoreState()?.service.instantBuyLeadHours).toBe(48);
		expect(readStoreState()?.service.instantBuyDeliveryHours).toBe(168);
	});

	it('clears instant-buy lead hours when pricing changes to inquiry required', async () => {
		const { getByTestId, getByText, queryByTestId } = render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(getByTestId('service-pricing-instant-buy-toggle'));
		await waitFor(() =>
			expect(getByTestId('service-pricing-instant-buy-lead-hours')).toHaveValue(1)
		);

		await fireEvent.click(getByText('dashboard.services.create.pricing.inquiry_title'));

		await waitFor(() => expect(queryByTestId('service-pricing-instant-buy-toggle')).toBeNull());
		expect(readStoreState()?.service.instantBuyLeadHours).toBeUndefined();
		expect(readStoreState()?.service.pricing.type).toBe('INQUIRY_REQUIRED');
	});

	it('updates fixed pricing from USD and sats inputs', async () => {
		render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.input(document.getElementById('budget-usd') as HTMLInputElement, {
			target: { value: '250' }
		});
		expect(readStoreState()?.service.pricing.amount).toBe(250);

		await fireEvent.input(document.getElementById('budget-sats') as HTMLInputElement, {
			target: { value: '500000' }
		});
		await waitFor(() => expect(readStoreState()?.service.pricing.amount).toBe(500));
		expect(readStoreState()?.service.pricing.currency).toBe('USD');
	});

	it('keeps zeroed sats input deterministic', async () => {
		render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.input(document.getElementById('budget-usd') as HTMLInputElement, {
			target: { value: '99' }
		});
		await fireEvent.input(document.getElementById('budget-sats') as HTMLInputElement, {
			target: { value: '0' }
		});
		await waitFor(() => expect(readStoreState()?.service.pricing.amount).toBe(0));
	});

	it('fails closed for invalid USD input and for pricing initialization without existing pricing', async () => {
		hoisted.storeState.set({
			service: {
				pricing: undefined,
				instantBuyLeadHours: undefined
			}
		});

		const { getByText } = render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(getByText('dashboard.services.create.pricing.tiered_title'));
		expect(readStoreState()?.service.pricing.type).toBe('TIERED');

		await fireEvent.click(getByText('dashboard.services.create.pricing.fixed_title'));
		await fireEvent.input(document.getElementById('budget-usd') as HTMLInputElement, {
			target: { value: 'abc' }
		});
		expect(readStoreState()?.service.pricing.amount).toBe(0);
	});

	it('keeps rendering when the BTC price lookup fails', async () => {
		hoisted.mockGetCurrentPrice.mockRejectedValueOnce(new Error('price offline'));

		render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await waitFor(() => expect(hoisted.mockGetCurrentPrice).toHaveBeenCalledWith('BTC'));
	});

	it('normalizes legacy USDt pricing to USD on mount', async () => {
		render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await waitFor(() => expect(readStoreState()?.service.pricing.currency).toBe('USD'));
	});

	it('converts the displayed Book Now duration when the author changes units', async () => {
		hoisted.storeState.set({
			service: {
				pricing: {
					type: 'FIXED',
					currency: 'USD',
					amount: 125
				},
				instantBuyLeadHours: 48,
				instantBuyDeliveryHours: 168
			}
		});

		const { getByTestId } = render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		expect(getByTestId('service-pricing-instant-buy-lead-unit')).toHaveValue('day');
		expect(getByTestId('service-pricing-instant-buy-lead-hours')).toHaveValue(2);
		expect(getByTestId('service-pricing-instant-buy-delivery-unit')).toHaveValue('week');
		expect(getByTestId('service-pricing-instant-buy-delivery-hours')).toHaveValue(1);
		expect(getByTestId('service-pricing-instant-buy-lead-hours').parentElement).toBe(
			getByTestId('service-pricing-instant-buy-lead-unit').parentElement
		);
		expect(getByTestId('service-pricing-instant-buy-delivery-hours').parentElement).toBe(
			getByTestId('service-pricing-instant-buy-delivery-unit').parentElement
		);

		await fireEvent.change(getByTestId('service-pricing-instant-buy-lead-unit'), {
			target: { value: 'hour' }
		});

		expect(getByTestId('service-pricing-instant-buy-lead-hours')).toHaveValue(48);
		expect(readStoreState()?.service.instantBuyLeadHours).toBe(48);
	});

	it('keeps each Book Now unit dropdown on the same row as its paired input', async () => {
		const { getByTestId } = render(ServicePricing, {
			errors: {},
			direction: 'forward'
		});

		await fireEvent.click(getByTestId('service-pricing-instant-buy-toggle'));

		const leadInput = getByTestId('service-pricing-instant-buy-lead-hours');
		const leadUnit = getByTestId('service-pricing-instant-buy-lead-unit');
		const deliveryInput = getByTestId('service-pricing-instant-buy-delivery-hours');
		const deliveryUnit = getByTestId('service-pricing-instant-buy-delivery-unit');

		expect(leadInput.parentElement?.className).toContain(
			'grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)]'
		);
		expect(leadInput.parentElement).toBe(leadUnit.parentElement);
		expect(deliveryInput.parentElement?.className).toContain(
			'grid-cols-[minmax(0,1fr)_minmax(8.5rem,10rem)]'
		);
		expect(deliveryInput.parentElement).toBe(deliveryUnit.parentElement);
	});
});
