/**
 * LI.FI (Jumper) Swap API Service
 *
 * Client-side wrapper for the LI.FI cross-chain swap REST API.
 * Calls LI.FI directly from the client — no Cloudflare Worker proxy.
 * LI.FI is a public API; no authentication required.
 *
 * All quote methods are pure fetches — they fetch data but produce no
 * side effects on the server.
 *
 * @see https://docs.li.fi/api-reference/introduction
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isLifiEnabled } from '$lib/services/kill-switch';

const debug = createDebug('lifi-service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LIFI_BASE_URL = 'https://li.quest/v1';

/** Timeout for LI.FI API requests (ms). */
const LIFI_REQUEST_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LifiFeeCost {
	name: string;
	percentage: string;
	amount: string;
	token: { symbol: string; address: string; decimals: number };
}

export interface LifiEstimate {
	fromAmount: string;
	toAmount: string;
	toAmountMin: string;
	executionDuration: number;
	feeCosts?: LifiFeeCost[];
	gasCosts?: LifiFeeCost[];
}

export interface LifiToken {
	symbol: string;
	address: string;
	chainId: number;
	decimals: number;
	name: string;
	logoURI?: string;
}

export interface LifiChain {
	id: number;
	name: string;
	key: string;
}

export interface LifiConnection {
	fromChainId: number;
	toChainId: number;
	fromTokens: Array<{
		address: string;
		chainId: number;
		symbol?: string;
		name?: string;
		decimals?: number;
		logoURI?: string;
	}>;
}

export interface LifiStep {
	id: string;
	type: string;
	action: {
		fromChainId: number;
		fromToken: LifiToken;
		toChainId: number;
		toToken: LifiToken;
	};
	estimate: LifiEstimate;
}

export interface LifiRoute {
	id: string;
	fromChainId: number;
	toChainId: number;
	fromToken: LifiToken;
	toToken: LifiToken;
	steps: LifiStep[];
	estimate: LifiEstimate;
}

export interface LifiQuoteResponse {
	routes: LifiRoute[];
}

export interface LifiStatusResponse {
	status: 'NOT_FOUND' | 'PENDING' | 'DONE' | 'FAILED';
	substatus?: string;
	receiving?: { txHash?: string; amount?: string };
	sending?: { txHash?: string; amount?: string };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch from LI.FI API with timeout.
 *
 * @param url - Full API URL
 * @returns The parsed JSON response
 */
async function fetchLifi<TResponse>(
	url: string,
	options?: { method?: string; body?: string; headers?: Record<string, string> }
): Promise<TResponse> {
	const method = options?.method || 'GET';
	debug.log('%s %s', method, url);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), LIFI_REQUEST_TIMEOUT_MS);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method,
			headers: options?.headers ?? { 'Content-Type': 'application/json' },
			body: options?.body,
			signal: controller.signal
		})
	);

	clearTimeout(timeoutId);

	if (fetchError) {
		debug.error('LI.FI network error: %s', fetchError.message);
		throw new Error(`LI.FI API network error: ${fetchError.message}`);
	}

	if (!response || !response.ok) {
		const errorBody = await parseLifiErrorBody(response);
		debug.error('LI.FI returned error: %s', errorBody);
		throw new Error(errorBody);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('LI.FI parse error: %s', parseError.message);
		throw new Error('Invalid response from LI.FI API');
	}

	return json;
}

