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

		// Convert Symbiosis bridge fee to wei format (18-decimal equivalent).
		// The rune's networkFeeSats divides gasCostWei by 1e10 to get sats,
		// so we normalize all fee units to wei regardless of output token decimals.
		// - 18 dec (RBTC): fee already in wei → use as-is
		// - 8 dec (WBTC): fee in sats → multiply by 1e10
		// - 6 dec (USDT0): fee in micro → multiply by 1e12
		let gasCostWei: string | undefined;
		if (quote.fee) {
			try {
				const feeRaw = BigInt(quote.fee);
				const weiScale = BigInt(10) ** BigInt(18 - to.decimals);
				gasCostWei = (feeRaw * weiScale).toString();
				debug.log(
					'Symbiosis fee: raw=%s %s dec → gasCostWei=%s',
					quote.fee,
					to.decimals,
					gasCostWei
				);
			} catch (_e) {
				debug.warn('Failed to parse Symbiosis fee: %s', quote.fee);
			}
		}

		// USD values for cross-currency cost comparison.
		// amountInUsd from Symbiosis API is in micro-USD (6 decimals).
		let inputValueUsd = 0;
		if (quote.amountInUsd?.amount) {
			const raw = Number(quote.amountInUsd.amount);
			if (isFinite(raw) && raw > 0) {
				inputValueUsd = raw / 1e6; // micro-USD → USD
			}
		}
		debug.log(
			'Symbiosis USD: amountInUsd.raw=%s → inputValueUsd=$%s',
			quote.amountInUsd?.amount ?? 'missing',
			inputValueUsd.toFixed(4)
		);

		// For stablecoin outputs (USDT0, USDC), raw / 10^decimals = USD.
		// For non-stablecoins, approximate from input value (bridge fee is small).
		const STABLECOIN_DECIMALS = new Set([6]);
		const outputValueUsd = STABLECOIN_DECIMALS.has(to.decimals)
			? Number(quote.tokenAmountOut.amount) / 10 ** to.decimals
			: inputValueUsd; // approximate — will be refined with price feeds

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
					estimatedTimeMax: quote.estimatedTime ?? 10,
					gasCostWei
				}
			],
			totalFeePercent: Math.max(0, feePercent),
			estimatedTime: `${quote.estimatedTime ?? 10} min`,
			recommended: false,
			gasCostWei,
			outputSats,
			outputAmount: quote.tokenAmountOut.amount,
			outputDecimals: to.decimals,
			inputValueUsd,
			outputValueUsd
		};

		return route;
	}
};
