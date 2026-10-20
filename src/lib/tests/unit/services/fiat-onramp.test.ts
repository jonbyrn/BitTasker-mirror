import { afterEach, describe, expect, it, vi } from 'vitest';

const flag = vi.hoisted(() => ({ enabled: false }));

vi.mock('$lib/services/feature-flags', () => ({
	isChangellyFiatEnabled: () => flag.enabled
}));

import {
	createBtcPurchase,
	isMainnetBtcAddress,
	quoteBtcPurchase
} from '$lib/services/fiat-onramp';

const MAINNET = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';

describe('fiat onramp client', () => {
	afterEach(() => {
		flag.enabled = false;
		vi.unstubAllGlobals();
	});

	it('stays quiet while the feature flag is off', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			quoteBtcPurchase({ amountFrom: '50', country: 'US', currencyFrom: 'USD', state: 'CA' })
		).rejects.toThrow(/turned off/);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('asks the worker for BTC offers and drops provider errors', async () => {
		flag.enabled = true;
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					offers: [
						{
							providerCode: 'moonpay',
							rate: '1',
							invertedRate: '1',
							fee: '2',
							amountFrom: '50',
							amountExpectedTo: '0.001',
							paymentMethodOffer: [
								{
									method: 'card',
									methodName: 'Card',
									amountExpectedTo: '0.001',
									fee: '2',
									rate: '1',
									invertedRate: '1'
								}
							]
						},
						{ providerCode: 'wert', errorType: 'unsupportedCountry', errorMessage: 'no' }
					]
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const offers = await quoteBtcPurchase({
			amountFrom: '50',
			country: 'us',
			currencyFrom: 'usd',
			state: 'ca'
		});
		expect(offers).toHaveLength(1);
		expect(offers[0].providerCode).toBe('moonpay');
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('/api/changelly/fiat/offers');
		expect(JSON.parse(String(init.body))).toMatchObject({
			currencyTo: 'BTC',
			country: 'US',
			currencyFrom: 'USD',
			state: 'CA'
		});
	});

	it('refuses a non-mainnet address before creating an order', async () => {
		flag.enabled = true;
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		await expect(
			createBtcPurchase({
				amountFrom: '50',
				country: 'US',
				currencyFrom: 'USD',
				providerCode: 'moonpay',
				walletAddress: 'tb1qsignetaddress',
				externalOrderId: 'order-local-1',
				externalUserId: 'user-local-1'
			})
		).rejects.toThrow(/mainnet/);
		expect(fetchMock).not.toHaveBeenCalled();
		expect(isMainnetBtcAddress(MAINNET)).toBe(true);
	});

	it('posts the user address to the worker order endpoint', async () => {
		flag.enabled = true;
		const fetchMock = vi.fn(async () => {
			return new Response(
				JSON.stringify({
					orderId: 'order-1',
					redirectUrl: 'https://buy.moonpay.com/test',
					walletAddress: MAINNET,
					providerCode: 'moonpay',
					currencyTo: 'BTC',
					amountFrom: '50'
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const order = await createBtcPurchase({
			amountFrom: '50',
			country: 'US',
			currencyFrom: 'USD',
			state: 'CA',
			providerCode: 'moonpay',
			paymentMethod: 'card',
			walletAddress: MAINNET,
			externalOrderId: 'order-local-1',
			externalUserId: 'user-local-1'
		});
		expect(order.redirectUrl).toContain('moonpay');
		const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
		expect(body.walletAddress).toBe(MAINNET);
		expect(body.currencyTo).toBe('BTC');
		expect((fetchMock.mock.calls[0] as [string])[0]).toBe('/api/changelly/fiat/orders');
	});
});
