/**
 * Route Engine — Core
 *
 * The central route resolution engine. Queries all registered swap providers
 * in parallel, applies the Boltz 2-hop optimization, ranks results, and
 * returns a unified `RouteEngineResult`.
 *
 * Replaces the previous dual-path approach (SmartRouter + resolveRouteAsync)
 * with a single, deterministic pipeline.
 */

import type { RouteEngineResult, SwapProvider, Token, Route } from './types';
import { resolveTokenKey, resolveDestinationTokens } from './token-registry';
import { symbiosisProvider } from './providers/symbiosis.provider';
import { lifiProvider } from './providers/lifi.provider';
import { changellyProvider } from './providers/changelly.provider';
import { boltzProvider } from './providers/boltz.provider';
import { directProvider } from './providers/direct.provider';
import { uniswapV3Provider } from './providers/uniswap-v3.provider';
import { openoceanProvider } from './providers/openocean.provider';
import { buildBoltzTwoHopRoute, BOLTZ_TWO_HOP_PAIRS } from './boltz-two-hop';
import type { SourceWallet, Destination } from '$lib/services/route-resolver';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('route-engine:engine');

// ---------------------------------------------------------------------------
// Registered providers
// ---------------------------------------------------------------------------

/**
 * All swap providers in priority order.
 * Providers are stateless singletons — safe to reuse across calls.
 */
const ALL_PROVIDERS: SwapProvider[] = [
	directProvider,
	boltzProvider,
	symbiosisProvider,
	lifiProvider,
	changellyProvider,
	uniswapV3Provider,
	openoceanProvider
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve all viable swap routes for a source→destination pair.
 *
 * Pipeline:
 *   1. Resolve source token and destination token(s) from registry
 *   2. Filter providers by synchronous `supports()` check
 *   3. Query all eligible providers in parallel via `Promise.allSettled`
 *   4. Check Boltz 2-hop optimization for known pairs
 *   5. Rank all successful routes (lowest fee first, fewer hops preferred)
 *   6. Mark cheapest as recommended
 *
 * @param source Source wallet identifier
 * @param destination Target address or invoice
 * @param amountSats Amount in satoshis
 * @param signal Optional AbortSignal for cancellation
 * @returns Ranked routes, recommended route, provider errors, and live status
 */
export async function resolveRoutes(
	source: SourceWallet,
	destination: Destination,
	amountSats: number,
	signal?: AbortSignal,
	/** Amount in source token's smallest unit (e.g., micro-USDT for USDT0).
	 *  For non-BTC-pegged tokens, amountSats is a BTC-equivalent that loses
	 *  precision when converted back. Providers should use sourceAmountRaw
	 *  when available. */
	sourceAmountRaw?: string
): Promise<RouteEngineResult> {
	const errors: Array<{ provider: string; error: string }> = [];

	// Fast-fail: offline
	if (typeof navigator !== 'undefined' && !navigator.onLine) {
		return {
			routes: [],
			recommended: null,
			errors: [{ provider: 'system', error: 'Device offline' }],
			isLive: false
		};
	}

	// Fast-fail: invalid amount
	if (!amountSats || !Number.isFinite(amountSats) || amountSats <= 0) {
		return { routes: [], recommended: null, errors: [], isLive: false };
	}

	// Fast-fail if already aborted
	if (signal?.aborted) {
		debug.log('Signal already aborted, returning empty result');
		return { routes: [], recommended: null, errors: [], isLive: false };
	}

	// 1. Resolve tokens
	const fromToken = resolveTokenKey(source);
	const toTokens = resolveDestinationTokens(destination);

	if (!fromToken || toTokens.length === 0) {
		debug.log('No token resolved: source=%s, toTokens=%d', source, toTokens.length);
		return { routes: [], recommended: null, errors: [], isLive: false };
	}

	const toToken = toTokens[0]; // Primary target token
	debug.log('Resolving routes: %s → %s (%d sats)', fromToken.key, toToken.key, amountSats);

	// 2. Filter eligible providers (synchronous supports() check)
	const eligible = ALL_PROVIDERS.filter((p) => p.supports(fromToken, toToken));
	debug.log('Eligible providers: %s', eligible.map((p) => p.name).join(', '));

	// 3. Query all eligible providers in parallel
	const results = await Promise.allSettled(
		eligible.map((p) => p.getQuote(fromToken, toToken, amountSats, signal, sourceAmountRaw))
	);

	const routes: Route[] = [];
	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		if (result.status === 'fulfilled' && result.value !== null) {
			routes.push(result.value);
		} else if (result.status === 'rejected') {
			errors.push({
				provider: eligible[i].name,
				error: String(result.reason?.message ?? result.reason ?? 'unknown')
			});
		}
	}

	// 4. Boltz 2-hop optimization (only for known pairs)
	if (shouldCheckBoltzOptimization(fromToken, toToken)) {
		const { data: twoHopRoute, error: twoHopError } = await tryCatch(
			buildBoltzTwoHopRoute(fromToken, toToken, amountSats, signal)
		);

		if (twoHopError) {
			debug.warn('Boltz 2-hop failed: %s', String(twoHopError));
			errors.push({ provider: 'boltz-2hop', error: String(twoHopError) });
		} else if (twoHopRoute) {
			routes.push(twoHopRoute);
		}
	}

	// 5. Rank routes by total cost (gas + bridge fee in sats)
	const ranked = rankRoutes(routes, amountSats);

	// 6. Mark recommended
	if (ranked.length > 0) {
		ranked[0] = { ...ranked[0], recommended: true };
	}

	// 7. Log final ranking with cost breakdown
	logRankedRoutes(ranked, amountSats);

	debug.log(
		'Resolved %d routes (%d errors), recommended: %s',
		ranked.length,
		errors.length,
		ranked[0]?.id ?? 'none'
	);

	return {
		routes: ranked,
		recommended: ranked[0] ?? null,
		errors,
		isLive: true
	};
}

