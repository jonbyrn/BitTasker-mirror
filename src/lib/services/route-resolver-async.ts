/**
 * Async Route Resolver
 *
 * Calls LI.FI and Symbiosis REST APIs in parallel for live quotes, then
 * merges the results with the hardcoded fallback routes from route-resolver.ts.
 *
 * Pure data-flow function: takes inputs, returns outputs, no retained state.
 * State management (loading, errors, debounce) belongs to the caller.
 */

import {
	resolveRoute,
	type SourceWallet,
	type Destination,
	type Route
} from '$lib/services/route-resolver';
import { lifiService, type LifiRoute } from '$lib/services/lifi.service';
import { symbiosisService, type SymbiosisQuoteResponse } from '$lib/services/symbiosis.service';
import {
	normalizeLifiQuote,
	normalizeSymbiosisQuote,
	normalizedQuoteToRoute,
	type ProviderRouteResult,
	type AsyncRouteResult
} from '$lib/services/quote-normalizer';

export type { AsyncRouteResult } from '$lib/services/quote-normalizer';

import { isLifiEnabled, isSymbiosisEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Address used by LI.FI to represent the native token (RBTC, ETH, etc.) */
const EVM_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/** USDT BEP-20 contract address on BSC mainnet */
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

/** Chain IDs */
const RSK_MAINNET_CHAIN_ID = 30;
const BSC_MAINNET_CHAIN_ID = 56;
const RSK_TESTNET_CHAIN_ID = 31;
const BSC_TESTNET_CHAIN_ID = 97;

/** Timeout for individual provider calls (ms). */
const PROVIDER_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Provider eligibility — which pairs each provider can handle
// ---------------------------------------------------------------------------

type SourceDestKey = `${SourceWallet}->${string}`;

const LIFI_SUPPORTED_PAIRS: Set<SourceDestKey> = new Set([
	'rbtc->address:bsc',
	'usdt-bsc->address:rsk'
]);

const SYMBIOSIS_SUPPORTED_PAIRS: Set<SourceDestKey> = new Set([
	'rbtc->address:bsc',
	'usdt-bsc->address:rsk'
]);

// ---------------------------------------------------------------------------
// Address helpers
// ---------------------------------------------------------------------------

function isBSCChain(chainId: number): boolean {
	return chainId === BSC_MAINNET_CHAIN_ID || chainId === BSC_TESTNET_CHAIN_ID;
}

function isRSKChain(chainId: number): boolean {
	return chainId === RSK_MAINNET_CHAIN_ID || chainId === RSK_TESTNET_CHAIN_ID;
}

/**
 * Determine the pair key for provider eligibility checking.
 */
function getPairKey(source: SourceWallet, destination: Destination): SourceDestKey | null {
	if (destination.type !== 'address') return null;

	if (source === 'rbtc' && isBSCChain(destination.chainId)) {
		return 'rbtc->address:bsc';
	}
	if (source === 'usdt-bsc' && isRSKChain(destination.chainId)) {
		return 'usdt-bsc->address:rsk';
	}

	return null;
}

// ---------------------------------------------------------------------------
// Provider callers
// ---------------------------------------------------------------------------

/**
 * Call LI.FI for a quote with a timeout.
 * Returns the normalized Routes on success, or a ProviderRouteResult with
 * error on failure.
 */
async function callLifi(
	source: SourceWallet,
	destination: Destination,
	amount: string,
	userAddress: string
): Promise<ProviderRouteResult> {
	if (destination.type !== 'address') {
		return { provider: 'lifi', status: 'skipped', routes: [] };
	}

	const fromChainId = source === 'rbtc' ? RSK_MAINNET_CHAIN_ID : BSC_MAINNET_CHAIN_ID;
	const toChainId = isRSKChain(destination.chainId) ? RSK_MAINNET_CHAIN_ID : BSC_MAINNET_CHAIN_ID;

	const fromToken = source === 'rbtc' ? EVM_NATIVE_TOKEN_ADDRESS : USDT_BSC_ADDRESS;
	const toToken = source === 'rbtc' ? USDT_BSC_ADDRESS : EVM_NATIVE_TOKEN_ADDRESS;

	const fromAsset = source === 'rbtc' ? 'RBTC' : 'USDT';
	const toAsset = source === 'rbtc' ? 'USDT' : 'RBTC';
	const fromChain = source === 'rbtc' ? 'rsk' : 'bsc';
	const toChain = source === 'rbtc' ? 'bsc' : 'rsk';

	try {
		const lifiRoute: LifiRoute = await withTimeout(
			lifiService.getQuote({
				fromChain: fromChainId,
				toChain: toChainId,
				fromToken,
				toToken,
				fromAmount: amount,
				fromAddress: userAddress
			}),
			PROVIDER_TIMEOUT_MS
		);

		const normalized = normalizeLifiQuote(lifiRoute, fromAsset, toAsset, fromChain, toChain);
		if (!normalized) {
			return {
				provider: 'lifi',
				status: 'error',
				routes: [],
				error: 'Failed to normalize LI.FI quote'
			};
		}

		const route = normalizedQuoteToRoute(normalized, false);
		return { provider: 'lifi', status: 'success', routes: [route] };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'LI.FI API request failed';
		return { provider: 'lifi', status: 'error', routes: [], error: message };
	}
}

/**
 * Call Symbiosis for a quote with a timeout.
 * Returns the normalized Routes on success, or a ProviderRouteResult with
 * error on failure.
 */
async function callSymbiosis(
	source: SourceWallet,
	destination: Destination,
	amount: string,
	userAddress: string
): Promise<ProviderRouteResult> {
	if (destination.type !== 'address') {
		return { provider: 'symbiosis', status: 'skipped', routes: [] };
	}

	const fromChainId = source === 'rbtc' ? RSK_MAINNET_CHAIN_ID : BSC_MAINNET_CHAIN_ID;
	const toChainId = isRSKChain(destination.chainId) ? RSK_MAINNET_CHAIN_ID : BSC_MAINNET_CHAIN_ID;

	const fromAsset = source === 'rbtc' ? 'RBTC' : 'USDT';
	const toAsset = source === 'rbtc' ? 'USDT' : 'RBTC';
	const fromChain = source === 'rbtc' ? 'rsk' : 'bsc';
	const toChain = source === 'rbtc' ? 'bsc' : 'rsk';

	try {
		const quote: SymbiosisQuoteResponse = await withTimeout(
			symbiosisService.getQuote({
				tokenAmountIn: {
					address: source === 'rbtc' ? EVM_NATIVE_TOKEN_ADDRESS : USDT_BSC_ADDRESS,
					chainId: fromChainId,
					symbol: fromAsset,
					decimals: 18
				},
				tokenOut: {
					address: source === 'rbtc' ? USDT_BSC_ADDRESS : EVM_NATIVE_TOKEN_ADDRESS,
					chainId: toChainId,
					symbol: toAsset,
					decimals: 18
				},
				amount,
				from: userAddress,
				to: userAddress
			}),
			PROVIDER_TIMEOUT_MS
		);

		const normalized = normalizeSymbiosisQuote(quote, fromAsset, toAsset, fromChain, toChain);
		if (!normalized) {
			return {
				provider: 'symbiosis',
				status: 'error',
				routes: [],
				error: 'Failed to normalize Symbiosis quote'
			};
		}

		const route = normalizedQuoteToRoute(normalized, false);
		return { provider: 'symbiosis', status: 'success', routes: [route] };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Symbiosis API request failed';
		return { provider: 'symbiosis', status: 'error', routes: [], error: message };
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve swap routes from a source wallet to a destination, querying all
 * enabled providers in parallel.
 *
 * Always includes hardcoded fallback routes. Provider results are merged and
 * the lowest-fee provider route is marked as recommended.
 *
 * @param source - The source wallet identifier
 * @param destination - The destination to send funds to
 * @param amount - The amount to swap (required for live quotes)
 * @param userAddress - The user's wallet address (required for live quotes)
 * @param options - Optional overrides
 * @returns An AsyncRouteResult with merged routes and per-provider status
 */
export async function resolveRouteAsync(
	source: SourceWallet,
	destination: Destination,
	amount: string,
	userAddress: string,
	options?: {
		signal?: AbortSignal;
	}
): Promise<AsyncRouteResult> {
	// Always compute hardcoded routes synchronously
	const hardcodedRoutes = resolveRoute(source, destination);

	// Determine which providers are eligible for this pair
	const pairKey = getPairKey(source, destination);

	const lifiEligible = pairKey !== null && LIFI_SUPPORTED_PAIRS.has(pairKey) && isLifiEnabled();
	const symbiosisEligible =
		pairKey !== null && SYMBIOSIS_SUPPORTED_PAIRS.has(pairKey) && isSymbiosisEnabled();

	// If neither provider is eligible, return hardcoded routes immediately
	if (!lifiEligible && !symbiosisEligible) {
		return {
			routes: hardcodedRoutes,
			hardcodedRoutes,
			providerResults: [
				{ provider: 'lifi', status: 'skipped', routes: [] },
				{ provider: 'symbiosis', status: 'skipped', routes: [] }
			],
			isLoading: false
		};
	}

	// Call eligible providers in parallel
	const promises: Promise<ProviderRouteResult>[] = [];

	if (lifiEligible) {
		promises.push(callLifi(source, destination, amount, userAddress));
	} else {
		promises.push(
			Promise.resolve({ provider: 'lifi' as const, status: 'skipped' as const, routes: [] })
		);
	}

	if (symbiosisEligible) {
		promises.push(callSymbiosis(source, destination, amount, userAddress));
	} else {
		promises.push(
			Promise.resolve({ provider: 'symbiosis' as const, status: 'skipped' as const, routes: [] })
		);
	}

	const settled = await Promise.allSettled(promises);

	const providerResults: ProviderRouteResult[] = settled.map((result) => {
		if (result.status === 'fulfilled') {
			return result.value;
		}
		return {
			provider: 'lifi' as const,
			status: 'error' as const,
			routes: [],
			error: 'Provider crashed'
		};
	});

	// Check if the request was aborted
	if (options?.signal?.aborted) {
		return {
			routes: hardcodedRoutes,
			hardcodedRoutes,
			providerResults: providerResults.map((pr) => ({
				...pr,
				status: 'error' as const,
				error: 'Request aborted'
			})),
			isLoading: false
		};
	}

	// Collect live routes from successful providers
	const liveRoutes: Route[] = [];
	for (const pr of providerResults) {
		if (pr.status === 'success') {
			liveRoutes.push(...pr.routes);
		}
	}

	// Merge: live routes first (sorted by fee then time), then hardcoded routes
	const mergedRoutes = [
		...liveRoutes.sort(
			(a, b) =>
				a.totalFeePercent - b.totalFeePercent ||
				a.hops[0].estimatedTimeMin - b.hops[0].estimatedTimeMin
		),
		...hardcodedRoutes
	];

	// Mark the lowest-fee route as recommended
	if (mergedRoutes.length > 0) {
		for (const route of mergedRoutes) {
			route.recommended = false;
		}
		mergedRoutes[0].recommended = true;
	}

	return {
		routes: mergedRoutes,
		hardcodedRoutes,
		providerResults,
		isLoading: false
	};
}

/**
 * Create an initial loading state for the async route result.
 */
export function createInitialAsyncRouteResult(): AsyncRouteResult {
	return {
		routes: [],
		hardcodedRoutes: [],
		providerResults: [
			{ provider: 'lifi', status: 'skipped', routes: [] },
			{ provider: 'symbiosis', status: 'skipped', routes: [] }
		],
		isLoading: true
	};
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Request timed out')), ms);
		promise
			.then((result) => {
				clearTimeout(timer);
				resolve(result);
			})
			.catch((err) => {
				clearTimeout(timer);
				reject(err);
			});
	});
}
