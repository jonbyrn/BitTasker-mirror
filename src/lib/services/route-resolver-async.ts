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
import { openoceanService } from '$lib/services/openocean.service';
import {
	normalizeLifiQuote,
	normalizeSymbiosisQuote,
	normalizeOpenOceanQuote,
	normalizedQuoteToRoute,
	type ProviderRouteResult,
	type AsyncRouteResult,
	type OpenOceanQuoteData
} from '$lib/services/quote-normalizer';

export type { AsyncRouteResult } from '$lib/services/quote-normalizer';

import { isLifiEnabled, isSymbiosisEnabled, isOpenOceanEnabled } from '$lib/services/kill-switch';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Address used by LI.FI to represent the native token (RBTC, ETH, etc.) */
const EVM_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

/** USDT BEP-20 contract address on BSC mainnet */
const USDT_BSC_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';

/** USDT0 contract address on Rootstock mainnet */
const USDT0_RSK_ADDRESS = '0x779Ded0c9e1022225f8E0630b35a9b54bE713736';

/** DOC contract address on Rootstock mainnet */
const DOC_RSK_ADDRESS = '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db';

/** USDT0 contract address on Arbitrum mainnet */
const USDT0_ARB_ADDRESS = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';

/**
 * Return the correct USDT/USDT0 token address for a cross-chain EVM
 * destination. Arbitrum uses USDT0; all other chains default to BSC USDT.
 */
function getCrossChainUSDTAddress(chainId: number): string {
	if (chainId === ARB_MAINNET_CHAIN_ID) return USDT0_ARB_ADDRESS;
	return USDT_BSC_ADDRESS;
}

/** Chain IDs */
const RSK_MAINNET_CHAIN_ID = 30;
const BSC_MAINNET_CHAIN_ID = 56;
const ARB_MAINNET_CHAIN_ID = 42161;
const RSK_TESTNET_CHAIN_ID = 31;
const BSC_TESTNET_CHAIN_ID = 97;
/** Pseudo chain ID for TRON (non-EVM, used as placeholder in Destination). */
const TRON_PSEUDO_CHAIN_ID = 0;

/** Timeout for individual provider calls (ms). */
const PROVIDER_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Provider eligibility — which pairs each provider can handle
// ---------------------------------------------------------------------------

type SourceDestKey = `${SourceWallet}->${string}`;

const LIFI_SUPPORTED_PAIRS: Set<SourceDestKey> = new Set([
	'rbtc->address:bsc',
	'usdt-bsc->address:rsk',
	'rbtc->invoice:onchain',
	'usdt-bsc->invoice:onchain',
	// Cross-chain EVM (any non-BSC, non-RSK EVM chain)
	'usdt-bsc->address:crosschain',
	'rbtc->address:crosschain',
	// TRON (non-EVM, chainId 0 placeholder)
	'usdt-bsc->address:tron',
	'rbtc->address:tron',
	// USDT0 on Rootstock
	'usdt0-rsk->address:rsk',
	'usdt0-rsk->address:bsc',
	'usdt0-rsk->address:crosschain',
	'usdt0-rsk->invoice:onchain',
	'usdt0-rsk->invoice:lightning',
	// DOC on Rootstock
	'doc-rsk->address:rsk',
	'doc-rsk->address:bsc',
	'doc-rsk->address:crosschain',
	'doc-rsk->invoice:onchain',
	'doc-rsk->invoice:lightning',
	// USDT0 on Arbitrum
	'usdt0-arb->address:rsk',
	'usdt0-arb->address:crosschain',
	'usdt0-arb->invoice:onchain'
]);