// ---------------------------------------------------------------------------
// Ranking
// ---------------------------------------------------------------------------

/**
 * Rank routes by total cost in sats (gas + bridge fee), ascending = best first.
 *
 * Total cost = gasCostSats + bridgeFeeSats where:
 *   - gasCostSats = gasCostWei / 1e10 (on-chain gas to initiate/claim)
 *   - bridgeFeeSats = amountSats × totalFeePercent / 100 (Boltz/Symbiosis/LI.FI service fee)
 *
 * This ensures Boltz 2-hop routes (low gas, moderate bridge fee) are fairly
 * compared against direct routes (higher gas, lower bridge fee).
 *
 * Tiebreaking rules:
 *   1. Fewer hops preferred (less complexity, lower failure risk)
 *   2. Deterministic by route ID (stable sort across runs)
 *
 * @param routes Unsorted array of viable routes
 * @param amountSats Input amount in satoshis (for bridge fee calculation)
 * @returns New array sorted best-first (non-mutating)
 */
export function rankRoutes(routes: Route[], amountSats: number): Route[] {
	function totalCostSats(route: Route): number {
		// If we have USD values from the provider, use them for accurate cross-currency comparison.
		// feeUsd = inputValueUsd - outputValueUsd (actual cost including bridge fee + slippage)
		// Then add gas cost in sats.
		if (route.inputValueUsd && route.outputValueUsd && route.inputValueUsd > 0) {
			const feeUsd = Math.max(0, route.inputValueUsd - route.outputValueUsd);
			// Convert fee USD to sats using the input as reference:
			// feeSats = (feeUsd / inputValueUsd) * amountSats
			const feeSats = Math.round((feeUsd / route.inputValueUsd) * amountSats);
			const gasSats = route.gasCostWei
				? (() => {
						try {
							return Number(BigInt(route.gasCostWei) / 10_000_000_000n);
						} catch {
							return 0;
						}
					})()
				: 0;
			return gasSats + feeSats;
		}

		// Fallback: compute from fee percent (works for same-currency pairs)
		const gasSats = route.gasCostWei
			? (() => {
					try {
						return Number(BigInt(route.gasCostWei) / 10_000_000_000n);
					} catch {
						return 0;
					}
				})()
			: 0;
		const bridgeSats = Math.round((amountSats * route.totalFeePercent) / 100);
		return gasSats + bridgeSats;
	}

	// Log full cost breakdown for every route before sorting
	debug.log('=== Route cost breakdown (%d sats input, %d routes) ===', amountSats, routes.length);
	for (const route of routes) {
		const gasSats = route.gasCostWei
			? (() => {
					try {
						return Number(BigInt(route.gasCostWei) / 10_000_000_000n);
					} catch {
						return 0;
					}
				})()
			: 0;
		const hasUsd = !!(route.inputValueUsd && route.outputValueUsd && route.inputValueUsd > 0);
		const feeUsd = hasUsd ? Math.max(0, route.inputValueUsd! - route.outputValueUsd!) : 0;
		const feeSats = hasUsd
			? Math.round((feeUsd / route.inputValueUsd!) * amountSats)
			: Math.round((amountSats * route.totalFeePercent) / 100);
		const total = gasSats + feeSats;
		debug.log(
			'  %s | gasCostWei=%s gasSats=%d | %s | TOTAL=%d sats | output=%s | hops=%d',
			route.id,
			route.gasCostWei ?? 'none',
			gasSats,
			hasUsd
				? `USD: in=$${route.inputValueUsd!.toFixed(2)} out=$${route.outputValueUsd!.toFixed(2)} fee=$${feeUsd.toFixed(4)} feeSats=${feeSats}`
				: `feePct=${route.totalFeePercent.toFixed(4)}% bridgeSats=${feeSats}`,
			total,
			route.outputAmount ?? String(route.outputSats ?? '?'),
			route.hops.length
		);
	}

	return [...routes].sort((a, b) => {
		// Prefer lower total cost (gas + bridge fee)
		const costA = totalCostSats(a);
		const costB = totalCostSats(b);
		if (costA !== costB) {
			return costA - costB;
		}
		// Tiebreak: fewer hops preferred
		if (a.hops.length !== b.hops.length) {
			return a.hops.length - b.hops.length;
		}
		// Tiebreak: deterministic by ID
		return a.id.localeCompare(b.id);
	});
}

