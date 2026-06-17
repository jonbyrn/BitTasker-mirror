/**
 * Quote Normalizer
 *
 * Pure functions that normalize LI.FI and Symbiosis API responses into the
 * project's existing Route / RouteHop types. No side effects, no network
 * calls — deterministic data transformation only.
 */

import type { Route, RouteHop } from '$lib/services/route-resolver';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A normalized quote from any swap provider. */
export interface NormalizedQuote {
	provider: 'lifi' | 'symbiosis' | 'openocean';
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: string;
	estimatedToAmount: string;
	feePercent: number;
	estimatedTimeMinutes: number;
	/** Provider-specific route identifier for later execution. */
	providerRouteId: string;
	/** Gas cost in wei from live API quote. */
	gasCostWei?: string;
	/** Itemized fees from live API quote. */
	feeCosts?: Array<{ name: string; amount: string }>;
}

/**
 * Result from a single provider during async route resolution.
 */
export interface ProviderRouteResult {
	provider: 'lifi' | 'symbiosis' | 'openocean';
	status: 'success' | 'error' | 'skipped';
	routes: Route[];
	error?: string;
}

/**
 * The full result of async route resolution.
 */
export interface AsyncRouteResult {
	/** All routes merged and sorted (best fee first). */
	routes: Route[];
	/** Hardcoded fallback routes (always available). */
	hardcodedRoutes: Route[];
	/** Per-provider status for UI feedback. */
	providerResults: ProviderRouteResult[];
	/** Whether resolution is still in progress. */
	isLoading: boolean;
}

// ---------------------------------------------------------------------------
// LI.FI response shapes (minimal — only fields we consume)
// ---------------------------------------------------------------------------

export interface LifiFeeCost {
	name: string;
	percentage: string;
	amount: string;
	token: { symbol: string };
}

export interface LifiEstimate {
	fromAmount: string;
	toAmount: string;
	toAmountMin?: string;
	fromAmountUSD?: string;
	toAmountUSD?: string;
	executionDuration: number;
	feeCosts?: LifiFeeCost[];
	gasCosts?: LifiFeeCost[];
}

export interface LifiRoute {
	id: string;
	fromChainId: number;
	toChainId: number;
	fromToken: { symbol: string; address: string };
	toToken: { symbol: string; address: string };
	estimate: LifiEstimate;
}

export interface LifiQuoteResponse {
	routes: LifiRoute[];
}

// ---------------------------------------------------------------------------
// Symbiosis response shapes (minimal — only fields we consume)
// ---------------------------------------------------------------------------

export interface SymbiosisTokenIn {
	symbol: string;
	chainId: number;
}

export interface SymbiosisTokenOut {
	symbol: string;
	chainId: number;
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
	fee?: string;
	estimatedTime?: number;
	routes?: unknown[];
	tx?: { gasLimit?: string; data?: string; to?: string; value?: string };
}

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/**
 * Normalize a LI.FI quote into a provider-agnostic format.
 *
 * @param lifiRoute - The best route from LI.FI's quote response
 * @param fromAsset - The source asset ticker (e.g. 'RBTC')
 * @param toAsset - The destination asset ticker (e.g. 'USDT')
 * @param fromChain - The source chain name (e.g. 'rsk')
 * @param toChain - The destination chain name (e.g. 'bsc')
 * @returns A NormalizedQuote, or null if the input is invalid
 */
export function normalizeLifiQuote(
	lifiRoute: LifiRoute,
	fromAsset: string,
	toAsset: string,
	fromChain: string,
	toChain: string
): NormalizedQuote | null {
	if (!lifiRoute?.estimate) return null;

	const { estimate, id } = lifiRoute;

	// Parse amounts
	const fromAmount = parseFloat(estimate.fromAmount);
	const toAmount = parseFloat(estimate.toAmount);

	if (Number.isNaN(fromAmount) || Number.isNaN(toAmount) || fromAmount <= 0) {
		return null;
	}

	// LI.FI provides USD equivalents — use them for a cleaner fee calc
	const fromUsd = parseFloat(estimate.fromAmountUSD || '0');
	const toUsd = parseFloat(estimate.toAmountUSD || '0');

	// Calculate protocol fee percentage from USD equivalents (excludes gas)
	let feePercent: number;
	if (fromUsd > 0 && toUsd > 0) {
		feePercent = ((fromUsd - toUsd) / fromUsd) * 100;
	} else {
		feePercent = 0;
	}
	// Floor to 2 decimals, never negative
	const finalFeePercent = Math.max(0, Math.round(feePercent * 100) / 100);

	// Estimate time in minutes from executionDuration (seconds)
	const estimatedTimeMinutes = Math.ceil((estimate.executionDuration ?? 300) / 60);

	const result: NormalizedQuote = {
		provider: 'lifi',
		fromAsset,
		fromChain,
		toAsset,
		toChain,
		estimatedToAmount: estimate.toAmount,
		feePercent: finalFeePercent,
		estimatedTimeMinutes,
		providerRouteId: id
	};

	// Pass LI.FI gas data through so the UI can display real fees
	if (estimate.gasCosts && estimate.gasCosts.length > 0) {
		const totalGasWei = estimate.gasCosts.reduce(
			(sum: bigint, g: { amount: string }) => sum + BigInt(g.amount || '0'),
			BigInt(0)
		);
		result.gasCostWei = totalGasWei.toString();
	}
	if (estimate.feeCosts && estimate.feeCosts.length > 0) {
		result.feeCosts = estimate.feeCosts.map((f: { name: string; amount: string }) => ({
			name: f.name,
			amount: f.amount
		}));
	}

	return result;
}

