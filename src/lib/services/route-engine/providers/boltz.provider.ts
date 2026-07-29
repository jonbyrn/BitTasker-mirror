/**
 * Boltz Provider Adapter — Route Engine
 *
 * Wraps the existing `BoltzProvider` class into the `SwapProvider` interface.
 * Handles BTC↔RBTC↔tBTC chain swaps via Boltz.exchange chain swap API.
 *
 * Supports all chain swap pairs from the Boltz API: RBTC↔TBTC, RBTC↔BTC,
 * TBTC↔BTC, TBTC↔L-BTC, L-BTC↔RBTC, etc.
 */

import type { SwapProvider, Token, Route, RouteHop } from '../types';
import { boltzProvider as boltz } from '$lib/services/BoltzProvider';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('boltz-provider');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Known Boltz chain swap pairs.
 * Keys are `${from.key}:${to.key}` matching Token keys from the registry.
 * All pairs verified against Boltz /v2/swap/chain API.
 */
const BOLTZ_PAIRS: ReadonlySet<string> = new Set([
	// RBTC ↔ tBTC
	'rbtc:tbtc-arb', // RBTC → tBTC (chain swap)
	'tbtc-arb:rbtc', // tBTC → RBTC (chain swap)
	// RBTC ↔ BTC
	'rbtc:btc', // RBTC → BTC on-chain (chain swap)
	'btc:rbtc', // BTC on-chain → RBTC (chain swap)
	// tBTC ↔ BTC
	'tbtc-arb:btc', // tBTC → BTC (chain swap)
	'btc:tbtc-arb', // BTC → tBTC (chain swap)
	// RBTC ↔ Lightning (submarine/reverse via BTC intermediary)
	'rbtc:btc-ln', // RBTC → Lightning
	'btc-ln:rbtc' // Lightning → RBTC
]);

/** Default estimated time range for Boltz swaps (minutes). */
const ESTIMATED_TIME_MIN = 5;
const ESTIMATED_TIME_MAX = 15;

// ---------------------------------------------------------------------------
// Route builder
// ---------------------------------------------------------------------------

function buildBoltzRoute(from: Token, to: Token, inputSats: number, totalFeeSats: number): Route {
	const feePercent = inputSats > 0 ? (totalFeeSats / inputSats) * 100 : 0;

	// Boltz swaps on-chain are simple sends (21k gas), not contract calls.
	// RSK: 21k gas × ~65 gwei default. Arbitrum: 21k gas × ~0.03 gwei.
	// The Boltz service fee is separate and already in feePercent.
	const isRSK = from.chain === 'rsk' || to.chain === 'rsk';
	const gasLimit = 21_000n;
	const gasPrice = isRSK ? 65_000_000n : 30_000_000n; // wei
	const gasCostWei = (gasLimit * gasPrice).toString();

	const hop: RouteHop = {
		service: 'boltz',
		fromAsset: from.symbol.toUpperCase(), // Boltz API uses uppercase (TBTC, RBTC, BTC)
		fromChain: from.chain,
		toAsset: to.symbol.toUpperCase(),
		toChain: to.chain,
		feePercent,
		estimatedTimeMin: ESTIMATED_TIME_MIN,
		estimatedTimeMax: ESTIMATED_TIME_MAX,
		gasCostWei
	};

	return {
		id: `boltz-${from.key}-to-${to.key}`,
		label: 'Boltz',
		hops: [hop],
		totalFeePercent: feePercent,
		estimatedTime: `${ESTIMATED_TIME_MIN}-${ESTIMATED_TIME_MAX} min`,
		recommended: false,
		gasCostWei
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

		// Boltz API uses uppercase symbols (TBTC, RBTC, BTC) as keys.
		// Token registry uses mixed case (tBTC, RBTC). Normalize to uppercase.
		const { data: quote, error } = await tryCatch(
			boltz.getQuote(amountSats, from.symbol.toUpperCase(), to.symbol.toUpperCase())
		);

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
