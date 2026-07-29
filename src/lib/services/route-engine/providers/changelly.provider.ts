/**
 * Changelly Provider Adapter — Route Engine
 *
 * Wraps the existing `changellyService` singleton into the `SwapProvider` interface.
 * Handles USDT→BTC (BSC source), USDT→wBTC (Arb), and dynamic "other" tab currencies
 * via Changelly's getCurrencies() API.
 *
 * Currency discovery is cached in-memory for synchronous `supports()` checks.
 * Call `loadCurrencies()` to preload the cache before route resolution.
 */

import type { SwapProvider, Token, Route, RouteHop } from '../types';
import { changellyService, type ChangellyCurrency } from '$lib/services/changelly.service';
import { isChangeallySwapsEnabled } from '$lib/services/kill-switch';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('changelly-provider');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Static pairs that Changelly always supports (regardless of getCurrencies cache). */
const STATIC_PAIRS: ReadonlySet<string> = new Set(['usdt-bsc:btc', 'usdt-bsc:wbtc-arb']);

/** Estimated swap time in minutes. */
const ESTIMATED_TIME_MIN = 5;
const ESTIMATED_TIME_MAX = 30;

// ---------------------------------------------------------------------------
// Currency cache
// ---------------------------------------------------------------------------

/** Cached map of lowercase ticker → ChangellyCurrency. Populated by `loadCurrencies()`. */
let currencyCache: Map<string, ChangellyCurrency> | null = null;
let currencyLoadPromise: Promise<void> | null = null;

/**
 * Preload the Changelly currency cache.
 * Safe to call multiple times — subsequent calls return immediately if already loaded.
 * Exported for explicit preloading by the rune/UI before route resolution.
 */
export async function loadCurrencies(): Promise<void> {
	if (currencyCache) return;

	// Deduplicate concurrent calls
	if (currencyLoadPromise) {
		await currencyLoadPromise;
		return;
	}

	currencyLoadPromise = (async () => {
		const { data: currencies, error } = await tryCatch(changellyService.getCurrencies());
		if (error || !currencies) {
			debug.warn('Failed to preload Changelly currencies: %s', error?.message ?? 'empty response');
			currencyCache = new Map();
			return;
		}

		currencyCache = new Map();
		for (const currency of currencies) {
			if (currency.enabled) {
				currencyCache.set(currency.ticker.toLowerCase(), currency);
			}
		}
		debug.log('Loaded %d Changelly currencies', currencyCache.size);
	})();

	await currencyLoadPromise;
}

/**
 * Reset the currency cache. Exported for testing only.
 * Allows tests to reload currencies with fresh mock data.
 */
export function resetCurrencyCache(): void {
	currencyCache = null;
	currencyLoadPromise = null;
}

/** Check if a ticker exists in the cached currency list. Returns false if cache not loaded. */
function isInCurrencyCache(ticker: string): boolean {
	if (!currencyCache) return false;
	return currencyCache.has(ticker.toLowerCase());
}

// ---------------------------------------------------------------------------
// Amount conversion helpers
// ---------------------------------------------------------------------------

/**
 * Convert BTC satoshis to a human-readable BTC amount.
 *
 * `amountSats` is always in BTC satoshis (8 decimal places). Changelly expects
 * amounts in the source token's human-readable units. For BTC-pegged sources
 * this is correct (sats → BTC). For non-BTC sources (e.g. USDT-BSC), this
 * returns the BTC-equivalent amount which Changelly uses for its internal
 * conversion. This is a known limitation — a price oracle would be needed for
 * exact stablecoin amounts.
 */
function satsToHumanAmount(amountSats: number): string {
	return (amountSats / 1e8).toFixed(8);
}

/**
 * Convert a human-readable Changelly amount back to BTC satoshis (integer).
 * Mirrors `satsToHumanAmount` — always uses 1e8 (BTC precision).
 */
function humanAmountToSats(amount: string): number {
	return Math.round(parseFloat(amount) * 1e8);
}

// ---------------------------------------------------------------------------
// Route builder
// ---------------------------------------------------------------------------

function buildChangellyRoute(
	from: Token,
	to: Token,
	inputSats: number,
	outputSats: number,
	rawOutputAmount?: string
): Route {
	const feePercent = inputSats > 0 ? ((inputSats - outputSats) / inputSats) * 100 : 0;

	const hop: RouteHop = {
		service: 'changelly',
		fromAsset: from.symbol,
		fromChain: from.chain,
		toAsset: to.symbol,
		toChain: to.chain,
		feePercent,
		estimatedTimeMin: ESTIMATED_TIME_MIN,
		estimatedTimeMax: ESTIMATED_TIME_MAX
	};

	return {
		id: `changelly-${from.key}-to-${to.key}`,
		label: 'Changelly',
		hops: [hop],
		totalFeePercent: feePercent,
		estimatedTime: `${ESTIMATED_TIME_MIN}-${ESTIMATED_TIME_MAX} min`,
		recommended: false,
		outputSats,
		outputAmount: rawOutputAmount,
		outputDecimals: to.decimals
	};
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export const changellyProvider: SwapProvider = {
	name: 'changelly',

	supports(from: Token, to: Token): boolean {
		if (!isChangeallySwapsEnabled()) return false;

		// Check static pairs first (no network dependency)
		const pairKey = `${from.key}:${to.key}`;
		if (STATIC_PAIRS.has(pairKey)) return true;

		// Dynamic check: if both tickers are in the cached currency list
		if (isInCurrencyCache(from.symbol) && isInCurrencyCache(to.symbol)) return true;

		return false;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		_signal?: AbortSignal
	): Promise<Route | null> {
		if (!amountSats || amountSats <= 0 || !Number.isFinite(amountSats)) {
			debug.warn('getQuote rejected: invalid amount %d', amountSats);
			return null;
		}

		// Ensure currencies are loaded before quoting
		await loadCurrencies();

		// Convert sats → human-readable BTC amount for Changelly API
		// NOTE: ChangellyService.estimateSwap does not accept an external AbortSignal.
		// Signal is accepted for interface compliance but cannot be forwarded.
		const humanAmount = satsToHumanAmount(amountSats);

		debug.log('Estimating Changelly swap: %s %s → %s', humanAmount, from.symbol, to.symbol);

		const { data: estimate, error } = await tryCatch(
			changellyService.estimateSwap({
				from: from.symbol.toLowerCase(),
				to: to.symbol.toLowerCase(),
				amount: humanAmount
			})
		);

		if (error || !estimate) {
			debug.warn('Changelly estimateSwap failed: %s', error?.message ?? 'null result');
			return null;
		}

		// Parse estimated output amount → BTC sats
		const outputSats = humanAmountToSats(estimate.estimatedAmount);
		if (outputSats <= 0) {
			debug.warn('Changelly returned zero/negative output: %s', estimate.estimatedAmount);
			return null;
		}

		return buildChangellyRoute(from, to, amountSats, outputSats, estimate.estimatedAmount);
	}
};
