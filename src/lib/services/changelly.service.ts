/**
 * Changelly Swap API Service — Phase 2.5.1
 *
 * Client-side wrapper for the Changelly v2 swap API.
 * Does NOT call Changelly directly from the client. Instead, it posts to the
 * NestJS backend proxy at `/api/v1/changelly/swap/*`, which handles
 * HMAC-SHA256 signing, origin validation, rate limiting, and error filtering.
 *
 * All estimation methods are pure — they fetch data but produce no side effects
 * on the server. Mutation methods (createSwap) are idempotent at the backend level.
 *
 * @see requirements/usdt-integration-plan.md §2.5.1
 * @see requirements/usdt-integration-plan.md §Proxy implementation requirements
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';

const debug = createDebug('changelly-service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Base path for the Changelly swap API on the NestJS backend.
 * Uses VITE_API_URL (e.g. http://localhost:8000) + /api/v1/changelly/swap
 */
const API_URL = import.meta.env.VITE_API_URL || '';
const SWAP_PROXY_BASE = `${API_URL}/api/v1/changelly/swap`;

// ---------------------------------------------------------------------------
// Types — Changelly API v2
// ---------------------------------------------------------------------------

/**
 * A currency that Changelly supports for swaps.
 */
export interface ChangellyCurrency {
	/** Human-readable name (e.g. "Bitcoin") */
	name: string;
	/** Ticker symbol (e.g. "btc", "usdt") */
	ticker: string;
	/** Whether the currency is currently enabled for new swaps */
	enabled: boolean;
	/** Blockchain network identifier (e.g. "bitcoin", "bsc") */
	network: string;
	/** Number of decimal places for the currency */
	precision: number;
}

/**
 * Parameters for estimating a swap.
 */
export interface ChangellyEstimateParams {
	/** Source currency ticker (e.g. "btc") */
	from: string;
	/** Destination currency ticker (e.g. "usdt") */
	to: string;
	/** Amount in the source currency as a decimal string (e.g. "0.01") */
	amount: string;
}

/**
 * Result of a swap estimation.
 */
export interface ChangellyEstimateResult {
	/** Estimated amount to receive in the destination currency */
	estimatedAmount: string;
	/** Exchange rate as a decimal string */
	rate: string;
	/** Changelly service fee as a decimal string */
	fee: string;
	/** Estimated miner / network fee as a decimal string */
	minerFee: string;
}

/**
 * Parameters for creating a swap transaction.
 */
export interface ChangellyCreateSwapParams {
	/** Source currency ticker (e.g. "btc") */
	from: string;
	/** Destination currency ticker (e.g. "usdt") */
	to: string;
	/** Amount to send in the source currency as a decimal string */
	amount: string;
	/** Destination address where the swapped funds will be sent */
	address: string;
	/** Optional refund address if the swap fails */
	refundAddress?: string;
}

/**
 * Status values for a Changelly swap.
 */
export type ChangellySwapStatus =
	| 'waiting'
	| 'confirming'
	| 'exchanging'
	| 'sending'
	| 'finished'
	| 'failed'
	| 'refunded';

/**
 * A Changelly swap transaction.
 */
export interface ChangellySwap {
	/** Unique swap identifier */
	id: string;
	/** Current status of the swap */
	status: ChangellySwapStatus;
	/** Source currency ticker */
	from: string;
	/** Destination currency ticker */
	to: string;
	/** Expected amount from the source */
	amountExpectedFrom: string;
	/** Expected amount to the destination */
	amountExpectedTo: string;
	/** Address to send funds to (only available after creation) */
	payinAddress?: string;
	/** Destination address that will receive the swapped funds */
	payoutAddress: string;
	/** ISO 8601 timestamp of when the swap was created */
	createdAt: string;
	/** ISO 8601 timestamp of the last status update */
	updatedAt: string;
	/** Extra fields Changelly may return */
	[key: string]: unknown;
}

/**
 * Parameters for querying swap limits.
 */
export interface ChangellyLimitParams {
	/** Source currency ticker */
	from: string;
	/** Destination currency ticker */
	to: string;
}

/**
 * Minimum and maximum swap amounts for a currency pair.
 */
