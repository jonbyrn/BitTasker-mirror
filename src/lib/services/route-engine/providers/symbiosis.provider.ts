/**
 * Symbiosis Provider Adapter
 *
 * Wraps symbiosisService into the SwapProvider interface for the route engine.
 * Handles EVM↔EVM cross-chain swaps and same-chain DEX swaps on RSK, BSC, and Arbitrum.
 * Does NOT handle Bitcoin or Lightning routes.
 */

import type { SwapProvider, Token } from '../types';
import type { Route } from '$lib/services/route-resolver';
import { satsToTokenAmount, tokenAmountToSats } from '../utils/amount-conversion';
import { symbiosisService } from '$lib/services/symbiosis.service';
import { isSymbiosisEnabled } from '$lib/services/kill-switch';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('symbiosis-provider');

/** Placeholder address for quote-only calls (no real execution). */
const FALLBACK_ADDR = '0x0000000000000000000000000000000000000001';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const symbiosisProvider: SwapProvider = {
	name: 'symbiosis',

	supports(from: Token, to: Token): boolean {
		if (!isSymbiosisEnabled()) return false;

		// Exclude Bitcoin/Lightning — Symbiosis is EVM-only
		if (from.chain === 'bitcoin' || from.chain === 'lightning') return false;
		if (to.chain === 'bitcoin' || to.chain === 'lightning') return false;

		// Cross-chain EVM swaps from supported source chains
		if (from.chain === 'rsk' && to.chain !== 'rsk') return true;
		if (from.chain === 'bsc' && to.chain !== 'bsc') return true;
		if (from.chain === 'arbitrum' && to.chain !== 'arbitrum') return true;

		// Same-chain RSK DEX swaps (e.g. USDT0↔RBTC, DOC→USDT0)
		if (from.chain === 'rsk' && to.chain === 'rsk' && from.key !== to.key) return true;

		// Same-chain Arbitrum DEX swaps (e.g. WBTC↔USDT0, tBTC↔WBTC)
		if (from.chain === 'arbitrum' && to.chain === 'arbitrum' && from.key !== to.key) return true;

		return false;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		_signal?: AbortSignal
	): Promise<Route | null> {
		const { data: quote, error } = await tryCatch(
			(async () => {
				const amountIn = satsToTokenAmount(amountSats, from.decimals);

				debug.log(
					'Requesting quote: %s %s → %s %s (%s sats)',
					from.symbol,
					from.chain,
					to.symbol,
					to.chain,
					amountSats
				);

				// NOTE: symbiosisService.getQuote does not accept an external AbortSignal.
				// Signal is accepted for interface compliance but cannot be forwarded.
				const response = await symbiosisService.getQuote({
					tokenAmountIn: {
						address: from.address,
						chainId: from.chainId,
						symbol: from.symbol,
						decimals: from.decimals,
						amount: amountIn
					},
					tokenOut: {
						address: to.address,
						chainId: to.chainId,
						symbol: to.symbol,
						decimals: to.decimals
					},
					slippage: 50,
					from: FALLBACK_ADDR,
					to: FALLBACK_ADDR
				});

				return response;
			})()
		);

		if (error || !quote?.tokenAmountOut?.amount) {
			if (error) debug.error('Symbiosis quote failed: %s', String(error));
			return null;
		}

		const outputSats = tokenAmountToSats(quote.tokenAmountOut.amount, to.decimals);
		if (outputSats <= 0) return null;

		const feePercent = amountSats > 0 ? ((amountSats - outputSats) / amountSats) * 100 : 0;

		const route: Route = {
			id: `symbiosis-${from.key}-${to.key}`,
			label: `Symbiosis (${from.symbol} → ${to.symbol})`,
			hops: [
				{
					service: 'symbiosis',
					fromAsset: from.symbol,
					fromChain: from.chain,
					toAsset: to.symbol,
					toChain: to.chain,
					feePercent: Math.max(0, feePercent),
					estimatedTimeMin: 1,
					estimatedTimeMax: quote.estimatedTime ?? 10
				}
			],
			totalFeePercent: Math.max(0, feePercent),
			estimatedTime: `${quote.estimatedTime ?? 10} min`,
			recommended: false
		};

		return route;
	}
};
