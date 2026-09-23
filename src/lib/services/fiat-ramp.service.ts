/**
 * Changelly Fiat Ramp Service — Phase 2
 *
 * Typesafe client wrapper around the CF Worker proxy at `/api/changelly/fiat/*`.
 * The proxy handles RSA-SHA256 signing, rate limiting, and origin validation
 * server-side in the Worker.
 *
 * Every public method is feature-flagged behind `VITE_CHANGELLY_FIAT_ENABLED`.
 * When disabled, all methods throw a descriptive error without making network requests.
 *
 * @see requirements/usdt-integration-plan.md
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isChangellyFiatEnabled } from '$lib/services/feature-flags';
import * as Sentry from '@sentry/sveltekit';

const debug = createDebug('fiat-ramp-service');

// ---------------------------------------------------------------------------
// Concurrency guard
// ---------------------------------------------------------------------------

/** Prevent double-submit of order creation. */
let orderInProgress = false;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Base path for the Changelly fiat API on the NestJS backend.
 * Uses VITE_API_URL (e.g. http://localhost:8000) + /v1/changelly/fiat
 */
const API_URL = import.meta.env.VITE_API_URL || '';
const FIAT_API_BASE = `${API_URL}/api/v1/changelly/fiat`;

/** Cache TTL in milliseconds (5 minutes). */
const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Provider returned by /api/changelly/fiat/providers */
export interface ChangellyProvider {
	code: string;
	name: string;
	trustPilotRating: string;
	iconUrl: string;
}

/** Currency returned by /api/changelly/fiat/currencies */
export interface ChangellyCurrency {
	ticker: string;
	name: string;
	type: 'crypto' | 'fiat';
	extraIdName: string | null;
	iconUrl: string;
	precision: string;
}

/** Country returned by /api/changelly/fiat/countries */
export interface ChangellyCountry {
	code: string;
	name: string;
	states?: ChangellyState[];
}

export interface ChangellyState {
	code: string;
	name: string;
}

/** A single payment method option within an offer */
export interface ChangellyPaymentMethodOffer {
	method: string;
	methodName: string;
	amountExpectedTo: string;
	invertedRate: string;
	fee: string;
}

/** Successful offer with rate data */
export interface ChangellyOfferSuccess {
	providerCode: string;
	rate: string;
	invertedRate: string;
	fee: string;
	amountFrom: string;
	amountExpectedTo: string;
	paymentMethodOffer: ChangellyPaymentMethodOffer[];
	errorType?: undefined;
}

/** Failed offer from a provider */
export interface ChangellyOfferError {
	providerCode: string;
	errorType: string;
	errorMessage: string;
	errorDetails: { cause: string; value: string }[] | null;
	rate?: undefined;
}

export type ChangellyOffer = ChangellyOfferSuccess | ChangellyOfferError;

/** Order created via /api/changelly/fiat/onramp or /offramp */
export interface ChangellyOrder {
	orderId: string;
	externalOrderId: string;
	externalUserId: string;
	providerCode: string;
	currencyFrom: string;
	currencyTo: string;
	amountFrom: string;
	walletAddress: string;
	redirectUrl: string;
	createdAt: string;
}

/** Status values from the Changelly Fiat API */
export type ChangellyTransactionStatus =
	| 'created'
	| 'pending'
	| 'hold'
	| 'complete'
	| 'failed'
	| 'expired'
	| 'refunded';

/** Transaction status response from /api/changelly/fiat/status */
export interface ChangellyTransactionStatusResponse {
	orderId: string;
	externalOrderId: string;
	status: ChangellyTransactionStatus;
	currencyFrom: string;
	currencyTo: string;
	amountFrom: string;
	amountTo: string | null;
	walletAddress: string;
	createdAt: string;
	updatedAt: string;
}

/** Address validation result from /api/changelly/fiat/validate-address */
export interface ChangellyAddressValidation {
	result: boolean;
	cause: 'walletAddress' | 'walletExtraId' | null;
}

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

interface CacheEntry<T> {
	data: T;
	timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

/** Retrieve a cached value if within TTL, otherwise return null. */
function cachedGet<T>(key: string): T | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
		cache.delete(key);
		return null;
	}
	return entry.data as T;
}

