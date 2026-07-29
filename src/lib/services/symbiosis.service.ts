/**
 * Symbiosis Cross-Chain Swap API Service
 *
 * Client-side wrapper for the Symbiosis cross-chain swap REST API.
 * Calls Symbiosis directly from the client — no Cloudflare Worker proxy.
 * Symbiosis is a public API; no authentication required.
 *
 * All quote methods are pure fetches — they fetch data but produce no
 * side effects on the server.
 *
 * @see https://docs.symbiosis.finance/developer-tools/symbiosis-api
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isSymbiosisEnabled } from '$lib/services/kill-switch';

const debug = createDebug('symbiosis-service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SYMBIOSIS_BASE_URL = 'https://api.symbiosis.finance/crosschain';

/** Timeout for Symbiosis API requests (ms). */
const SYMBIOSIS_REQUEST_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SymbiosisToken {
	address: string;
	chainId: number;
	symbol: string;
	decimals: number;
	name?: string;
}

export interface SymbiosisQuoteRequest {
	tokenAmountIn: SymbiosisToken & { amount: string };
	tokenOut: SymbiosisToken;
	from: string;
	to: string;
	slippage?: number;
}

export interface SymbiosisQuoteResponse {
	tokenAmountOut?: {
		amount: string;
		symbol: string;
		address: string;
		chainId: number;
		decimals: number;
	};
	tokenAmountOutMin?: { amount: string };
	amountInUsd?: { amount: string };
	fee?: string;
	estimatedTime?: number;
	routes?: unknown[];
	/** Contract address to approve ERC-20 tokens for (metaRouterGateway).
	 *  Per Symbiosis docs: always approve tokens for this address, NOT tx.to. */
	approveTo?: string;
	tx?: {
		chainId: number;
		data: string;
		to: string;
		value: string;
	};
	calldata?: string;
}

export interface SymbiosisChain {
	chainId: number;
	name: string;
	chainType: string;
}

export interface SymbiosisSwapStatusResponse {
	status: { code: number; text: string };
	txIn?: { chainId: number; hash: string; time: string; address: string };
	tx?: {
		chainId: number;
		hash: string;
		time: string;
		address: string;
		tokenAmount?: {
			symbol: string;
			address: string;
			amount: string;
			chainId: number;
			decimals: number;
			priceUsd?: number;
		};
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function fetchSymbiosis<TResponse>(
	url: string,
	options?: { method?: string; body?: Record<string, unknown> }
): Promise<TResponse> {
	const method = options?.method ?? 'GET';
	const body = options?.body ? JSON.stringify(options.body) : undefined;

	debug.log('%s %s', method, url);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), SYMBIOSIS_REQUEST_TIMEOUT_MS);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body,
			signal: controller.signal
		})
	);

	clearTimeout(timeoutId);

	if (fetchError) {
		debug.error('Symbiosis network error: %s', fetchError.message);
		throw new Error(`Symbiosis API network error: ${fetchError.message}`);
	}

	if (!response || !response.ok) {
		const errorBody = await parseSymbiosisErrorBody(response);
		debug.error('Symbiosis returned error: %s', errorBody);
		throw new Error(errorBody);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('Symbiosis parse error: %s', parseError.message);
		throw new Error('Invalid response from Symbiosis API');
	}

	debug.log('Symbiosis response received');
	return json;
}

async function parseSymbiosisErrorBody(response: Response | null): Promise<string> {
	if (!response) return 'No response from Symbiosis API';
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

function requireSymbiosisEnabled(): void {
	if (!isSymbiosisEnabled()) {
		throw new Error(
			'Symbiosis swaps are not enabled. Set VITE_SYMBIOSIS_ENABLED=true to use this feature.'
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const symbiosisService = {
	/**
	 * Get a quote for a cross-chain swap via Symbiosis.
	 *
	 * @param params - Quote request parameters
	 * @returns The quote response
	 */
	async getQuote(params: SymbiosisQuoteRequest): Promise<SymbiosisQuoteResponse> {
		requireSymbiosisEnabled();

		const { tokenAmountIn, tokenOut, from, to, slippage } = params;

		if (!tokenAmountIn || !tokenOut || !tokenAmountIn.amount || !from) {
			throw new Error('getQuote requires tokenAmountIn, tokenOut, amount, and from address');
		}

		const amount = tokenAmountIn.amount;

		const body = {
			tokenAmountIn: {
				address: tokenAmountIn.address,
				chainId: tokenAmountIn.chainId,
				symbol: tokenAmountIn.symbol,
				decimals: tokenAmountIn.decimals,
				amount
			},
			tokenOut: {
				address: tokenOut.address,
				chainId: tokenOut.chainId,
				symbol: tokenOut.symbol,
				decimals: tokenOut.decimals
			},
			slippage: slippage ?? 50,
			from,
			to: to ?? from
		};

		const url = `${SYMBIOSIS_BASE_URL}/v2/quote`;
		return fetchSymbiosis<SymbiosisQuoteResponse>(url, { method: 'POST', body });
	},

	/**
	 * Get the list of supported chains from Symbiosis.
	 *
	 * @returns Array of supported chains
	 */
	async getChains(): Promise<SymbiosisChain[]> {
		requireSymbiosisEnabled();

		const url = `${SYMBIOSIS_BASE_URL}/v1/chains`;
		const response = await fetchSymbiosis<SymbiosisChain[]>(url);
		return response ?? [];
	},

	/**
	 * Get the status of a Symbiosis swap by transaction hash and chain ID.
	 *
	 * @param txHash - The source transaction hash
	 * @param chainId - The source chain ID
	 * @returns The swap status response
	 */
	async getSwapStatus(txHash: string, chainId: number): Promise<SymbiosisSwapStatusResponse> {
		requireSymbiosisEnabled();
		return fetchSymbiosis<SymbiosisSwapStatusResponse>(
			`${SYMBIOSIS_BASE_URL}/v2/tx/${chainId}/${txHash}`
		);
	}
};