export interface ChangellyLimitResult {
	/** Minimum swap amount as a decimal string */
	min: string;
	/** Maximum swap amount as a decimal string */
	max: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Post a JSON body to a Changelly swap proxy endpoint.
 *
 * @param path - The endpoint path (appended to SWAP_PROXY_BASE)
 * @param body - The JSON-serialisable request body
 * @returns The parsed JSON response
 * @throws {Error} If the network request fails or returns a non-OK status
 */
async function postToProxy<TResponse>(
	path: string,
	body: Record<string, unknown>
): Promise<TResponse> {
	const url = `${SWAP_PROXY_BASE}/${path}`;

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
		throw new Error(`Changelly proxy network error: ${fetchError.message}`);
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
		throw new Error('Invalid response from Changelly proxy');
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
 * Guard: throw a descriptive error when the swaps feature flag is disabled.
 */
function requireSwapsEnabled(): void {
	if (!isChangeallySwapsEnabled()) {
		throw new Error(
			'Changelly swaps are not enabled. Set VITE_CHANGELLY_ENABLED=true to use this feature.'
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Changelly Swap API service.
 *
 * All methods are thin wrappers around the NestJS backend proxy at `/api/v1/changelly/swap/*`.
 * Every public method checks the `VITE_CHANGELLY_ENABLED` feature flag before proceeding.
 */
export const changellyService = {
	/**
	 * Estimate the amount a user will receive for a given swap.
	 *
	 * Pure fetch — no server-side mutation.
	 *
	 * @param params - Swap estimation parameters
	 * @returns Estimated result with rate and fees
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async estimateSwap(params: ChangellyEstimateParams): Promise<ChangellyEstimateResult> {
		requireSwapsEnabled();

		const { from, to, amount } = params;

		if (!from || !to || !amount) {
			throw new Error('estimateSwap requires from, to, and amount');
		}

		return postToProxy<ChangellyEstimateResult>('estimate', {
			from: from.toLowerCase(),
			to: to.toLowerCase(),
			amount
		});
	},

	/**
	 * Create a new swap transaction.
	 *
	 * @param params - Swap creation parameters
	 * @returns The created swap with payin address and status
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async createSwap(params: ChangellyCreateSwapParams): Promise<ChangellySwap> {
		requireSwapsEnabled();

		const { from, to, amount, address, refundAddress } = params;

		if (!from || !to || !amount || !address) {
			throw new Error('createSwap requires from, to, amount, and address');
		}

		return postToProxy<ChangellySwap>('create', {
			from: from.toLowerCase(),
			to: to.toLowerCase(),
			amount,
			address,
			...(refundAddress ? { refundAddress } : {})
		});
	},

	/**
	 * Get the current status of a swap by its ID.
	 *
	 * Pure fetch — no server-side mutation.
	 *
	 * @param id - The swap ID returned by createSwap
	 * @returns The current swap state
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async getSwapStatus(id: string): Promise<ChangellySwap> {
		requireSwapsEnabled();

		if (!id) {
			throw new Error('getSwapStatus requires a swap ID');
		}

		return postToProxy<ChangellySwap>('status', { id });
	},

	/**
	 * Fetch the list of currencies supported by Changelly.
	 *
	 * Pure fetch — no server-side mutation.
	 *
	 * @returns Array of supported currencies
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async getCurrencies(): Promise<ChangellyCurrency[]> {
		requireSwapsEnabled();

		return postToProxy<ChangellyCurrency[]>('currencies', {});
	},

	/**
	 * Get the minimum and maximum swap amounts for a currency pair.
	 *
	 * Pure fetch — no server-side mutation.
	 *
	 * @param from - Source currency ticker
	 * @param to - Destination currency ticker
	 * @returns Minimum and maximum swap amounts
	 * @throws {Error} If the feature flag is disabled or the request fails
	 */
	async getLimits(from: string, to: string): Promise<ChangellyLimitResult> {
		requireSwapsEnabled();

		if (!from || !to) {
			throw new Error('getLimits requires from and to currency tickers');
		}

		return postToProxy<ChangellyLimitResult>('limits', {
			from: from.toLowerCase(),
			to: to.toLowerCase()
		});
	}
};
