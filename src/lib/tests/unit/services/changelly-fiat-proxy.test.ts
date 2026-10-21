import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
	handleChangellyFiatRoute,
	isMainnetBtcAddress,
	resetChangellyFiatProxyState,
	signFiatRequest
} from '../../../../../workers-site/handlers/changelly-fiat.js';

const MAINNET = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const SIGNET = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';

type FetchCall = { url: string; init: RequestInit };

let publicPem = '';
let privatePem = '';
let privatePkcs1Pem = '';
let publicKey: CryptoKey;

function pem(label: string, bytes: Uint8Array): string {
	const body = Buffer.from(bytes).toString('base64');
	const lines = body.match(/.{1,64}/g)?.join('\n') ?? body;
	return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
}

function readDerLength(bytes: Uint8Array, offset: number): { length: number; size: number } {
	const first = bytes[offset];
	if (first < 0x80) return { length: first, size: 1 };
	const count = first & 0x7f;
	let length = 0;
	for (let i = 0; i < count; i += 1) length = (length << 8) | bytes[offset + 1 + i];
	return { length, size: 1 + count };
}

function pkcs1FromPkcs8(pkcs8: Uint8Array): Uint8Array {
	let offset = 1 + readDerLength(pkcs8, 1).size;
	const version = readDerLength(pkcs8, offset + 1);
	offset += 1 + version.size + version.length;
	const algorithm = readDerLength(pkcs8, offset + 1);
	offset += 1 + algorithm.size + algorithm.length;
	const key = readDerLength(pkcs8, offset + 1);
	offset += 1 + key.size;
	return pkcs8.slice(offset, offset + key.length);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
	return bytes;
}

function env() {
	return {
		CHANGELLY_FIAT_API_KEY: 'public-api-key',
		CHANGELLY_FIAT_API_SECRET: privatePem
	};
}