/** Store a value in the cache. */
function cachedSet<T>(key: string, data: T): void {
	cache.set(key, { data, timestamp: Date.now() });
}

/** Invalidate all fiat-ramp cache entries. */
function clearCache(): void {
	cache.clear();
	debug.log('Cache cleared');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Guard: throw a descriptive error when the fiat feature flag is disabled.
 */
function requireFiatEnabled(): void {
	if (!isChangellyFiatEnabled()) {
		throw new Error(
			'Changelly fiat ramp is not enabled. ' +
				'Set VITE_CHANGELLY_FIAT_ENABLED=true to use this feature.'
		);
	}
}

/**
 * Check if the client is online. Throws if offline.
 */
function requireOnline(): void {
	if (typeof window !== 'undefined' && !navigator.onLine) {
		throw new Error('Cannot fetch fiat ramp data while offline');
	}
}

/**
 * Generate a unique order/user ID using crypto.randomUUID().
 * Falls back to a timestamp-based string if crypto is unavailable.
 */
function generateId(): string {
	try {
		return crypto.randomUUID();
	} catch {
		// Fallback for environments without crypto.randomUUID
		return `clg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
	}
}

/**
 * Map HTTP status codes to user-friendly error messages.
 */
function mapHttpError(status: number, responseBody: string): string {
	const parsed = tryParseJson<{ message?: string; error?: string }>(responseBody);
	const serverMessage = parsed?.message || parsed?.error || responseBody;

	switch (status) {
		case 400:
			return `Validation error: ${serverMessage}`;
		case 401:
			return 'Authentication failed. Please contact support.';
		case 429:
			return 'Too many requests. Please wait and try again.';
		case 502:
		case 503:
		case 504:
			return `Provider temporarily unavailable: ${serverMessage}`;
		default:
			return serverMessage || `Unexpected error (HTTP ${status})`;
	}
}

/**
 * Safely parse JSON from an unknown string, returning null on failure.
 */
function tryParseJson<T>(text: string): T | null {
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed as T;
	} catch {
		return null;
	}
}

/**
 * Assert that a value is a non-empty string.
 */
function assertString(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`${name} is required and must be a non-empty string`);
	}
}

/**
 * Build URL query parameters from a plain object.
 * Filters out undefined/null values.
 */
function buildQueryParams(params: Record<string, string | undefined>): string {
	const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null) as [
		string,
		string
	][];
	if (entries.length === 0) return '';
	const searchParams = new URLSearchParams(entries);
	return `?${searchParams.toString()}`;
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

/**
 * Perform a GET request to the fiat proxy.
 */
async function getFromProxy<TResponse>(
	path: string,
	params?: Record<string, string | undefined>,
	signal?: AbortSignal
): Promise<TResponse> {
	const queryString = params ? buildQueryParams(params) : '';
	const url = `${FIAT_API_BASE}/${path}${queryString}`;

	debug.log('GET %s', url);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method: 'GET',
			headers: { 'Content-Type': 'application/json' },
			signal
		})
	);

	if (fetchError) {
		if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
			throw fetchError;
		}
		debug.error('GET %s failed: %s', url, fetchError.message);
		throw new Error(`Fiat ramp proxy network error: ${fetchError.message}`);
	}

	if (!response.ok) {
		const errorBody = await readResponseText(response);
		const message = mapHttpError(response.status, errorBody);
		debug.error('GET %s returned %d: %s', url, response.status, message);
		throw new Error(message);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('Failed to parse GET %s response: %s', url, parseError.message);
		throw new Error('Invalid response from fiat ramp proxy');
	}

	return json;
}

/**
 * Perform a POST request to the fiat proxy.
 */
async function postToProxy<TResponse>(
	path: string,
	body: Record<string, unknown>,
	signal?: AbortSignal
): Promise<TResponse> {
	const url = `${FIAT_API_BASE}/${path}`;

	debug.log('POST %s %o', url, body);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
			signal
		})
	);

	if (fetchError) {
		if (fetchError instanceof DOMException && fetchError.name === 'AbortError') {
			throw fetchError;
		}
		debug.error('POST %s failed: %s', url, fetchError.message);
		throw new Error(`Fiat ramp proxy network error: ${fetchError.message}`);
	}

	if (!response.ok) {
		const errorBody = await readResponseText(response);
		const message = mapHttpError(response.status, errorBody);
		debug.error('POST %s returned %d: %s', url, response.status, message);
		throw new Error(message);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('Failed to parse POST %s response: %s', url, parseError.message);
		throw new Error('Invalid response from fiat ramp proxy');
	}

	return json;
}

/**
 * Read the text body of an error response, falling back to status text.
 */
async function readResponseText(response: Response): Promise<string> {
	const { data: body } = await tryCatch<string>(response.text());
	return body || response.statusText || `HTTP ${response.status}`;
}

// ---------------------------------------------------------------------------
// Type guards & helpers
// ---------------------------------------------------------------------------

/**
 * Check if an offer is successful (has rate data).
 */
export function isOfferSuccess(offer: ChangellyOffer): offer is ChangellyOfferSuccess {
	return offer.rate !== undefined;
}

/**
 * Check if an offer is an error (no rate data).
 */
export function isOfferError(offer: ChangellyOffer): offer is ChangellyOfferError {
	return offer.errorType !== undefined;
}

/**
 * Sort successful offers by best expected amount (highest first).
 */
export function sortOffersByBestRate(offers: ChangellyOffer[]): ChangellyOfferSuccess[] {
	return offers
		.filter(isOfferSuccess)
		.sort((a, b) => parseFloat(b.amountExpectedTo) - parseFloat(a.amountExpectedTo));
}

/**
 * Check if a transaction status is terminal (no further changes expected).
 */
export function isTerminalStatus(status: ChangellyTransactionStatus): boolean {
	return ['complete', 'failed', 'expired', 'refunded'].includes(status);
}

/**
 * Check if a transaction status indicates the transaction is still in progress.
 */
export function isPendingStatus(status: ChangellyTransactionStatus): boolean {
	return ['created', 'pending', 'hold'].includes(status);
}

// ---------------------------------------------------------------------------
// Public API: ChangellyFiatService
// ---------------------------------------------------------------------------

/**
 * Typed Changelly Fiat Ramp service.
 *
 * Thin client wrapper around the CF Worker proxy at `/api/changelly/fiat/*`.
 * Every public method checks the `VITE_CHANGELLY_FIAT_ENABLED` feature flag
 * and throws a descriptive error when disabled.
 */
export const changellyFiatService = {
	// ----- Data methods (cached) -----

	/**
	 * List available fiat on/off ramp providers (Moonpay, Banxa, Wert, Transak).
	 * Results are cached for 5 minutes.
	 */
	async getProviders(): Promise<ChangellyProvider[]> {
		requireFiatEnabled();
		requireOnline();

		const cached = cachedGet<ChangellyProvider[]>('providers');
		if (cached) {
			debug.log('Returning cached providers');
			return cached;
		}

		Sentry.addBreadcrumb({ category: 'fiat-ramp', message: 'Fetching providers', level: 'info' });

		const data = await getFromProxy<ChangellyProvider[]>('providers');

		cachedSet('providers', data);
		debug.log('Fetched %d providers', data.length);
		return data;
	},

	/**
	 * List available currencies (fiat and crypto) for fiat on/off ramp.
	 * Optionally filter by type ('crypto' | 'fiat') and/or providerCode.
	 * Results are cached for 5 minutes per parameter combination.
	 */
	async getCurrencies(params?: {
		type?: 'crypto' | 'fiat';
		providerCode?: string;
	}): Promise<ChangellyCurrency[]> {
		requireFiatEnabled();
		requireOnline();

		const cacheKey = `currencies_${params?.type ?? 'all'}_${params?.providerCode ?? 'any'}`;
		const cached = cachedGet<ChangellyCurrency[]>(cacheKey);
		if (cached) {
			debug.log('Returning cached currencies for key: %s', cacheKey);
			return cached;
		}

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Fetching currencies',
			data: params,
			level: 'info'
		});

		const queryParams: Record<string, string | undefined> = {};
		if (params?.type) queryParams.type = params.type;
		if (params?.providerCode) queryParams.providerCode = params.providerCode;

		const data = await getFromProxy<ChangellyCurrency[]>('currencies', queryParams);

		cachedSet(cacheKey, data);
		debug.log('Fetched %d currencies', data.length);
		return data;
	},

	/**
	 * List countries where fiat on/off ramp is available.
	 * Optionally filter by providerCode. Results cached for 5 minutes.
	 */
	async getAvailableCountries(params?: { providerCode?: string }): Promise<ChangellyCountry[]> {
		requireFiatEnabled();
		requireOnline();

		const cacheKey = `countries_${params?.providerCode ?? 'any'}`;
		const cached = cachedGet<ChangellyCountry[]>(cacheKey);
		if (cached) {
			debug.log('Returning cached countries for key: %s', cacheKey);
			return cached;
		}

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Fetching countries',
			data: params,
			level: 'info'
		});

		const queryParams: Record<string, string | undefined> = {};
		if (params?.providerCode) queryParams.providerCode = params.providerCode;

		const data = await getFromProxy<ChangellyCountry[]>('countries', queryParams);

		cachedSet(cacheKey, data);
		debug.log('Fetched %d countries', data.length);
		return data;
	},

	// ----- Quote methods -----

	/**
	 * Get offers from all available fiat providers for a given pair and amount.
	 * Supports AbortSignal for debounced quote fetching.
	 *
	 * @returns Array of offers — use isOfferSuccess/isOfferError to discriminate.
	 */
	async getOffers(
		params: {
			currencyFrom: string;
			currencyTo: string;
			amountFrom: string;
			country: string;
			state?: string;
			ip?: string;
			providerCode?: string;
		},
		signal?: AbortSignal
	): Promise<ChangellyOffer[]> {
		requireFiatEnabled();
		requireOnline();
		assertString(params.currencyFrom, 'currencyFrom');
		assertString(params.currencyTo, 'currencyTo');
		assertString(params.amountFrom, 'amountFrom');
		assertString(params.country, 'country');

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Fetching offers',
			data: {
				currencyFrom: params.currencyFrom,
				currencyTo: params.currencyTo,
				amountFrom: params.amountFrom,
				country: params.country
			},
			level: 'info'
		});

		const queryParams: Record<string, string | undefined> = {
			currencyFrom: params.currencyFrom,
			currencyTo: params.currencyTo,
			amountFrom: params.amountFrom,
			country: params.country,
			state: params.state,
			ip: params.ip,
			providerCode: params.providerCode
		};

		const data = await getFromProxy<ChangellyOffer[]>('offers', queryParams, signal);

		debug.log(
			'Fetched %d offers (%d success, %d errors)',
			data.length,
			data.filter(isOfferSuccess).length,
			data.filter(isOfferError).length
		);
		return data;
	},

	/**
	 * Get sell offers from off-ramp providers (sell crypto for fiat).
	 *
	 * Changelly has a separate endpoint for off-ramp: /v1/sell/offers
	 * (the on-ramp /v1/offers endpoint rejects crypto→fiat pairs).
	 */
	async getSellOffers(
		params: {
			currencyFrom: string;
			currencyTo: string;
			amountFrom: string;
			country: string;
			state?: string;
			ip?: string;
			providerCode?: string;
		},
		signal?: AbortSignal
	): Promise<ChangellyOffer[]> {
		requireFiatEnabled();
		requireOnline();
		assertString(params.currencyFrom, 'currencyFrom');
		assertString(params.currencyTo, 'currencyTo');
		assertString(params.amountFrom, 'amountFrom');
		assertString(params.country, 'country');

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Fetching sell offers',
			data: {
				currencyFrom: params.currencyFrom,
				currencyTo: params.currencyTo,
				amountFrom: params.amountFrom,
				country: params.country
			},
			level: 'info'
		});

		const queryParams: Record<string, string | undefined> = {
			currencyFrom: params.currencyFrom,
			currencyTo: params.currencyTo,
			amountFrom: params.amountFrom,
			country: params.country,
			state: params.state,
			ip: params.ip,
			providerCode: params.providerCode
		};

		const data = await getFromProxy<ChangellyOffer[]>('sell/offers', queryParams, signal);

		debug.log(
			'Fetched %d sell offers (%d success, %d errors)',
			data.length,
			data.filter(isOfferSuccess).length,
			data.filter(isOfferError).length
		);
		return data;
	},

	// ----- Order methods -----

	/**
	 * Create a fiat on-ramp (buy crypto with fiat) order.
	 * Returns order details including the provider's redirectUrl.
	 */
	async createOnRampOrder(params: {
		fiatCurrency: string;
		fiatAmount: string;
		cryptoCurrency: string;
		cryptoAddress: string;
		providerCode: string;
		country: string;
		state?: string;
		paymentMethod?: string;
	}): Promise<ChangellyOrder> {
		if (orderInProgress) {
			throw new Error('Order already in progress. Please wait.');
		}

		requireFiatEnabled();
		requireOnline();
		assertString(params.fiatCurrency, 'fiatCurrency');
		assertString(params.fiatAmount, 'fiatAmount');
		assertString(params.cryptoCurrency, 'cryptoCurrency');
		assertString(params.cryptoAddress, 'cryptoAddress');
		assertString(params.providerCode, 'providerCode');
		assertString(params.country, 'country');

		const externalOrderId = generateId();
		const externalUserId = generateId();

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Creating on-ramp order',
			data: {
				externalOrderId,
				fiatCurrency: params.fiatCurrency,
				fiatAmount: params.fiatAmount,
				cryptoCurrency: params.cryptoCurrency,
				providerCode: params.providerCode,
				country: params.country
			},
			level: 'info'
		});

		const body: Record<string, unknown> = {
			externalOrderId,
			externalUserId,
			providerCode: params.providerCode,
			currencyFrom: params.fiatCurrency.toUpperCase(),
			currencyTo: params.cryptoCurrency.toUpperCase(),
			amountFrom: params.fiatAmount,
			country: params.country,
			walletAddress: params.cryptoAddress
		};
		if (params.state) body.state = params.state;
		if (params.paymentMethod) body.paymentMethod = params.paymentMethod;

		orderInProgress = true;
		try {
			const raw = await postToProxy<{
				redirectUrl: string;
				orderId: string;
				externalOrderId: string;
				externalUserId: string;
				providerCode: string;
				currencyFrom: string;
				currencyTo: string;
				amountFrom: string;
				walletAddress: string;
				createdAt: string;
			}>('orders', body);

			// Map SDK response to ChangellyOrder
			const order: ChangellyOrder = {
				orderId: raw.orderId,
				externalOrderId: raw.externalOrderId,
				externalUserId: raw.externalUserId,
				providerCode: raw.providerCode,
				currencyFrom: raw.currencyFrom,
				currencyTo: raw.currencyTo,
				amountFrom: raw.amountFrom,
				walletAddress: raw.walletAddress,
				redirectUrl: raw.redirectUrl,
				createdAt: raw.createdAt
			};

			Sentry.addBreadcrumb({
				category: 'fiat-ramp',
				message: 'On-ramp order created',
				data: { orderId: order.orderId, externalOrderId },
				level: 'info'
			});

			return order;
		} finally {
			orderInProgress = false;
		}
	},

	/**
	 * Create a fiat off-ramp (sell crypto for fiat) order.
	 * Returns order details including the provider's redirectUrl.
	 */
	async createOffRampOrder(params: {
		cryptoCurrency: string;
		cryptoAmount: string;
		fiatCurrency: string;
		fiatAddress: string;
		providerCode: string;
		country: string;
		state?: string;
		paymentMethod?: string;
	}): Promise<ChangellyOrder> {
		if (orderInProgress) {
			throw new Error('Order already in progress. Please wait.');
		}

		requireFiatEnabled();
		requireOnline();
		assertString(params.cryptoCurrency, 'cryptoCurrency');
		assertString(params.cryptoAmount, 'cryptoAmount');
		assertString(params.fiatCurrency, 'fiatCurrency');
		assertString(params.fiatAddress, 'fiatAddress');
		assertString(params.providerCode, 'providerCode');
		assertString(params.country, 'country');

		const externalOrderId = generateId();
		const externalUserId = generateId();

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Creating off-ramp order',
			data: {
				externalOrderId,
				cryptoCurrency: params.cryptoCurrency,
				cryptoAmount: params.cryptoAmount,
				fiatCurrency: params.fiatCurrency,
				providerCode: params.providerCode,
				country: params.country
			},
			level: 'info'
		});

		const body: Record<string, unknown> = {
			externalOrderId,
			externalUserId,
			providerCode: params.providerCode,
			currencyFrom: params.cryptoCurrency.toUpperCase(),
			currencyTo: params.fiatCurrency.toUpperCase(),
			amountFrom: params.cryptoAmount,
			country: params.country,
			walletAddress: params.fiatAddress
		};
		if (params.state) body.state = params.state;
		if (params.paymentMethod) body.paymentMethod = params.paymentMethod;

		orderInProgress = true;
		try {
			const raw = await postToProxy<{
				redirectUrl: string;
				orderId: string;
				externalOrderId: string;
				externalUserId: string;
				providerCode: string;
				currencyFrom: string;
				currencyTo: string;
				amountFrom: string;
				walletAddress: string;
				createdAt: string;
			}>('orders', body);

			// Map SDK response to ChangellyOrder
			const order: ChangellyOrder = {
				orderId: raw.orderId,
				externalOrderId: raw.externalOrderId,
				externalUserId: raw.externalUserId,
				providerCode: raw.providerCode,
				currencyFrom: raw.currencyFrom,
				currencyTo: raw.currencyTo,
				amountFrom: raw.amountFrom,
				walletAddress: raw.walletAddress,
				redirectUrl: raw.redirectUrl,
				createdAt: raw.createdAt
			};

			Sentry.addBreadcrumb({
				category: 'fiat-ramp',
				message: 'Off-ramp order created',
				data: { orderId: order.orderId, externalOrderId },
				level: 'info'
			});

			return order;
		} finally {
			orderInProgress = false;
		}
	},

	// ----- Status methods -----

	/**
	 * Get the current status of a transaction by its external order ID.
	 */
	async getTransactionStatus(externalOrderId: string): Promise<ChangellyTransactionStatusResponse> {
		requireFiatEnabled();
		requireOnline();
		assertString(externalOrderId, 'externalOrderId');

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Checking transaction status',
			data: { externalOrderId },
			level: 'info'
		});

		const data = await getFromProxy<ChangellyTransactionStatusResponse>('status', {
			externalOrderId
		});

		debug.log('Transaction %s status: %s', externalOrderId, data.status);

		return data;
	},

	// ----- Validation -----

	/**
	 * Validate a wallet address for a given currency.
	 * Returns whether the address is valid and which field caused the issue if invalid.
	 */
	async validateAddress(params: {
		currency: string;
		walletAddress: string;
		walletExtraId?: string;
	}): Promise<ChangellyAddressValidation> {
		requireFiatEnabled();
		requireOnline();
		assertString(params.currency, 'currency');
		assertString(params.walletAddress, 'walletAddress');

		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Validating address',
			data: { currency: params.currency },
			level: 'info'
		});

		const body: Record<string, unknown> = {
			currency: params.currency.toLowerCase(),
			walletAddress: params.walletAddress
		};
		if (params.walletExtraId) body.walletExtraId = params.walletExtraId;

		const result = await postToProxy<ChangellyAddressValidation>('validate-address', body);

		debug.log('Address validation result: %s', result.result ? 'valid' : 'invalid');

		return result;
	},

	// ----- Cache management -----

	/** Clear all in-memory caches for fiat data. */
	invalidateCache(): void {
		clearCache();
		Sentry.addBreadcrumb({
			category: 'fiat-ramp',
			message: 'Cache invalidated',
			level: 'info'
		});
	}
};
