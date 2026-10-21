import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const flag = vi.hoisted(() => ({ enabled: false }));

vi.mock('$lib/services/feature-flags', () => ({
	isChangellyFiatEnabled: () => flag.enabled
}));

import {
	cardPurchaseUnavailable,
	countryChoices,
	createBtcPurchase,
	FALLBACK_FIAT_COUNTRIES,
	FiatRequestError,
	fiatOnrampReady,
	isMainnetBtcAddress,
	preferredCountry,
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

	it('builds the country list from the provider and keeps El Salvador in the fallback', () => {
		const home = ['SV', 'BO', 'CO', 'GT', 'HN', 'CR', 'AR'];
		expect(FALLBACK_FIAT_COUNTRIES.map((row) => row.code)).toEqual(expect.arrayContaining(home));
		const choices = countryChoices([
			{ code: 'sv', name: 'El Salvador' },
			{ code: 'us', name: 'United States' },
			{ code: 'nope', name: 'Not a country' }
		]);
		expect(choices.map((row) => row.code)).toEqual(['SV', 'US']);
		expect(preferredCountry(choices)).toBe('SV');
		expect(preferredCountry(countryChoices([{ code: 'DE', name: 'Germany' }]))).toBe('DE');
	});

	it('treats a missing Fiat API as unavailable and does not quote', async () => {
		expect(cardPurchaseUnavailable(new FiatRequestError('hidden', 'CONFIG_ERROR'))).toBe(true);
		expect(cardPurchaseUnavailable(new Error('Changelly Fiat API is not configured'))).toBe(true);
		expect(cardPurchaseUnavailable(new Error('No card offer'))).toBe(false);
		flag.enabled = true;
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ configured: false }), { status: 200 }))
		);
		await expect(fiatOnrampReady()).resolves.toBe(false);
	});

	it('has English and Spanish copy that does not repeat the raw API sentence', () => {
		const en = JSON.parse(readFileSync('static/locales/en/dashboard/wallet.json', 'utf8')) as {
			wallet: { buy_card: { not_configured: string }; receive_needs_wallet: string };
		};
		const es = JSON.parse(readFileSync('static/locales/es/dashboard/wallet.json', 'utf8')) as {
			wallet: { buy_card: { not_configured: string }; receive_needs_wallet: string };
		};
		expect(en.wallet.buy_card.not_configured).toContain('Card purchases');
		expect(es.wallet.buy_card.not_configured).toContain('tarjeta');
		expect(es.wallet.buy_card.not_configured).not.toBe(en.wallet.buy_card.not_configured);
		expect(en.wallet.buy_card.not_configured.toLowerCase()).not.toContain('changelly fiat api');
		expect(es.wallet.buy_card.not_configured.toLowerCase()).not.toContain('changelly fiat api');
		expect(en.wallet.receive_needs_wallet).toContain('this device');
		expect(es.wallet.receive_needs_wallet).toContain('dispositivo');
	});
});
