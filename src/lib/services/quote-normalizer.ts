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
	provider: 'lifi' | 'symbiosis';
	fromAsset: string;
	fromChain: string;
	toAsset: string;
	toChain: string;
	estimatedToAmount: string;
	feePercent: number;
	estimatedTimeMinutes: number;
	/** Provider-specific route identifier for later execution. */
	providerRouteId: string;
}

/**
 * Result from a single provider during async route resolution.
 */
export interface ProviderRouteResult {
	provider: 'lifi' | 'symbiosis';
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
	executionDuration: number;
	feeCosts?: LifiFeeCost[];
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
	amountOut: string;
	feePercent?: number;
	route?: unknown[];
	estimatedTime?: number;
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

	// Calculate fee percentage from the difference
	const feePercent = ((fromAmount - toAmount) / fromAmount) * 100;
	// Floor to 2 decimals, never negative
	const finalFeePercent = Math.max(0, Math.round(feePercent * 100) / 100);

	// Estimate time in minutes from executionDuration (seconds)
	const estimatedTimeMinutes = Math.ceil((estimate.executionDuration ?? 300) / 60);

	return {
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
	if (!quote?.amountOut) return null;

	const amountOut = parseFloat(quote.amountOut);
	if (Number.isNaN(amountOut) || amountOut <= 0) return null;

	// Symbiosis may return its own feePercent
	const feePercent = quote.feePercent ?? 0.3;

	// Symbiosis may return an estimated time; default to 5 minutes
	const estimatedTimeMinutes = quote.estimatedTime ?? 5;

	return {
		provider: 'symbiosis',
		fromAsset,
		fromChain,
		toAsset,
		toChain,
		estimatedToAmount: quote.amountOut,
		feePercent: Math.max(0, Math.round(feePercent * 100) / 100),
		estimatedTimeMinutes,
		providerRouteId: `symbiosis-${fromChain}-${toChain}-${Date.now()}`
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
		estimatedTimeMax: Math.ceil(quote.estimatedTimeMinutes * 1.5)
	};

	const label =
		quote.provider === 'lifi'
			? `${quote.fromAsset} to ${quote.toAsset} via LI.FI`
			: `${quote.fromAsset} to ${quote.toAsset} via Symbiosis`;

	return {
		id: `${quote.fromChain}-to-${quote.toChain}-via-${quote.provider}-${quote.providerRouteId}`,
		label,
		hops: [hop],
		totalFeePercent: quote.feePercent,
		estimatedTime: `${quote.estimatedTimeMinutes}-${Math.ceil(quote.estimatedTimeMinutes * 1.5)} min`,
		recommended
	};
}
