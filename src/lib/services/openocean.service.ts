/**
 * OpenOcean DEX Aggregator API Service
 *
 * REST client for OpenOcean's DEX aggregator on RSK (Rootstock).
 * Provides DOC → USDT0 swap quotes and transaction data for same-chain
 * swaps on RSK. No API key required.
 *
 * Follows the same pattern as lifi.service.ts and symbiosis.service.ts.
 *
 * @see https://docs.openocean.finance/docs/swap-api/v4
 */

import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';
import { isOpenOceanEnabled } from '$lib/services/kill-switch';

const debug = createDebug('openocean-service');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Base URL for OpenOcean v4 API on Rootstock. */
const OPENOCEAN_BASE_URL = 'https://open-api.openocean.finance/v4/rootstock';

/** Timeout for OpenOcean API requests (ms). */
const OPENOCEAN_REQUEST_TIMEOUT_MS = 10000;

/** DOC contract address on RSK mainnet (18 decimals). */
const DOC_ADDRESS: string = '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db';

/** USDT0 contract address on RSK mainnet (6 decimals). */
const USDT0_ADDRESS: string = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OpenOceanDexInfo {
	dexCode: string;
	swapAmount: string;
}

export interface OpenOceanQuoteData {
	inAmount: string;
	outAmount: string;
	estimatedGas: string;
	dexes: OpenOceanDexInfo[];
	priceImpact: string;
}

export interface OpenOceanQuoteResponse {
	code: number;
	data: OpenOceanQuoteData;
}

export interface OpenOceanSwapTxData {
	to: string;
	data: string;
	value: string;
	chainId: number;
	outAmount: string;
	estimatedGas: string;
	minOutAmount: string;
	from: string;
	priceImpact: string;
}

export interface OpenOceanSwapTxResponse {
	code: number;
	data: OpenOceanSwapTxData;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function requireOpenOceanEnabled(): void {
	if (!isOpenOceanEnabled()) {
		throw new Error(
			'OpenOcean swaps are not enabled. Set VITE_OPENOCEAN_ENABLED=true to use this feature.'
		);
	}
}

/**
 * Fetch from OpenOcean API with timeout.
 */
async function fetchOpenOcean<TResponse>(
	url: string,
	options?: { method?: string; headers?: Record<string, string> }
): Promise<TResponse> {
	const method = options?.method || 'GET';
	debug.log('%s %s', method, url);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), OPENOCEAN_REQUEST_TIMEOUT_MS);

	const { data: response, error: fetchError } = await tryCatch(
		fetch(url, {
			method,
			headers: options?.headers ?? { 'Content-Type': 'application/json' },
			signal: controller.signal
		})
	);

	clearTimeout(timeoutId);

	if (fetchError) {
		debug.error('OpenOcean network error: %s', fetchError.message);
		throw new Error(`OpenOcean API network error: ${fetchError.message}`);
	}

	if (!response || !response.ok) {
		const errorBody = await parseOpenOceanErrorBody(response);
		debug.error('OpenOcean returned error: %s', errorBody);
		throw new Error(errorBody);
	}

	const { data: json, error: parseError } = await tryCatch<TResponse>(
		response.json() as Promise<TResponse>
	);

	if (parseError) {
		debug.error('OpenOcean parse error: %s', parseError.message);
		throw new Error('Invalid response from OpenOcean API');
	}

	return json;
}

async function parseOpenOceanErrorBody(response: Response | null): Promise<string> {
	if (!response) return 'No response from OpenOcean API';
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const openoceanService = {
	/**
	 * Get a quote for a DOC → USDT0 swap on RSK.
	 *
	 * @param params.docAmount - Amount of DOC to swap (in DOC units, 18 decimals)
	 * @returns Quote data with expected USDT0 output, gas estimate, and dex routing
	 */
	async getQuote(params: { docAmount: string }): Promise<OpenOceanQuoteData> {
		requireOpenOceanEnabled();

		const { docAmount } = params;
		if (!docAmount || parseFloat(docAmount) <= 0) {
			throw new Error('getQuote requires a valid docAmount greater than 0');
		}

		const url =
			`${OPENOCEAN_BASE_URL}/quote?` +
			`inTokenAddress=${encodeURIComponent(DOC_ADDRESS)}` +
			`&outTokenAddress=${encodeURIComponent(USDT0_ADDRESS)}` +
			`&amount=${encodeURIComponent(docAmount)}` +
			`&gasPrice=1`;

		const response = await fetchOpenOcean<OpenOceanQuoteResponse>(url);

		if (!response.data || !response.data.outAmount) {
			throw new Error(
				'OpenOcean returned no quote data for this pair. Try again later or use a different provider.'
			);
		}

		return response.data;
	},

	/**
	 * Get transaction data for executing a DOC → USDT0 swap on RSK.
	 *
	 * @param params.docAmount - Amount of DOC to swap (in DOC units, 18 decimals)
	 * @param params.userAddress - User's RSK wallet address
	 * @param params.slippage - Slippage tolerance in basis points (default: 100 = 1%)
	 * @returns Transaction data ready to be signed and sent
	 */
	async getSwapTransaction(params: {
		docAmount: string;
		userAddress: string;
		slippage?: number;
	}): Promise<OpenOceanSwapTxData> {
		requireOpenOceanEnabled();

		const { docAmount, userAddress, slippage = 100 } = params;
		if (!docAmount || parseFloat(docAmount) <= 0) {
			throw new Error('getSwapTransaction requires a valid docAmount greater than 0');
		}
		if (!userAddress) {
			throw new Error('getSwapTransaction requires a valid userAddress');
		}

		const url =
			`${OPENOCEAN_BASE_URL}/swap?` +
			`inTokenAddress=${encodeURIComponent(DOC_ADDRESS)}` +
			`&outTokenAddress=${encodeURIComponent(USDT0_ADDRESS)}` +
			`&amount=${encodeURIComponent(docAmount)}` +
			`&account=${encodeURIComponent(userAddress)}` +
			`&slippage=${slippage}`;

		const response = await fetchOpenOcean<OpenOceanSwapTxResponse>(url);

		if (!response.data || !response.data.to || !response.data.data) {
			throw new Error('OpenOcean returned no swap transaction data');
		}

		return response.data;
	},

	/** DOC contract address on RSK mainnet. */
	DOC_ADDRESS,

	/** USDT0 contract address on RSK mainnet. */
	USDT0_ADDRESS
};
