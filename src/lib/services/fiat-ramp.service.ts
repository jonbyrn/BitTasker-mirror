/**
 * Changelly Fiat Ramp Service — Phase 2.5.3
 *
 * Thin client wrapper that calls the CF Worker proxy endpoint at
 * `/api/changelly/fiat/*`. The actual Changelly Fiat SDK
 * (`@changelly/fiat-api-sdk-node`) runs server-side in the Worker — the
 * client only posts serialised request bodies and receives typed responses.
 *
 * Every method is feature-flagged behind `VITE_CHANGELLY_FIAT_ENABLED`.
 * When the flag is `false` all methods return a disabled error immediately
 * without making any network request.
 *
 * @see requirements/usdt-integration-plan.md §2.5.3
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isChangeallyFiatEnabled } from '$lib/services/kill-switch';

const debug = createDebug('fiat-ramp-service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base path for the Changelly fiat proxy on the CF Worker. */
const FIAT_PROXY_BASE = '/api/changelly/fiat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Parameters for creating a fiat on-ramp (buy crypto with fiat).
 */
export interface FiatOnRampParams {
	/** Fiat currency code (e.g. "usd", "eur") */
	fiatCurrency: string;
	/** Amount in fiat currency as a decimal string */
	fiatAmount: string;
	/** Target crypto currency ticker (e.g. "usdt") */
	cryptoCurrency: string;
	/** Destination wallet address for the purchased crypto */
	cryptoAddress: string;
	/** Optional URL to redirect the user after the ramp completes */
	redirectUrl?: string;
}

/**
 * Parameters for creating a fiat off-ramp (sell crypto for fiat).
 */
export interface FiatOffRampParams {
	/** Source crypto currency ticker (e.g. "usdt") */
	cryptoCurrency: string;
	/** Amount in crypto currency as a decimal string */
	cryptoAmount: string;
	/** Target fiat currency code (e.g. "usd") */
	fiatCurrency: string;
	/** Destination fiat account identifier (IBAN, routing number, etc.) */
	fiatAddress: string;
	/** Optional URL to redirect the user after the ramp completes */
	redirectUrl?: string;
}

/**
 * Status values for a fiat transaction.
 */
export type FiatTransactionStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * A fiat on-ramp or off-ramp transaction.
 */
export interface FiatTransaction {
	/** Unique transaction identifier from Changelly */
	id: string;
	/** Current transaction status */
	status: FiatTransactionStatus;
	/** Fiat currency code */
	fiatCurrency: string;
	/** Amount in fiat currency */
	fiatAmount: string;
	/** Crypto currency ticker */
	cryptoCurrency: string;
	/** Amount in crypto currency */
	cryptoAmount: string;
	/** Wallet address involved */
	walletAddress: string;
	/** ISO 8601 creation timestamp */
	createdAt: string;
	/** ISO 8601 last update timestamp */
	updatedAt: string;
}

/**
 * Error response returned when the fiat feature flag is disabled.
 */
export interface FiatDisabledError {
	code: 'FIAT_DISABLED';
	message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Post a JSON body to a Changelly fiat proxy endpoint.
 *
 * @param path - The endpoint path (appended to FIAT_PROXY_BASE)
 * @param body - The JSON-serialisable request body
 * @returns The parsed JSON response
 * @throws {Error} If the network request fails or returns a non-OK status
 */
async function postToProxy<TResponse>(
	path: string,
	body: Record<string, unknown>
): Promise<TResponse> {
	const url = `${FIAT_PROXY_BASE}/${path}`;

	debug.log('POST %s', url);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body)
		})
	);

	if (fetchError) {
		debug.error('Network request failed: %s', fetchError.message);
		throw new Error(`Fiat ramp proxy network error: ${fetchError.message}`);
	}

	if (!response.ok) {
		const errorBody = await parseErrorBody(response);
		debug.error('Proxy returned %d: %s', response.status, errorBody);
		throw new Error(errorBody);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('Failed to parse response: %s', parseError.message);
		throw new Error('Invalid response from fiat ramp proxy');
	}

	return json;
}

/**
 * Attempt to parse an error response body from the proxy.
 * Falls back to the HTTP status text.
 */
async function parseErrorBody(response: Response): Promise<string> {
	const { data: body } = await tryCatch<string>(response.text());
	if (body) {
		try {
			const parsed = JSON.parse(body) as { message?: string; error?: string };
			return parsed.message || parsed.error || body;
		} catch {
			return body;
		}
	}
	return response.statusText || `HTTP ${response.status}`;
}

/**
 * Guard: throw a descriptive error when the fiat feature flag is disabled.
 */
function requireFiatEnabled(): void {
	if (!isChangeallyFiatEnabled()) {
		throw new Error(
			'Changelly fiat ramp is not enabled. ' +
				'Set VITE_CHANGELLY_FIAT_ENABLED=true to use this feature.'
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Changelly Fiat Ramp service.
 *
 * Thin client wrapper around the CF Worker proxy at `/api/changelly/fiat/*`.
 * Every public method checks the `VITE_CHANGELLY_FIAT_ENABLED` feature flag
 * and throws a descriptive error when disabled.
 */
export const fiatRampService = {
	/**
	 * Create a fiat on-ramp transaction (buy USDT/crypto with fiat currency).
	 *
	 * @param params - On-ramp parameters
	 * @returns The created fiat transaction
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async createOnRamp(params: FiatOnRampParams): Promise<FiatTransaction> {
		requireFiatEnabled();

		const { fiatCurrency, fiatAmount, cryptoCurrency, cryptoAddress, redirectUrl } = params;

		if (!fiatCurrency || !fiatAmount || !cryptoCurrency || !cryptoAddress) {
			throw new Error(
				'createOnRamp requires fiatCurrency, fiatAmount, cryptoCurrency, and cryptoAddress'
			);
		}

		return postToProxy<FiatTransaction>('onramp', {
			fiatCurrency: fiatCurrency.toLowerCase(),
			fiatAmount,
			cryptoCurrency: cryptoCurrency.toLowerCase(),
			cryptoAddress,
			...(redirectUrl ? { redirectUrl } : {})
		});
	},

	/**
	 * Create a fiat off-ramp transaction (sell USDT/crypto for fiat currency).
	 *
	 * @param params - Off-ramp parameters
	 * @returns The created fiat transaction
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async createOffRamp(params: FiatOffRampParams): Promise<FiatTransaction> {
		requireFiatEnabled();

		const { cryptoCurrency, cryptoAmount, fiatCurrency, fiatAddress, redirectUrl } = params;

		if (!cryptoCurrency || !cryptoAmount || !fiatCurrency || !fiatAddress) {
			throw new Error(
				'createOffRamp requires cryptoCurrency, cryptoAmount, fiatCurrency, and fiatAddress'
			);
		}

		return postToProxy<FiatTransaction>('offramp', {
			cryptoCurrency: cryptoCurrency.toLowerCase(),
			cryptoAmount,
			fiatCurrency: fiatCurrency.toLowerCase(),
			fiatAddress,
			...(redirectUrl ? { redirectUrl } : {})
		});
	},

	/**
	 * Get the current status of a fiat transaction.
	 *
	 * @param id - The transaction ID returned by createOnRamp or createOffRamp
	 * @returns The current transaction state
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async getTransactionStatus(id: string): Promise<FiatTransaction> {
		requireFiatEnabled();

		if (!id) {
			throw new Error('getTransactionStatus requires a transaction ID');
		}

		return postToProxy<FiatTransaction>('status', { id });
	}
};
