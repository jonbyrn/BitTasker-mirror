import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const flag = vi.hoisted(() => ({ enabled: false }));

vi.mock('$lib/services/feature-flags', () => ({
	isChangellyFiatEnabled: () => flag.enabled
}));

import {
	cardPurchaseUnavailable,
	billsInUsd,
	countryChoices,
	createBtcPurchase,
	defaultCurrency,
	FALLBACK_FIAT_COUNTRIES,
	FiatRequestError,
	fiatOnrampReady,
	isMainnetBtcAddress,
	preferredCountry,
	quoteProviders,
	quoteBtcPurchase,
	successfulOffers
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
		expect(choices[0]?.code).toBe('SV');
		expect(choices.map((row) => row.code)).toEqual(
			expect.arrayContaining(['SV', 'US', 'GT', 'CR', 'MX', 'CO', 'AR', 'BR'])
		);
		expect(choices.map((row) => row.code)).not.toContain('NOPE');
		expect(preferredCountry(choices)).toBe('SV');
		expect(defaultCurrency('SV')).toBe('USD');
		expect(defaultCurrency('GT')).toBe('USD');
		expect(defaultCurrency('CR')).toBe('USD');
		expect(defaultCurrency('MX')).toBe('MXN');
		expect(defaultCurrency('CO')).toBe('COP');
		expect(defaultCurrency('AR')).toBe('USD');
		expect(defaultCurrency('BR')).toBe('BRL');
		expect(billsInUsd('AR')).toBe(true);
		expect(billsInUsd('SV')).toBe(false);
		expect(choices.find((row) => row.code === 'MX')?.currencies).toEqual(['MXN', 'USD']);
		expect(choices.find((row) => row.code === 'SV')?.currencies).toEqual(['USD']);
		expect(quoteProviders(['transak', 'moonpay'])).toEqual(['moonpay']);
		expect(quoteProviders()).toEqual(['moonpay', 'banxa', 'wert']);
		const narrowed = countryChoices([
			{
				code: 'MX',
				name: 'Mexico',
				providers: ['banxa', 'transak', 'moonpay']
			}
		]);
		expect(narrowed.find((row) => row.code === 'MX')?.providers).toEqual(['banxa', 'moonpay']);
		expect(preferredCountry(countryChoices([{ code: 'DE', name: 'Germany' }]))).toBe('SV');
		expect(
			successfulOffers([
				{
					providerCode: 'transak',
					rate: '1',
					invertedRate: '1',
					fee: '1',
					amountFrom: '50',
					amountExpectedTo: '0.001',
					paymentMethodOffer: [
						{
							method: 'card',
							methodName: 'Card',
							amountExpectedTo: '0.001',
							fee: '1',
							rate: '1',
							invertedRate: '1'
						}
					]
				},
				{
					providerCode: 'moonpay',
					rate: '1',
					invertedRate: '1',
					fee: '1',
					amountFrom: '50',
					amountExpectedTo: '0.001',
					paymentMethodOffer: [
						{
							method: 'card',
							methodName: 'Card',
							amountExpectedTo: '0.001',
							fee: '1',
							rate: '1',
							invertedRate: '1'
						}
					]
				}
			]).map((offer) => offer.providerCode)
		).toEqual(['moonpay']);
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

	it('has copy in every locale that explains Changelly without the raw API sentence', () => {
		const read = (locale: string) =>
			JSON.parse(readFileSync(`static/locales/${locale}/dashboard/wallet.json`, 'utf8')) as {
				wallet: {
					buy_card: { not_configured?: string; usdt: string; back: string; usd_billing: string };
					receive_needs_wallet?: string;
				};
			};
		const en = read('en');
		const es = read('es');
		const fr = read('fr');
		const pt = read('pt');
		const sw = read('sw');
		expect(en.wallet.buy_card.not_configured).toContain('Card purchases');
		expect(es.wallet.buy_card.not_configured).toContain('tarjeta');
		expect(es.wallet.buy_card.not_configured).not.toBe(en.wallet.buy_card.not_configured);
		for (const copy of [en, es, fr, pt, sw]) {
			expect(copy.wallet.buy_card.usdt).toContain('Changelly');
			expect(copy.wallet.buy_card.usdt).toContain('RGB');
			expect(copy.wallet.buy_card.usdt.toLowerCase()).toContain('kyc');
			expect(copy.wallet.buy_card.usdt.toLowerCase()).not.toContain('changelly fiat api');
			expect(copy.wallet.buy_card.back.trim().length).toBeGreaterThan(3);
			expect(copy.wallet.buy_card.usd_billing.trim().length).toBeGreaterThan(3);
		}
		expect(en.wallet.buy_card.usdt.toLowerCase()).toContain('third-party');
		expect(es.wallet.buy_card.usdt.toLowerCase()).toContain('terceros');
		expect(fr.wallet.buy_card.usdt.toLowerCase()).toContain('tiers');
		expect(pt.wallet.buy_card.usdt.toLowerCase()).toContain('terceiros');
		expect(en.wallet.buy_card.back).toContain('wallet');
		expect(es.wallet.buy_card.back).toContain('billetera');
		expect(en.wallet.receive_needs_wallet).toContain('this device');
		expect(es.wallet.receive_needs_wallet).toContain('dispositivo');
	});
});