// Debug: log final ranking after sort (defined outside rankRoutes to avoid hoisting issues)
function logRankedRoutes(routes: Route[], amountSats: number): void {
	debug.log('=== Final ranking (%d routes) ===', routes.length);
	for (let i = 0; i < routes.length; i++) {
		const r = routes[i];
		const gasSats = r.gasCostWei
			? (() => {
					try {
						return Number(BigInt(r.gasCostWei) / 10_000_000_000n);
					} catch {
						return 0;
					}
				})()
			: 0;
		const hasUsd = !!(r.inputValueUsd && r.outputValueUsd && r.inputValueUsd > 0);
		const feeUsd = hasUsd ? Math.max(0, r.inputValueUsd! - r.outputValueUsd!) : 0;
		const feeSats = hasUsd
			? Math.round((feeUsd / r.inputValueUsd!) * amountSats)
			: Math.round((amountSats * r.totalFeePercent) / 100);
		debug.log(
			'  #%d %s | total=%d sats (gas=%d + fee=%d) | %s | %s',
			i + 1,
			r.id,
			gasSats + feeSats,
			gasSats,
			feeSats,
			hasUsd ? `$${feeUsd.toFixed(4)} fee` : `${r.totalFeePercent.toFixed(2)}% fee`,
			r.recommended ? '★ RECOMMENDED' : ''
		);
	}
}

// ---------------------------------------------------------------------------
// Boltz optimization check
// ---------------------------------------------------------------------------

/**
 * Check whether a token pair should trigger the Boltz 2-hop optimization.
 * Pure lookup — no network calls.
 *
 * @param from Source token
 * @param to Destination token
 * @returns true if the pair key exists in BOLTZ_TWO_HOP_PAIRS
 */
export function shouldCheckBoltzOptimization(from: Token, to: Token): boolean {
	return `${from.key}->${to.key}` in BOLTZ_TWO_HOP_PAIRS;
}