const SYMBIOSIS_SUPPORTED_PAIRS: Set<SourceDestKey> = new Set([
	'rbtc->address:bsc',
	'usdt-bsc->address:rsk',
	'rbtc->invoice:onchain',
	'usdt-bsc->invoice:onchain',
	// Cross-chain EVM (any non-BSC, non-RSK EVM chain)
	'usdt-bsc->address:crosschain',
	'rbtc->address:crosschain',
	// TRON (non-EVM, chainId 0 placeholder)
	'usdt-bsc->address:tron',
	'rbtc->address:tron',
	// USDT0 on Rootstock — Symbiosis on-chain & cross-chain
	'usdt0-rsk->address:rsk',
	'usdt0-rsk->address:bsc',
	'usdt0-rsk->address:crosschain',
	'usdt0-rsk->invoice:onchain',
	'usdt0-rsk->invoice:lightning',
	// DOC on Rootstock — Symbiosis on-chain (DOC→USDT0→rBTC) & cross-chain
	'doc-rsk->address:rsk',
	'doc-rsk->address:bsc',
	'doc-rsk->address:crosschain',
	'doc-rsk->invoice:onchain',
	'doc-rsk->invoice:lightning',
	// USDT0 on Arbitrum
	'usdt0-arb->address:rsk',
	'usdt0-arb->address:crosschain',
	'usdt0-arb->invoice:onchain'
]);

