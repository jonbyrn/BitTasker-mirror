/**
 * Route Engine — Boltz 2-Hop Optimization
 *
 * Composes 2-hop routes using Boltz for the first hop (BTC↔RBTC↔tBTC chain swaps)
 * and a second provider (LI.FI, Uniswap V3) for the second hop (DEX swap on destination chain).
 *
 * Key use cases:
 *   - RBTC → WBTC on Arbitrum: Boltz (RBTC→tBTC Arb) + Uniswap V3 (tBTC→WBTC)
 *   - RBTC → USDT0 on Arbitrum: Boltz (RBTC→tBTC Arb) + LI.FI (tBTC→USDT0)
 *   - USDT0 Arb → RBTC: LI.FI (USDT0→tBTC Arb) + Boltz (tBTC→RBTC)
 *   - WBTC Arb → RBTC: Uniswap V3 (WBTC→tBTC Arb) + Boltz (tBTC→RBTC)
 *   - BTC → USDT0/WBTC on Arbitrum: Boltz (BTC→tBTC Arb) + LI.FI/Uniswap V3 (tBTC→target)
 *
 * Symbiosis is disabled — MetaRouter reverts on all chains. All Boltz-last
 * routes use LI.FI or Uniswap V3 for hop1 instead.
 */

import type { Token, Route, RouteHop } from './types';
import { TOKENS } from './token-registry';
import { boltzProvider } from './providers/boltz.provider';
import { symbiosisProvider } from './providers/symbiosis.provider';
import { lifiProvider } from './providers/lifi.provider';
import { uniswapV3Provider } from './providers/uniswap-v3.provider';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('route-engine:two-hop');

// ---------------------------------------------------------------------------
// Provider lookup map
// ---------------------------------------------------------------------------

const PROVIDER_MAP = {
	symbiosis: symbiosisProvider,
	lifi: lifiProvider,
	boltz: boltzProvider,
	'uniswap-v3': uniswapV3Provider
} as const;

type ProviderName = keyof typeof PROVIDER_MAP;

// ---------------------------------------------------------------------------
// 2-Hop Pair Configurations
// ---------------------------------------------------------------------------

/**
 * Known 2-hop optimization pairs.
 * Maps `${from.key}->${to.key}` to the intermediary token key and provider config.
 *
 * - `hop1Provider`: If set, use this provider for hop1 (from→intermediary) instead of Boltz.
 *   When set, Boltz is used for hop2 (intermediary→to).
 * - `hop2Providers`: Providers to try for hop2 when Boltz is hop1.
 *   Ignored when `hop1Provider` is set (Boltz is always hop2 in that case).
 */
export const BOLTZ_TWO_HOP_PAIRS: Record<
	string,
	{
		intermediary: string;
		hop1Provider?: ProviderName;
		hop2Providers: ProviderName[];
	}
> = {
	'rbtc->wbtc-arb': {
		intermediary: 'tbtc-arb',
		hop2Providers: ['symbiosis', 'lifi', 'uniswap-v3']
	},
	'rbtc->usdt0-arb': { intermediary: 'tbtc-arb', hop2Providers: ['symbiosis', 'lifi', 'uniswap-v3'] },
	'usdt0-arb->rbtc': { intermediary: 'tbtc-arb', hop1Provider: 'lifi', hop2Providers: [] },
	'wbtc-arb->rbtc': { intermediary: 'tbtc-arb', hop1Provider: 'uniswap-v3', hop2Providers: [] },
	'btc->usdt0-arb': { intermediary: 'tbtc-arb', hop2Providers: ['lifi', 'symbiosis', 'uniswap-v3'] },
	'btc->wbtc-arb': { intermediary: 'tbtc-arb', hop2Providers: ['lifi', 'symbiosis', 'uniswap-v3'] }
};

// ---------------------------------------------------------------------------
// Route composition helper
// ---------------------------------------------------------------------------

/**
 * Compose a 2-hop Route from two single-hop quotes.
 * Sums fees, takes the union of time ranges, and merges gas/fee metadata.
 */
