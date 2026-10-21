/**
 * Browser client for the Changelly fiat on-ramp.
 * Calls the same-origin Worker, which holds the API keys.
 * Gated by VITE_CHANGELLY_FIAT_ENABLED.
 */

import { isChangellyFiatEnabled } from '$lib/services/feature-flags';

const STATUS_PATH = '/api/changelly/fiat/status';
const COUNTRIES_PATH = '/api/changelly/fiat/countries';
const OFFERS_PATH = '/api/changelly/fiat/offers';
const ORDERS_PATH = '/api/changelly/fiat/orders';

/** Home market first, then the rest of Latin America. */
export const LATAM_HOME: FiatCountry[] = [
	{ code: 'SV', name: 'El Salvador' },
	{ code: 'GT', name: 'Guatemala' },
	{ code: 'HN', name: 'Honduras' },
	{ code: 'NI', name: 'Nicaragua' },
	{ code: 'CR', name: 'Costa Rica' },
	{ code: 'PA', name: 'Panama' },
	{ code: 'MX', name: 'Mexico' },
	{ code: 'BZ', name: 'Belize' },
	{ code: 'CO', name: 'Colombia' },
	{ code: 'VE', name: 'Venezuela' },
	{ code: 'EC', name: 'Ecuador' },
	{ code: 'PE', name: 'Peru' },
	{ code: 'BO', name: 'Bolivia' },
	{ code: 'PY', name: 'Paraguay' },
	{ code: 'CL', name: 'Chile' },
	{ code: 'AR', name: 'Argentina' },
	{ code: 'UY', name: 'Uruguay' },
	{ code: 'BR', name: 'Brazil' },
	{ code: 'DO', name: 'Dominican Republic' }
];

const LATAM_RANK = new Map(LATAM_HOME.map((row, index) => [row.code, index]));

/** Shown until the provider answers. El Salvador and Latin America stay in the menu. */
export const FALLBACK_FIAT_COUNTRIES: FiatCountry[] = [
	...LATAM_HOME,
	{ code: 'AU', name: 'Australia' },
	{ code: 'CA', name: 'Canada' },
	{ code: 'FR', name: 'France' },
	{ code: 'DE', name: 'Germany' },
	{ code: 'NL', name: 'Netherlands' },
	{ code: 'ES', name: 'Spain' },
	{ code: 'GB', name: 'United Kingdom' },
	{ code: 'US', name: 'United States' }
];

export interface FiatCountry {
	code: string;
	name: string;
}

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

export class FiatRequestError extends Error {
	readonly code: string;

	constructor(message: string, code = '') {
		super(message);
		this.name = 'FiatRequestError';
		this.code = code;
	}
}

/** The Worker has no Fiat API keys. The page must not quote. */
export function cardPurchaseUnavailable(error: unknown): boolean {
	if (error instanceof FiatRequestError && error.code === 'CONFIG_ERROR') return true;
	const message = error instanceof Error ? error.message : '';
	const lower = message.toLowerCase();
	return lower.includes('not configured') || lower.includes('changelly fiat api');
}

export function countryChoices(provider: FiatCountry[]): FiatCountry[] {
	const source = provider.length > 0 ? [...LATAM_HOME, ...provider] : FALLBACK_FIAT_COUNTRIES;
	const seen = new Set<string>();
	const rows: FiatCountry[] = [];
	for (const row of source) {
		const code = row.code.trim().toUpperCase();
		const name = row.name.trim();
		if (!/^[A-Z]{2}$/.test(code) || !name || seen.has(code)) continue;
		seen.add(code);
		rows.push({ code, name });
	}
	rows.sort((left, right) => {
		const leftRank = LATAM_RANK.get(left.code) ?? 1000;
		const rightRank = LATAM_RANK.get(right.code) ?? 1000;
		if (leftRank !== rightRank) return leftRank - rightRank;
		return left.name.localeCompare(right.name, 'en');
	});
	return rows;
}

/** El Salvador when the menu includes it, otherwise the United States. */
export function preferredCountry(rows: FiatCountry[]): string {
	if (rows.some((row) => row.code === 'SV')) return 'SV';
	if (rows.some((row) => row.code === 'US')) return 'US';
	return rows[0]?.code ?? 'US';
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
		throw new FiatRequestError(
			parsed?.message || 'The card purchase service is unavailable.',
			parsed?.code || ''
		);
	}
	return parsed as T;
}

/** True only when the Worker holds Fiat API keys. The keys are not in this response. */
export async function fiatOnrampReady(): Promise<boolean> {
	const data = await postJson<{ configured?: boolean }>(STATUS_PATH, {});
	return data.configured === true;
}

/** Countries the provider can sell in. An empty answer keeps the fallback list. */
export async function fiatOnrampCountries(): Promise<FiatCountry[]> {
	const data = await postJson<{ countries?: FiatCountry[] }>(COUNTRIES_PATH, {});
	return countryChoices(data.countries ?? []);
}

export function successfulOffers(offers: FiatOffer[]): FiatOffer[] {
	return offers.filter((offer) => {
		const code = offer.providerCode?.trim().toLowerCase();
		if (!code || code === 'transak') return false;
		return !offer.errorType && offer.paymentMethodOffer?.length;
	});
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
