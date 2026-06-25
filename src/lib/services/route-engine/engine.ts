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
	changellyProvider
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
	signal?: AbortSignal
): Promise<RouteEngineResult> {
	const errors: Array<{ provider: string; error: string }> = [];

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
		eligible.map((p) => p.getQuote(fromToken, toToken, amountSats, signal))
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

	// 5. Rank routes
	const ranked = rankRoutes(routes);

	// 6. Mark recommended
	if (ranked.length > 0) {
		ranked[0] = { ...ranked[0], recommended: true };
	}

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
 * Rank routes by total fee percentage (ascending = best first).
 *
 * Tiebreaking rules:
 *   1. Fewer hops preferred (less complexity, lower failure risk)
 *   2. Deterministic by route ID (stable sort across runs)
 *
 * @param routes Unsorted array of viable routes
 * @returns New array sorted best-first (non-mutating)
 */
export function rankRoutes(routes: Route[]): Route[] {
	return [...routes].sort((a, b) => {
		// Prefer lower total fee
		if (a.totalFeePercent !== b.totalFeePercent) {
			return a.totalFeePercent - b.totalFeePercent;
		}
		// Tiebreak: fewer hops preferred
		if (a.hops.length !== b.hops.length) {
			return a.hops.length - b.hops.length;
		}
		// Tiebreak: deterministic by ID
		return a.id.localeCompare(b.id);
	});
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