/**
 * Normalize a Symbiosis quote into a provider-agnostic format.
 *
 * @param quote - The quote response from Symbiosis
 * @param fromAsset - The source asset ticker
 * @param toAsset - The destination asset ticker
 * @param fromChain - The source chain name
 * @param toChain - The destination chain name
 * @returns A NormalizedQuote, or null if the input is invalid
 */
export function normalizeSymbiosisQuote(
	quote: SymbiosisQuoteResponse,
	fromAsset: string,
	toAsset: string,
	fromChain: string,
	toChain: string
): NormalizedQuote | null {
	const outAmount = quote?.tokenAmountOut?.amount;
	if (!outAmount) return null;

	// Reject non-numeric amounts
	if (Number.isNaN(parseFloat(outAmount))) return null;

	// Symbiosis estimated time, default 5 min
	const estimatedTimeMinutes = quote.estimatedTime ?? 5;

	// Fee percent is reported by Symbiosis or computed from amountInUsd vs output
	const feePercent = quote.fee ? parseFloat(quote.fee) : 0.3;

	const result: NormalizedQuote = {
		provider: 'symbiosis',
		fromAsset,
		fromChain,
		toAsset,
		toChain,
		estimatedToAmount: outAmount,
		feePercent: Math.max(0, Math.round(feePercent * 100) / 100),
		estimatedTimeMinutes,
		providerRouteId: `symbiosis-${fromChain}-${toChain}-${Date.now()}`
	};

	// Symbiosis quote may include gas estimate in the tx field
	if (quote.tx?.gasLimit) {
		// gasLimit is in wei — convert to total gas cost by multiplying with gas price
		// but Symbiosis doesn't provide gas price, so store the gas limit as wei estimate
		result.gasCostWei = String(BigInt(quote.tx.gasLimit));
	}

	return result;
}

// ---------------------------------------------------------------------------
// OpenOcean response shapes
// ---------------------------------------------------------------------------

export interface OpenOceanQuoteData {
	inAmount: string;
	outAmount: string;
	estimatedGas: string;
	dexes: Array<{ dexCode: string; swapAmount: string }>;
	priceImpact: string;
}

export interface OpenOceanQuoteResponse {
	data: OpenOceanQuoteData;
}

/**
 * Normalize an OpenOcean quote into a provider-agnostic format.
 *
 * @param quote - The quote response from OpenOcean
 * @param fromAsset - The source asset ticker (e.g. 'DOC')
 * @param toAsset - The destination asset ticker (e.g. 'USDT0')
 * @param fromChain - The source chain name (e.g. 'rsk')
 * @param toChain - The destination chain name (e.g. 'rsk')
 * @returns A NormalizedQuote, or null if the input is invalid
 */
export function normalizeOpenOceanQuote(
	quote: OpenOceanQuoteData,
	fromAsset: string,
	toAsset: string,
	fromChain: string,
	toChain: string
): NormalizedQuote | null {
	if (!quote?.outAmount) return null;

	const outAmount = quote.outAmount;
	const _estimatedGas = quote.estimatedGas;
	const priceImpact = parseFloat(quote.priceImpact || '0');

	return {
		provider: 'openocean',
		fromAsset,
		fromChain,
		toAsset,
		toChain,
		estimatedToAmount: outAmount,
		feePercent: Math.max(0, Math.round(priceImpact * 100) / 100),
		estimatedTimeMinutes: 1, // Same-chain swap, fast execution
		providerRouteId: `openocean-${fromChain}-${toChain}-${Date.now()}`
	};
}

// ---------------------------------------------------------------------------
// Quote-to-Route conversion
// ---------------------------------------------------------------------------

/**
 * Convert a NormalizedQuote into a Route (with a single RouteHop).
 *
 * @param quote - The normalized quote from any provider
 * @param recommended - Whether this route should be marked as recommended
 * @returns A Route object consumable by the existing UI and swap chain
 */
export function normalizedQuoteToRoute(quote: NormalizedQuote, recommended: boolean): Route {
	const hop: RouteHop = {
		service: quote.provider,
		fromAsset: quote.fromAsset,
		fromChain: quote.fromChain,
		toAsset: quote.toAsset,
		toChain: quote.toChain,
		feePercent: quote.feePercent,
		estimatedTimeMin: quote.estimatedTimeMinutes,
		estimatedTimeMax: Math.ceil(quote.estimatedTimeMinutes * 1.5),
		gasCostWei: quote.gasCostWei,
		feeCosts: quote.feeCosts
	};

	const label =
		quote.provider === 'lifi'
			? 'LI.FI'
			: quote.provider === 'openocean'
				? 'OpenOcean'
				: 'Symbiosis';

	return {
		id: `${quote.fromChain}-to-${quote.toChain}-via-${quote.provider}-${quote.providerRouteId}`,
		label,
		hops: [hop],
		totalFeePercent: quote.feePercent,
		estimatedTime: `${quote.estimatedTimeMinutes}-${Math.ceil(quote.estimatedTimeMinutes * 1.5)} min`,
		recommended,
		gasCostWei: quote.gasCostWei,
		feeCosts: quote.feeCosts
	};
}