function request(path: string, body: unknown, ip = '203.0.113.8'): Request {
	return new Request(`https://rgb.bittasker.com${path}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'CF-Connecting-IP': ip,
			Origin: 'https://rgb.bittasker.com'
		},
		body: JSON.stringify(body)
	});
}

describe('Changelly fiat proxy', () => {
	beforeAll(async () => {
		const pair = await crypto.subtle.generateKey(
			{
				name: 'RSASSA-PKCS1-v1_5',
				modulusLength: 2048,
				publicExponent: new Uint8Array([1, 0, 1]),
				hash: 'SHA-256'
			},
			true,
			['sign', 'verify']
		);
		publicKey = pair.publicKey;
		const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
		const spki = new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey));
		privatePem = pem('PRIVATE KEY', pkcs8);
		privatePkcs1Pem = pem('RSA PRIVATE KEY', pkcs1FromPkcs8(pkcs8));
		publicPem = pem('PUBLIC KEY', spki);
	});

	afterEach(() => {
		resetChangellyFiatProxyState();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('signs the exact URL and body with RSA-SHA256', async () => {
		const url = 'https://fiat-api.changelly.com/v1/offers?amountFrom=50&currencyTo=BTC';
		const signature = await signFiatRequest(privatePem, url, '{}');
		const ok = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64ToBytes(signature),
			new TextEncoder().encode(`${url}{}`)
		);
		expect(ok).toBe(true);
		expect(signature).not.toContain('PRIVATE');
	});

	it('accepts a PKCS#1 PEM, including one stored with escaped newlines', async () => {
		const url = 'https://fiat-api.changelly.com/v1/validate-address';
		const body = JSON.stringify({ currency: 'BTC', walletAddress: MAINNET });
		const signature = await signFiatRequest(privatePkcs1Pem.replace(/\n/g, '\\n'), url, body);
		const ok = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64ToBytes(signature),
			new TextEncoder().encode(url + body)
		);
		expect(ok).toBe(true);
		expect(publicPem.includes('PUBLIC KEY')).toBe(true);
	});

	it('refuses to call Changelly when the secrets are missing or placeholders', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const missing = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/offers', {
				amountFrom: '50',
				country: 'US',
				state: 'CA',
				currencyFrom: 'USD',
				currencyTo: 'BTC'
			}),
			{}
		);
		expect(missing.status).toBe(503);
		const placeholder = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/offers', {
				amountFrom: '50',
				country: 'US',
				state: 'CA',
				currencyFrom: 'USD',
				currencyTo: 'BTC'
			}),
			{ CHANGELLY_FIAT_API_KEY: 'dev-placeholder', CHANGELLY_FIAT_API_SECRET: 'dev-placeholder' }
		);
		expect(placeholder.status).toBe(503);
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('quotes BTC with a signed GET and keeps the private key off the wire', async () => {
		const calls: FetchCall[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(
				JSON.stringify({
					offers: [
						{
							providerCode: 'moonpay',
							amountExpectedTo: '0.001',
							fee: '1.50',
							rate: '0.00002',
							invertedRate: '50000',
							amountFrom: '50',
							paymentMethodOffer: [
								{
									method: 'card',
									methodName: 'Card',
									amountExpectedTo: '0.001',
									fee: '1.50',
									rate: '0.00002',
									invertedRate: '50000'
								}
							]
						}
					]
				}),
				{ status: 200 }
			);
		});

		const response = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/offers', {
				amountFrom: '50',
				country: 'US',
				state: 'CA',
				currencyFrom: 'USD',
				currencyTo: 'BTC'
			}),
			env()
		);
		expect(response.status).toBe(200);
		const payload = (await response.json()) as { offers: { providerCode: string }[] };
		expect(payload.offers[0].providerCode).toBe('moonpay');
		expect(calls).toHaveLength(1);
		expect(calls[0].url).toContain('https://fiat-api.changelly.com/v1/offers?');
		expect(calls[0].url).toContain('currencyTo=BTC');
		expect(calls[0].url).toContain('ip=203.0.113.8');
		expect(calls[0].init.method).toBe('GET');
		const headers = new Headers(calls[0].init.headers);
		expect(headers.get('X-Api-Key')).toBe('public-api-key');
		expect(headers.get('X-Api-Signature')).toBeTruthy();
		expect(calls[0].url).not.toContain(privatePem);
		expect(JSON.stringify(calls[0].init.headers)).not.toContain('BEGIN');
		const verified = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64ToBytes(headers.get('X-Api-Signature') || ''),
			new TextEncoder().encode(`${calls[0].url}{}`)
		);
		expect(verified).toBe(true);
	});

	it('rejects a USDT payout before calling Changelly', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/offers', {
				amountFrom: '50',
				country: 'NL',
				currencyFrom: 'EUR',
				currencyTo: 'USDT'
			}),
			env()
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { code: string };
		expect(body.code).toBe('USDT_NOT_RGB');
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('creates an order only for the caller mainnet address', async () => {
		const calls: FetchCall[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			calls.push({ url: String(url), init });
			if (String(url).endsWith('/v1/validate-address')) {
				return new Response(JSON.stringify({ result: true, cause: null }), { status: 200 });
			}
			const sent = JSON.parse(String(init.body));
			return new Response(
				JSON.stringify({
					orderId: 'order-1',
					redirectUrl: 'https://buy.moonpay.com/changelly?test=1',
					walletAddress: sent.walletAddress,
					providerCode: sent.providerCode,
					currencyTo: sent.currencyTo,
					amountFrom: sent.amountFrom
				}),
				{ status: 200 }
			);
		});

		const response = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/orders', {
				amountFrom: '50.00',
				country: 'US',
				state: 'CA',
				currencyFrom: 'USD',
				currencyTo: 'BTC',
				providerCode: 'moonpay',
				paymentMethod: 'card',
				walletAddress: MAINNET,
				externalOrderId: 'order-local-1',
				externalUserId: 'user-local-1',
				returnSuccessUrl: 'https://rgb.bittasker.com/wallet?buy=success',
				returnFailedUrl: 'https://evil.example/steal',
				ip: '198.51.100.9'
			}),
			env()
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { redirectUrl: string; walletAddress: string };
		expect(body.walletAddress).toBe(MAINNET);
		expect(body.redirectUrl).toContain('moonpay');
		expect(calls).toHaveLength(2);
		const order = JSON.parse(String(calls[1].init.body));
		expect(order.walletAddress).toBe(MAINNET);
		expect(order.currencyTo).toBe('BTC');
		expect(order.ip).toBe('203.0.113.8');
		expect(order.returnSuccessUrl).toBe('https://rgb.bittasker.com/wallet?buy=success');
		expect(order.returnFailedUrl).toBeUndefined();
		const headers = new Headers(calls[1].init.headers);
		const verified = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64ToBytes(headers.get('X-Api-Signature') || ''),
			new TextEncoder().encode(calls[1].url + String(calls[1].init.body))
		);
		expect(verified).toBe(true);
		expect(JSON.stringify(body)).not.toContain('BEGIN');
	});

	it('does not create an order for a signet address', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/orders', {
				amountFrom: '50',
				country: 'NL',
				currencyFrom: 'EUR',
				currencyTo: 'BTC',
				providerCode: 'moonpay',
				walletAddress: SIGNET,
				externalOrderId: 'order-local-2',
				externalUserId: 'user-local-2'
			}),
			env()
		);
		expect(response.status).toBe(400);
		const body = (await response.json()) as { code: string };
		expect(body.code).toBe('ADDRESS_NETWORK');
		expect(fetchMock).not.toHaveBeenCalled();
		expect(isMainnetBtcAddress(MAINNET)).toBe(true);
		expect(isMainnetBtcAddress(SIGNET)).toBe(false);
	});

	it('reports whether the Fiat API is configured without returning the keys', async () => {
		const fetchMock = vi.fn();
		vi.stubGlobal('fetch', fetchMock);
		const missing = await handleChangellyFiatRoute(request('/api/changelly/fiat/status', {}), {});
		expect(missing.status).toBe(200);
		const missingBody = (await missing.json()) as { configured: boolean };
		expect(missingBody).toEqual({ configured: false });
		expect(JSON.stringify(missingBody)).not.toMatch(/PRIVATE|secret|placeholder/i);

		const ready = await handleChangellyFiatRoute(request('/api/changelly/fiat/status', {}), env());
		expect(await ready.json()).toEqual({ configured: true });
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('lists the countries the provider supports', async () => {
		const calls: FetchCall[] = [];
		vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
			calls.push({ url: String(url), init });
			return new Response(
				JSON.stringify([
					{ code: 'US', name: 'United States', states: [{ code: 'CA', name: 'California' }] },
					{ code: 'sv', name: 'El Salvador' },
					{ code: 'XX', name: '' },
					{ country: 'BO', countryName: 'Bolivia' }
				]),
				{ status: 200 }
			);
		});
		const response = await handleChangellyFiatRoute(
			request('/api/changelly/fiat/countries', {}),
			env()
		);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { countries: { code: string; name: string }[] };
		expect(body.countries.map((row) => row.code)).toEqual(['BO', 'SV', 'US']);
		expect(calls[0].url).toBe('https://fiat-api.changelly.com/v1/available-countries');
		expect(calls[0].init.method).toBe('GET');
		expect(JSON.stringify(body)).not.toContain('BEGIN');
		expect(JSON.stringify(body)).not.toContain('public-api-key');
		const headers = new Headers(calls[0].init.headers);
		const verified = await crypto.subtle.verify(
			'RSASSA-PKCS1-v1_5',
			publicKey,
			base64ToBytes(headers.get('X-Api-Signature') || ''),
			new TextEncoder().encode(`${calls[0].url}{}`)
		);
		expect(verified).toBe(true);
	});
});