/** OpenOcean-only supported pair — DOC→USDT0 same-chain on RSK */
const OPENOCEAN_SUPPORTED_PAIRS: Set<SourceDestKey> = new Set([
	'doc-rsk->address:rsk' // DOC→USDT0 same-chain swap via OpenOcean aggregator
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
	// Address destinations
	if (destination.type === 'address') {
		if (source === 'rbtc' && isBSCChain(destination.chainId)) {
			return 'rbtc->address:bsc';
		}
		if (source === 'usdt-bsc' && isRSKChain(destination.chainId)) {
			return 'usdt-bsc->address:rsk';
		}
		// TRON (non-EVM, chainId 0 placeholder)
		if (destination.chainId === TRON_PSEUDO_CHAIN_ID) {
			if (source === 'usdt-bsc') return 'usdt-bsc->address:tron';
			if (source === 'rbtc') return 'rbtc->address:tron';
		}
		// USDT0 on Rootstock → RSK (on-chain swap)
		if (source === 'usdt0-rsk' && isRSKChain(destination.chainId)) {
			return 'usdt0-rsk->address:rsk';
		}
		// USDT0 on Rootstock → BSC (cross-chain)
		if (source === 'usdt0-rsk' && isBSCChain(destination.chainId)) {
			return 'usdt0-rsk->address:bsc';
		}
		// DOC on Rootstock → RSK (on-chain swap)
		if (source === 'doc-rsk' && isRSKChain(destination.chainId)) {
			return 'doc-rsk->address:rsk';
		}
		// DOC on Rootstock → BSC (cross-chain)
		if (source === 'doc-rsk' && isBSCChain(destination.chainId)) {
			return 'doc-rsk->address:bsc';
		}
		// Cross-chain EVM (Arbitrum, Ethereum, Polygon, Optimism, Base, Avalanche)
		if (source === 'usdt0-rsk') {
			return 'usdt0-rsk->address:crosschain';
		}
		if (source === 'doc-rsk') {
			return 'doc-rsk->address:crosschain';
		}
		if (source === 'usdt-bsc') {
			return 'usdt-bsc->address:crosschain';
		}
		if (source === 'rbtc') {
			return 'rbtc->address:crosschain';
		}
		// USDT0 on Arbitrum → RSK (cross-chain to rBTC)
		if (source === 'usdt0-arb' && isRSKChain(destination.chainId)) {
			return 'usdt0-arb->address:rsk';
		}
		// USDT0 on Arbitrum → cross-chain EVM
		if (source === 'usdt0-arb') {
			return 'usdt0-arb->address:crosschain';
		}
		return null;
	}

	// Invoice destinations
	if (destination.type === 'invoice') {
		if (destination.network === 'lightning') {
			if (source === 'usdt0-rsk') return 'usdt0-rsk->invoice:lightning';
			if (source === 'doc-rsk') return 'doc-rsk->invoice:lightning';
			if (source === 'rbtc') return null; // handled by hardcoded routes
		}
		if (destination.network === 'onchain') {
			if (source === 'rbtc') return 'rbtc->invoice:onchain';
			if (source === 'usdt-bsc') return 'usdt-bsc->invoice:onchain';
			if (source === 'usdt0-rsk') return 'usdt0-rsk->invoice:onchain';
			if (source === 'usdt0-arb') return 'usdt0-arb->invoice:onchain';
			if (source === 'doc-rsk') return 'doc-rsk->invoice:onchain';
		}
	}

	return null;
}

// ---------------------------------------------------------------------------
// Shared source/destination resolution
// ---------------------------------------------------------------------------

/** Resolved source-side values shared by all providers. */
interface SourceResolution {
	fromChainId: number;
	fromToken: string;
	fromAsset: string;
	fromChain: string;
}

/**
 * Resolve the source-side token metadata for a given SourceWallet.
 * Returns null for btc-onchain or unrecognized sources (caller should skip).
 */
function resolveSource(source: SourceWallet): SourceResolution | null {
	switch (source) {
		case 'rbtc':
			return {
				fromChainId: RSK_MAINNET_CHAIN_ID,
				fromToken: EVM_NATIVE_TOKEN_ADDRESS,
				fromAsset: 'RBTC',
				fromChain: 'rsk'
			};
		case 'usdt0-rsk':
			return {
				fromChainId: RSK_MAINNET_CHAIN_ID,
				fromToken: USDT0_RSK_ADDRESS,
				fromAsset: 'USDT0',
				fromChain: 'rsk'
			};
		case 'doc-rsk':
			return {
				fromChainId: RSK_MAINNET_CHAIN_ID,
				fromToken: DOC_RSK_ADDRESS,
				fromAsset: 'DOC',
				fromChain: 'rsk'
			};
		case 'usdt-bsc':
			return {
				fromChainId: BSC_MAINNET_CHAIN_ID,
				fromToken: USDT_BSC_ADDRESS,
				fromAsset: 'USDT',
				fromChain: 'bsc'
			};
		case 'usdt0-arb':
			return {
				fromChainId: ARB_MAINNET_CHAIN_ID,
				fromToken: USDT0_ARB_ADDRESS,
				fromAsset: 'USDT0',
				fromChain: 'arbitrum'
			};
		case 'wbtc-arb':
			return {
				fromChainId: ARB_MAINNET_CHAIN_ID,
				fromToken: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
				fromAsset: 'WBTC',
				fromChain: 'arbitrum'
			};
		default:
			return null;
	}
}

/** Resolved destination-side token metadata. */
interface DestResolution {
	toChainId: number;
	toToken: string;
	toAsset: string;
	toChain: string;
}

/**
 * Resolve the destination-side token metadata.
 *
 * @param source - The source wallet identifier
 * @param destination - The payment destination
 * @param useDynamicCrossChainUSDT - LI.FI uses `getCrossChainUSDTAddress(destChainId)` for
 *   cross-chain EVM from rbtc/usdt-bsc; Symbiosis always uses USDT_BSC_ADDRESS.
 * @returns Resolution object, or null if the destination is unsupported (caller should skip).
 */
function resolveDest(
	source: SourceWallet,
	destination: Destination,
	useDynamicCrossChainUSDT: boolean
): DestResolution | null {
	const isBtcOnchain = destination.type === 'invoice' && destination.network === 'onchain';
	if (!isBtcOnchain && destination.type !== 'address') return null;

	const destChainId = isBtcOnchain ? 0 : (destination as { chainId: number }).chainId;
	const isCrossChainEVM = !isBtcOnchain && !isRSKChain(destChainId) && !isBSCChain(destChainId);

	// BTC on-chain
	if (isBtcOnchain) {
		return { toChainId: 0, toToken: 'BTC', toAsset: 'BTC', toChain: 'bitcoin' };
	}

	// usdt0-rsk / doc-rsk → RSK same-chain swap to rBTC
	if ((source === 'usdt0-rsk' || source === 'doc-rsk') && isRSKChain(destChainId)) {
		return {
			toChainId: destChainId,
			toToken: EVM_NATIVE_TOKEN_ADDRESS,
			toAsset: 'RBTC',
			toChain: 'rsk'
		};
	}

	// usdt0-arb / wbtc-arb → RSK (cross-chain bridge to rBTC)
	if ((source === 'usdt0-arb' || source === 'wbtc-arb') && isRSKChain(destChainId)) {
		return {
			toChainId: destChainId,
			toToken: EVM_NATIVE_TOKEN_ADDRESS,
			toAsset: 'RBTC',
			toChain: 'rsk'
		};
	}

	// Cross-chain EVM (Arbitrum, Ethereum, Polygon, Optimism, Base, Avalanche)
	if (isCrossChainEVM) {
		let toToken: string;
		if (source === 'usdt0-rsk' || source === 'doc-rsk' || source === 'wbtc-arb') {
			toToken = getCrossChainUSDTAddress(destChainId);
		} else if (source === 'usdt0-arb') {
			toToken = USDT_BSC_ADDRESS;
		} else {
			// rbtc, usdt-bsc default — provider-specific
			toToken = useDynamicCrossChainUSDT ? getCrossChainUSDTAddress(destChainId) : USDT_BSC_ADDRESS;
		}
		return {
			toChainId: destChainId,
			toToken,
			toAsset: 'USDT',
			toChain: `chain-${destChainId}`
		};
	}

	// Default: same-chain swaps
	if (source === 'wbtc-arb') {
		return {
			toChainId: destChainId,
			toToken: USDT0_ARB_ADDRESS,
			toAsset: 'USDT0',
			toChain: 'arbitrum'
		};
	}
	if (source === 'usdt-bsc') {
		return {
			toChainId: destChainId,
			toToken: EVM_NATIVE_TOKEN_ADDRESS,
			toAsset: 'RBTC',
			toChain: 'rsk'
		};
	}
	if (source === 'usdt0-arb') {
		return {
			toChainId: destChainId,
			toToken: USDT_BSC_ADDRESS,
			toAsset: 'USDT',
			toChain: 'bsc'
		};
	}
	// rbtc default
	return {
		toChainId: destChainId,
		toToken: USDT_BSC_ADDRESS,
		toAsset: 'USDT',
		toChain: 'bsc'
	};
}

/**
 * Derive the decimal precision for a given asset symbol.
 * Used by Symbiosis which requires explicit decimals in its API call.
 */
function getAssetDecimals(asset: string): number {
	if (asset === 'USDT0') return 6;
	if (asset === 'BTC') return 8;
	return 18; // RBTC, USDT, DOC, WBTC
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
	const src = resolveSource(source);
	if (!src) return { provider: 'lifi', status: 'skipped', routes: [] };

	const dest = resolveDest(source, destination, true);
	if (!dest) return { provider: 'lifi', status: 'skipped', routes: [] };

	try {
		// LI.FI requires fromAddress (lowercase) and fromAmount in smallest unit.
		// RBTC/USDT use 18 decimals (×1e18), WBTC uses 8 decimals (sats = smallest unit).
		const lifiFromAddr = userAddress.toLowerCase();
		const lifiFromAmount =
			src.fromAsset === 'WBTC'
				? BigInt(Math.round(parseFloat(amount))).toString() // WBTC 8 dec: sats already smallest unit
				: BigInt(Math.round(parseFloat(amount) * 1e18)).toString();
		const lifiRoute: LifiRoute = await withTimeout(
			lifiService.getQuote({
				fromChain: src.fromChainId,
				toChain: dest.toChainId,
				fromToken: src.fromToken,
				toToken: dest.toToken,
				fromAmount: lifiFromAmount,
				fromAddress: lifiFromAddr
			}),
			PROVIDER_TIMEOUT_MS
		);

		const normalized = normalizeLifiQuote(
			lifiRoute,
			src.fromAsset,
			dest.toAsset,
			src.fromChain,
			dest.toChain
		);
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
	const src = resolveSource(source);
	if (!src) return { provider: 'symbiosis', status: 'skipped', routes: [] };

	const dest = resolveDest(source, destination, false);
	if (!dest) return { provider: 'symbiosis', status: 'skipped', routes: [] };

	try {
		// Symbiosis expects amount in token's smallest unit inside tokenAmountIn
		const symbiosisAmount = BigInt(Math.round(parseFloat(amount) * 1e18)).toString();
		const quote: SymbiosisQuoteResponse = await withTimeout(
			symbiosisService.getQuote({
				tokenAmountIn: {
					address: src.fromToken,
					chainId: src.fromChainId,
					symbol: src.fromAsset,
					decimals: getAssetDecimals(src.fromAsset),
					amount: symbiosisAmount
				},
				tokenOut: {
					address: dest.toToken,
					chainId: dest.toChainId,
					symbol: dest.toAsset,
					decimals: getAssetDecimals(dest.toAsset)
				},
				from: userAddress,
				to: userAddress,
				slippage: 50
			}),
			PROVIDER_TIMEOUT_MS
		);

		const normalized = normalizeSymbiosisQuote(
			quote,
			src.fromAsset,
			dest.toAsset,
			src.fromChain,
			dest.toChain
		);
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

/**
 * Call OpenOcean for a DOC→USDT0 same-chain swap quote on RSK.
 *
 * OpenOcean only supports the doc-rsk→address:rsk pair (DOC→USDT0 on RSK).
 * Returns a ProviderRouteResult with success, error, or skipped status.
 */
async function callOpenOcean(
	source: SourceWallet,
	destination: Destination,
	amount: string
): Promise<ProviderRouteResult> {
	// Only DOC→USDT0 on RSK is supported via OpenOcean
	if (source !== 'doc-rsk') {
		return { provider: 'openocean', status: 'skipped', routes: [] };
	}

	try {
		const response: OpenOceanQuoteData = await openoceanService.getQuote({
			docAmount: amount
		});

		const normalized = normalizeOpenOceanQuote(response, 'DOC', 'USDT0', 'rsk', 'rsk');
		if (!normalized) {
			return {
				provider: 'openocean',
				status: 'error',
				routes: [],
				error: 'Failed to normalize OpenOcean quote'
			};
		}

		const route = normalizedQuoteToRoute(normalized, false);
		return { provider: 'openocean', status: 'success', routes: [route] };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'OpenOcean API request failed';
		return { provider: 'openocean', status: 'error', routes: [], error: message };
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
	const openoceanEligible =
		pairKey !== null && OPENOCEAN_SUPPORTED_PAIRS.has(pairKey) && isOpenOceanEnabled();

	// If no provider is eligible, return hardcoded routes immediately
	if (!lifiEligible && !symbiosisEligible && !openoceanEligible) {
		return {
			routes: hardcodedRoutes,
			hardcodedRoutes,
			providerResults: [
				{ provider: 'lifi', status: 'skipped', routes: [] },
				{ provider: 'symbiosis', status: 'skipped', routes: [] },
				{ provider: 'openocean', status: 'skipped', routes: [] }
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

	if (openoceanEligible) {
		promises.push(callOpenOcean(source, destination, amount));
	} else {
		promises.push(
			Promise.resolve({ provider: 'openocean' as const, status: 'skipped' as const, routes: [] })
		);
	}

	const settled = await Promise.allSettled(promises);

	const providerResults: ProviderRouteResult[] = settled.map((result, i) => {
		const provider =
			i === 0 ? ('lifi' as const) : i === 1 ? ('symbiosis' as const) : ('openocean' as const);
		if (result.status === 'fulfilled') {
			return result.value;
		}
		return {
			provider,
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

	// Merge and sort ALL routes: cheapest first, then fastest
	const mergedRoutes = [...liveRoutes, ...hardcodedRoutes].sort(
		(a, b) =>
			a.totalFeePercent - b.totalFeePercent ||
			a.hops[0].estimatedTimeMin - b.hops[0].estimatedTimeMin
	);

	// Cheapest route is first — no recommended flag needed
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
			{ provider: 'symbiosis', status: 'skipped', routes: [] },
			{ provider: 'openocean', status: 'skipped', routes: [] }
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