function composeTwoHopRoute(
	id: string,
	label: string,
	hop1: RouteHop,
	hop2: RouteHop,
	inputSats: number,
	outputSats: number
): Route {
	const totalFeePercent =
		inputSats > 0 ? Math.max(0, ((inputSats - outputSats) / inputSats) * 100) : 0;

	const minTime = Math.min(hop1.estimatedTimeMin, hop2.estimatedTimeMin);
	const maxTime = Math.max(hop1.estimatedTimeMax, hop2.estimatedTimeMax);

	// Gas cost: only use hop1 (source chain) gas. Hop2 gas is on a different
	// chain (different currency) and must NOT be added — adding RBTC wei + ETH
	// wei is meaningless and inflates the fee when converted to sats.
	const gasCostWei = hop1.gasCostWei;

	// Hop2 gas cost (destination chain) — stored separately for fee display.
	// Cannot be added to gasCostWei because currencies differ (RBTC vs ETH).
	const hop2GasCostWei = hop2.gasCostWei ?? undefined;

	// Merge fee costs if present
	const feeCosts = [...(hop1.feeCosts ?? []), ...(hop2.feeCosts ?? [])];

	return {
		id,
		label,
		hops: [hop1, hop2],
		totalFeePercent,
		estimatedTime: `${minTime}-${maxTime} min`,
		recommended: false,
		...(gasCostWei ? { gasCostWei } : {}),
		...(hop2GasCostWei ? { hop2GasCostWei } : {}),
		...(feeCosts.length > 0 ? { feeCosts } : {}),
		outputSats,
		outputAmount: String(outputSats),
		outputDecimals: 8
	};
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Attempt to build a 2-hop route via an intermediary token (typically tBTC on Arbitrum).
 *
 * Two modes:
 *   1. **Boltz-first** (default): Boltz does hop1 (from→intermediary), then tries hop2Providers.
 *   2. **Boltz-last** (when `hop1Provider` is set): The specified provider does hop1
 *      (from→intermediary), then Boltz does hop2 (intermediary→to).
 *
 * Returns null if:
 *   - The pair is not a known 2-hop optimization pair
 *   - The intermediary token is missing from the registry
 *   - Hop1 fails to produce a quote
 *   - No hop2 provider produces a viable quote
 *
 * @param from Source token
 * @param to Destination token
 * @param amountSats Input amount in satoshis
 * @param signal Optional AbortSignal for cancellation
 */
export async function buildBoltzTwoHopRoute(
	from: Token,
	to: Token,
	amountSats: number,
	signal?: AbortSignal,
	/** ETH/USD price for converting Arbitrum gas to comparable cost. */
	ethUsdPrice?: number
): Promise<Route | null> {
	const pairKey = `${from.key}->${to.key}`;
	const config = BOLTZ_TWO_HOP_PAIRS[pairKey];
	if (!config) return null;

	if (signal?.aborted) return null;

	const intermediary = TOKENS[config.intermediary];
	if (!intermediary) {
		debug.warn('Intermediary token %s not found in registry', config.intermediary);
		return null;
	}

	debug.log(
		'Building 2-hop route: %s → %s → %s (%d sats)',
		from.key,
		intermediary.key,
		to.key,
		amountSats
	);

	if (config.hop1Provider) {
		// --- Mode 2: Boltz-last ---
		// hop1 from specified provider (from → intermediary), hop2 from Boltz (intermediary → to)
		return buildBoltzLastRoute(from, to, intermediary, amountSats, config.hop1Provider, signal);
	}

	// --- Mode 1: Boltz-first ---
	// hop1 from Boltz (from → intermediary), hop2 from hop2Providers
	return buildBoltzFirstRoute(from, to, intermediary, amountSats, config.hop2Providers, signal, ethUsdPrice);
}

// ---------------------------------------------------------------------------
// Internal: Boltz-first mode
// ---------------------------------------------------------------------------

async function buildBoltzFirstRoute(
	from: Token,
	to: Token,
	intermediary: Token,
	amountSats: number,
	hop2ProviderNames: ProviderName[],
	signal?: AbortSignal,
	ethUsdPrice?: number
): Promise<Route | null> {
	// Hop 1: Boltz quote (from → intermediary)
	const { data: hop1Quote, error: hop1Error } = await tryCatch(
		boltzProvider.getQuote(from, intermediary, amountSats, signal)
	);

	if (hop1Error || !hop1Quote?.hops[0]) {
		if (hop1Error) debug.warn('Hop1 Boltz quote failed: %s', String(hop1Error));
		return null;
	}

	const hop1 = hop1Quote.hops[0];
	const hop1OutputSats = Math.round(amountSats * (1 - hop1.feePercent / 100));

	if (hop1OutputSats <= 0) {
		debug.warn('Hop1 produced zero/negative output (%d sats from %d)', hop1OutputSats, amountSats);
		return null;
	}

	// Hop 2: Try ALL providers, return the cheapest (lowest total cost = gas + fee)
	let bestRoute: Route | null = null;
	let bestTotalCost = Infinity;

	for (const providerName of hop2ProviderNames) {
		if (signal?.aborted) return bestRoute;

		const provider = PROVIDER_MAP[providerName];
		if (!provider) continue;

		// Check if the provider supports this pair before querying.
		// Without this, providers that have been disabled for specific pairs
		// (e.g., Symbiosis for same-chain Arbitrum) would still be queried
		// and return cross-chain calldata that reverts on-chain.
		if (!provider.supports(intermediary, to)) {
			debug.log('Skipping hop2 provider %s: supports() returned false', providerName);
			continue;
		}

		debug.log(
			'Trying hop2 provider: %s (%s → %s, %d sats)',
			providerName,
			intermediary.key,
			to.key,
			hop1OutputSats
		);

		const { data: hop2Quote, error: hop2Error } = await tryCatch(
			provider.getQuote(intermediary, to, hop1OutputSats, signal)
		);

		if (hop2Error || !hop2Quote?.hops[0]) {
			if (hop2Error) debug.warn('Hop2 %s quote failed: %s', providerName, String(hop2Error));
			continue;
		}

		const hop2 = hop2Quote.hops[0];
		const hop2OutputSats = Math.round(hop1OutputSats * (1 - hop2.feePercent / 100));

		const routeId = `${from.key}->${to.key}-via-boltz-${providerName}`;
		const hop2Label =
			providerName === 'lifi'
				? 'LI.FI'
				: providerName === 'uniswap-v3'
					? 'Uniswap V3'
					: 'Symbiosis';
		const routeLabel = `Boltz → ${hop2Label}`;

		debug.log(
			'2-hop route composed: %s (hop1 output=%d, hop2 output=%d)',
			routeId,
			hop1OutputSats,
			hop2OutputSats
		);

		const route = composeTwoHopRoute(routeId, routeLabel, hop1, hop2, amountSats, hop2OutputSats);

		// Compare hop2 providers by ACTUAL total cost.
		// Use outputValueUsd from the hop2 quote when available for accurate
		// cross-currency comparison (tBTC 18dec → USDT0 6dec makes sats-based
		// feePercent meaningless).
		// Include hop2 Arbitrum gas converted to USD via ethUsdPrice.
		let totalCost: number;

		if (hop2Quote.outputValueUsd && hop2Quote.outputValueUsd > 0) {
			// USD-based comparison: lower cost = better
			// cost = (input_value - output_value) + hop2_gas_usd
			// Since input_value is the same for all providers, compare by:
			// output_value - hop2_gas_usd (higher = better → lower cost)
			const hop2GasWei = hop2.gasCostWei ? Number(BigInt(hop2.gasCostWei)) : 0;
			const hop2GasUsd =
				ethUsdPrice && ethUsdPrice > 0 ? (hop2GasWei / 1e18) * ethUsdPrice : 0;
			// Negate so lower totalCost = better (consistent with the ranking convention)
			totalCost = -(hop2Quote.outputValueUsd - hop2GasUsd);

			debug.log(
				'Hop2 %s: outputUsd=$%s, hop2GasUsd=$%s, totalCost=%d',
				providerName,
				hop2Quote.outputValueUsd.toFixed(4),
				hop2GasUsd.toFixed(4),
				totalCost
			);
		} else {
			// Fallback: sats-based comparison (legacy path for providers without USD values)
			const gasSats = route.gasCostWei
				? (() => {
						try {
							return Number(BigInt(route.gasCostWei) / 10_000_000_000n);
						} catch {
							return 0;
						}
					})()
				: 0;
			const bridgeFeeSats = Math.round((amountSats * route.totalFeePercent) / 100);
			totalCost = gasSats + bridgeFeeSats;

			debug.log(
				'Hop2 %s: output=%d sats, gas=%d sats, bridgeFee=%d sats, totalCost=%d sats (fallback)',
				providerName, hop2OutputSats, gasSats, bridgeFeeSats, totalCost
			);
		}

		if (totalCost < bestTotalCost) {
			bestTotalCost = totalCost;
			bestRoute = route;
		}
	}

	if (bestRoute) {
		debug.log(
			'Best 2-hop route: %s (totalCost=%d sats, %d providers tried)',
			bestRoute.id,
			bestTotalCost,
			hop2ProviderNames.length
		);
	} else {
		debug.log('No hop2 provider succeeded for Boltz-first route');
	}

	return bestRoute;
}

// ---------------------------------------------------------------------------
// Internal: Boltz-last mode
// ---------------------------------------------------------------------------

async function buildBoltzLastRoute(
	from: Token,
	to: Token,
	intermediary: Token,
	amountSats: number,
	hop1ProviderName: ProviderName,
	signal?: AbortSignal
): Promise<Route | null> {
	const hop1Provider = PROVIDER_MAP[hop1ProviderName];
	if (!hop1Provider) {
		debug.warn('Hop1 provider %s not found in provider map', hop1ProviderName);
		return null;
	}

	// Check if the provider supports this pair before querying
	if (!hop1Provider.supports(from, intermediary)) {
		debug.log(
			'Skipping Boltz-last: hop1 provider %s does not support %s → %s',
			hop1ProviderName,
			from.key,
			intermediary.key
		);
		return null;
	}

	// Hop 1: specified provider (from → intermediary)
	debug.log(
		'Trying hop1 provider: %s (%s → %s, %d sats)',
		hop1ProviderName,
		from.key,
		intermediary.key,
		amountSats
	);

	const { data: hop1Quote, error: hop1Error } = await tryCatch(
		hop1Provider.getQuote(from, intermediary, amountSats, signal)
	);

	if (hop1Error || !hop1Quote?.hops[0]) {
		if (hop1Error) debug.warn('Hop1 %s quote failed: %s', hop1ProviderName, String(hop1Error));
		return null;
	}

	const hop1 = hop1Quote.hops[0];
	const hop1OutputSats = Math.round(amountSats * (1 - hop1.feePercent / 100));

	if (hop1OutputSats <= 0) {
		debug.warn('Hop1 produced zero/negative output (%d sats from %d)', hop1OutputSats, amountSats);
		return null;
	}

	// Hop 2: Boltz (intermediary → to)
	if (signal?.aborted) return null;

	debug.log('Trying hop2 Boltz (%s → %s, %d sats)', intermediary.key, to.key, hop1OutputSats);

	const { data: hop2Quote, error: hop2Error } = await tryCatch(
		boltzProvider.getQuote(intermediary, to, hop1OutputSats, signal)
	);

	if (hop2Error || !hop2Quote?.hops[0]) {
		if (hop2Error) debug.warn('Hop2 Boltz quote failed: %s', String(hop2Error));
		return null;
	}

	const hop2 = hop2Quote.hops[0];
	const hop2OutputSats = Math.round(hop1OutputSats * (1 - hop2.feePercent / 100));

	const providerLabel =
		hop1ProviderName === 'lifi'
			? 'LI.FI'
			: hop1ProviderName === 'uniswap-v3'
				? 'Uniswap V3'
				: hop1ProviderName;
	const routeId = `${from.key}->${to.key}-via-${hop1ProviderName}-boltz`;
	const routeLabel = `${providerLabel} → Boltz`;

	debug.log(
		'2-hop route composed: %s (hop1 output=%d, hop2 output=%d)',
		routeId,
		hop1OutputSats,
		hop2OutputSats
	);

	return composeTwoHopRoute(routeId, routeLabel, hop1, hop2, amountSats, hop2OutputSats);
}