async function parseLifiErrorBody(response: Response | null): Promise<string> {
	if (!response) return 'No response from LI.FI API';
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

function requireLifiEnabled(): void {
	if (!isLifiEnabled()) {
		throw new Error('LI.FI swaps are not enabled. Set VITE_LIFI_ENABLED=true to use this feature.');
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const lifiService = {
	/**
	 * Get a quote for a cross-chain swap.
	 *
	 * @param params - Quote parameters
	 * @returns The best route from LI.FI
	 */
	async getQuote(params: {
		fromChain: number;
		toChain: number;
		fromToken: string;
		toToken: string;
		fromAmount: string;
		fromAddress: string;
	}): Promise<LifiRoute> {
		requireLifiEnabled();

		const { fromChain, toChain, fromToken, toToken, fromAmount, fromAddress } = params;

		if (fromChain === undefined || toChain === undefined || !fromToken || !toToken || !fromAmount) {
			throw new Error('getQuote requires fromChain, toChain, fromToken, toToken, and fromAmount');
		}

		const url =
			`${LIFI_BASE_URL}/quote?` +
			`fromChain=${fromChain}&toChain=${toChain}` +
			`&fromToken=${encodeURIComponent(fromToken)}` +
			`&toToken=${encodeURIComponent(toToken)}` +
			`&fromAmount=${encodeURIComponent(fromAmount)}` +
			`&fromAddress=${encodeURIComponent(fromAddress)}` +
			`&order=RECOMMENDED`;

		const response = await fetchLifi<LifiQuoteResponse>(url);

		if (!response.routes || response.routes.length === 0) {
			throw new Error(
				'LI.FI has no liquidity for this pair right now. Try again later or use a different provider.'
			);
		}

		return response.routes[0];
	},

	/**
	 * Get step transaction data for executing a LI.FI swap on-chain.
	 * Re-fetches the quote and calls the step transaction endpoint.
	 */
	async getStepTransaction(params: {
		fromChain: number;
		toChain: number;
		fromToken: string;
		toToken: string;
		fromAmount: string;
		fromAddress: string;
	}): Promise<{ to: string; data: string; value: string; chainId: number }> {
		requireLifiEnabled();
		const route = await this.getQuote(params);
		if (!route.steps || route.steps.length === 0) {
			throw new Error('LI.FI returned no steps for execution');
		}
		const step = route.steps[0];

		const url = `${LIFI_BASE_URL}/advanced/stepTransaction`;
		const body = JSON.stringify({
			type: 'lifi',
			route,
			step,
			order: 'RECOMMENDED'
		});

		const response = await fetchLifi<{
			transactionRequest: { to: string; data: string; value: string; chainId: number };
		}>(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body
		});

		if (!response.transactionRequest) {
			throw new Error('LI.FI returned no transaction request');
		}
		return response.transactionRequest;
	},

	/**
	 * Get the status of a cross-chain transaction.
	 *
	 * @param txHash - The transaction hash to check
	 * @returns The current status of the transaction
	 */
	async getStatus(txHash: string): Promise<LifiStatusResponse> {
		requireLifiEnabled();

		if (!txHash) {
			throw new Error('getStatus requires a transaction hash');
		}

		const url = `${LIFI_BASE_URL}/status?txHash=${encodeURIComponent(txHash)}`;
		return fetchLifi<LifiStatusResponse>(url);
	},

	/**
	 * Get the list of supported chains from LI.FI.
	 *
	 * @returns Array of supported chains
	 */
	async getChains(): Promise<LifiChain[]> {
		requireLifiEnabled();

		const url = `${LIFI_BASE_URL}/chains`;
		const response = await fetchLifi<{ chains: LifiChain[] }>(url);
		return response.chains ?? [];
	},

	/**
	 * Get the list of supported tokens for a chain.
	 *
	 * @param chainId - The chain ID to query
	 * @returns Array of supported tokens
	 */
	async getTokens(chainId: number): Promise<LifiToken[]> {
		requireLifiEnabled();

		if (!chainId || chainId <= 0) {
			throw new Error('getTokens requires a valid chainId');
		}

		const url = `${LIFI_BASE_URL}/tokens?chain=${chainId}`;
		const response = await fetchLifi<{ tokens: LifiToken[] }>(url);
		return response.tokens ?? [];
	},

	/**
	 * Get available token transfer connections for swap pair verification.
	 *
	 * Verifies which tokens on a source chain can be swapped to a destination chain.
	 *
	 * @param fromChain - The source chain ID
	 * @param toChain - The destination chain ID
	 * @returns Connection info with available source tokens
	 */
	async getConnections(fromChain: number, toChain: number): Promise<LifiConnection[]> {
		requireLifiEnabled();

		if (!fromChain || !toChain || fromChain <= 0 || toChain <= 0) {
			throw new Error('getConnections requires valid fromChain and toChain');
		}

		const url = `${LIFI_BASE_URL}/connections?fromChain=${fromChain}&toChain=${toChain}`;
		const response = await fetchLifi<{ connections: LifiConnection[] }>(url);
		return response.connections ?? [];
	}
};
