/**
 * Route Engine — Direct Provider
 *
 * Handles same-token, same-chain transfers (no swap needed).
 * Supports: same key OR same chain + same symbol.
 * Always returns a Route — never null.
 */

import type { Token, Route, SwapProvider } from '../types';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('route-engine:direct');

export const directProvider: SwapProvider = {
	name: 'direct',

	supports(from: Token, to: Token): boolean {
		// Same token key → direct transfer
		if (from.key === to.key) return true;
		// Same chain and same symbol → functionally equivalent token
		if (from.chain === to.chain && from.symbol === to.symbol) return true;
		return false;
	},

	async getQuote(from: Token, to: Token, amountSats: number): Promise<Route> {
		debug.log('Direct transfer: %s → %s, amount=%d sats', from.key, to.key, amountSats);

		const hop = {
			service: 'direct' as const,
			fromAsset: from.symbol,
			fromChain: from.chain,
			toAsset: to.symbol,
			toChain: to.chain,
			feePercent: 0,
			estimatedTimeMin: 0,
			estimatedTimeMax: 1
		};

		return {
			id: `direct-${from.key}-${to.key}-${amountSats}`,
			label: `Direct ${from.symbol} transfer`,
			hops: [hop],
			totalFeePercent: 0,
			estimatedTime: '<1 min',
			recommended: false,
			outputSats: amountSats,
			outputAmount: String(amountSats),
			outputDecimals: to.decimals
		};
	}
};
