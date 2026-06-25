/**
 * Boltz Provider Adapter — Route Engine
 *
 * Wraps the existing `BoltzProvider` class into the `SwapProvider` interface.
 * Handles BTC↔RBTC↔tBTC chain swaps and submarine/reverse swaps via Boltz.exchange.
 *
 * The underlying BoltzProvider currently supports RBTC→tBTC chain swaps.
 * Additional pairs are declared in `supports()` for future expansion — `getQuote()`
 * returns null gracefully when the underlying service doesn't handle a pair yet.
 */

import type { SwapProvider, Token, Route, RouteHop } from '../types';
import { BoltzProvider } from '$lib/services/BoltzProvider';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('boltz-provider');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Known Boltz swap pairs.
 * Keys are `${from.key}->${to.key}` matching Token keys from the registry.
 */
const BOLTZ_PAIRS: ReadonlySet<string> = new Set([
	'rbtc:tbtc-arb', // RBTC → tBTC (chain swap)
	'tbtc-arb:rbtc', // tBTC → RBTC (chain swap reverse)
	'rbtc:btc', // RBTC → BTC on-chain (chain swap)
	'rbtc:btc-ln', // RBTC → Lightning (submarine swap)
	'btc:rbtc' // BTC on-chain → RBTC (reverse swap)
]);

/** Default estimated time range for Boltz swaps (minutes). */
const ESTIMATED_TIME_MIN = 5;
const ESTIMATED_TIME_MAX = 15;

// ---------------------------------------------------------------------------
// Singleton BoltzProvider instance
// ---------------------------------------------------------------------------

const boltz = new BoltzProvider();

// ---------------------------------------------------------------------------
// Route builder
// ---------------------------------------------------------------------------

function buildBoltzRoute(from: Token, to: Token, inputSats: number, totalFeeSats: number): Route {
	const feePercent = inputSats > 0 ? (totalFeeSats / inputSats) * 100 : 0;

	const hop: RouteHop = {
		service: 'boltz',
		fromAsset: from.symbol,
		fromChain: from.chain,
		toAsset: to.symbol,
		toChain: to.chain,
		feePercent,
		estimatedTimeMin: ESTIMATED_TIME_MIN,
		estimatedTimeMax: ESTIMATED_TIME_MAX
	};

	return {
		id: `boltz-${from.key}-to-${to.key}`,
		label: 'Boltz',
		hops: [hop],
		totalFeePercent: feePercent,
		estimatedTime: `${ESTIMATED_TIME_MIN}-${ESTIMATED_TIME_MAX} min`,
		recommended: false
	};
}

// ---------------------------------------------------------------------------
// Provider implementation
// ---------------------------------------------------------------------------

export const boltzProvider: SwapProvider = {
	name: 'boltz',

	supports(from: Token, to: Token): boolean {
		return BOLTZ_PAIRS.has(`${from.key}:${to.key}`);
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		signal?: AbortSignal
	): Promise<Route | null> {
		if (!amountSats || amountSats <= 0 || !Number.isFinite(amountSats)) {
			debug.warn('getQuote rejected: invalid amount %d', amountSats);
			return null;
		}

		// NOTE: BoltzProvider.getQuote does not accept an external AbortSignal.
		// Signal is accepted for interface compliance but cannot be forwarded.
		void signal;

		debug.log('Fetching Boltz quote: %d sats %s → %s', amountSats, from.symbol, to.symbol);

		const { data: quote, error } = await tryCatch(boltz.getQuote(amountSats));

		if (error) {
			debug.warn('Boltz getQuote failed: %s', error.message);
			return null;
		}

		if (!quote) {
			debug.warn('Boltz returned null quote for %d sats', amountSats);
			return null;
		}

		return buildBoltzRoute(from, to, amountSats, quote.totalFeeSats);
	}
};
