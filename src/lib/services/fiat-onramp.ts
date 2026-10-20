/**
 * Browser client for the Changelly fiat on-ramp.
 * Calls the same-origin Worker, which holds the API keys.
 * Gated by VITE_CHANGELLY_FIAT_ENABLED.
 */

import { isChangellyFiatEnabled } from '$lib/services/feature-flags';

const OFFERS_PATH = '/api/changelly/fiat/offers';
const ORDERS_PATH = '/api/changelly/fiat/orders';

export interface FiatPaymentMethod {
	method: string;
	methodName: string;
	amountExpectedTo: string;
	fee: string;
	rate: string;
	invertedRate: string;
}

export interface FiatOffer {
	providerCode: string;
	rate: string;
	invertedRate: string;
	fee: string;
	amountFrom: string;
	amountExpectedTo: string;
	paymentMethodOffer: FiatPaymentMethod[];
	errorType?: string;
	errorMessage?: string;
}

export interface FiatOrder {
	orderId: string;
	redirectUrl: string;
	walletAddress: string;
	providerCode: string;
	currencyTo: string;
	amountFrom: string;
}

export interface BtcQuoteRequest {
	amountFrom: string;
	country: string;
	currencyFrom: string;
	state?: string;
}

export interface BtcOrderRequest extends BtcQuoteRequest {
	providerCode: string;
	paymentMethod?: string;
	walletAddress: string;
	externalOrderId: string;
	externalUserId: string;
	returnSuccessUrl?: string;
	returnFailedUrl?: string;
}

/** Mainnet Bitcoin addresses only. Signet (tb1) and RGB invoices are rejected. */
export function isMainnetBtcAddress(value: string): boolean {
	if (typeof value !== 'string') return false;
	const address = value.trim();
	if (!address || /\s/.test(address)) return false;
	if (/^bc1[qp][ac-hj-np-z02-9]{38,87}$/.test(address)) return true;
	return /^[13][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address);
}

function requireEnabled(): void {
	if (!isChangellyFiatEnabled()) {
		throw new Error('Buy with card is turned off.');
	}
}

async function postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
	requireEnabled();
	const response = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	const text = await response.text();
	let parsed: { message?: string; code?: string } | null = null;
	try {
		parsed = JSON.parse(text) as { message?: string; code?: string };
	} catch {
		parsed = null;
	}
	if (!response.ok) {
		throw new Error(parsed?.message || 'The card purchase service is unavailable.');
	}
	return parsed as T;
}

export function successfulOffers(offers: FiatOffer[]): FiatOffer[] {
	return offers.filter((offer) => !offer.errorType && offer.paymentMethodOffer?.length);
}

export async function quoteBtcPurchase(request: BtcQuoteRequest): Promise<FiatOffer[]> {
	const payload: Record<string, unknown> = {
		amountFrom: request.amountFrom.trim(),
		country: request.country.trim().toUpperCase(),
		currencyFrom: request.currencyFrom.trim().toUpperCase(),
		currencyTo: 'BTC'
	};
	if (request.state) payload.state = request.state.trim().toUpperCase();
	const data = await postJson<{ offers: FiatOffer[] }>(OFFERS_PATH, payload);
	return successfulOffers(data.offers ?? []);
}

export async function createBtcPurchase(request: BtcOrderRequest): Promise<FiatOrder> {
	if (!isMainnetBtcAddress(request.walletAddress)) {
		throw new Error(
			'Changelly can pay only a mainnet Bitcoin address. This wallet address cannot receive that payout.'
		);
	}
	const payload: Record<string, unknown> = {
		amountFrom: request.amountFrom.trim(),
		country: request.country.trim().toUpperCase(),
		currencyFrom: request.currencyFrom.trim().toUpperCase(),
		currencyTo: 'BTC',
		providerCode: request.providerCode,
		walletAddress: request.walletAddress.trim(),
		externalOrderId: request.externalOrderId,
		externalUserId: request.externalUserId
	};
	if (request.paymentMethod) payload.paymentMethod = request.paymentMethod;
	if (request.state) payload.state = request.state.trim().toUpperCase();
	if (request.returnSuccessUrl) payload.returnSuccessUrl = request.returnSuccessUrl;
	if (request.returnFailedUrl) payload.returnFailedUrl = request.returnFailedUrl;
	return postJson<FiatOrder>(ORDERS_PATH, payload);
}
