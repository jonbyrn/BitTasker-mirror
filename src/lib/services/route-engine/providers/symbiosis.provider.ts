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
		// Check kill-switch first
		if (!isSymbiosisEnabled()) return false;
		// Symbiosis doesn't handle Bitcoin or Lightning chains
		if (from.chain === 'bitcoin' || to.chain === 'bitcoin') return false;
		if (from.chain === 'lightning' || to.chain === 'lightning') return false;
		if (from.chain === to.chain) return false;
		if (from.key === to.key) return false;
		return true;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		_signal?: AbortSignal,
		sourceAmountRaw?: string
	): Promise<Route | null> {
		const { data: quote, error } = await tryCatch(
			(async () => {
				// Use raw source amount when available (non-BTC tokens like USDT0).
				// satsToTokenAmount does a pure decimal conversion that is wrong
				// for stablecoins (e.g., 8333 sats → 83 micro-USDT instead of 5M).
				const amountIn = sourceAmountRaw ?? satsToTokenAmount(amountSats, from.decimals);

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

		const rawOutputSats = tokenAmountToSats(quote.tokenAmountOut.amount, to.decimals);
		if (rawOutputSats <= 0) return null;

		// Parse Symbiosis bridge fee.
		// quote.fee can be a number/string (raw amount in output decimals) OR an object
		// like { amount: '750000', decimals: 6, symbol: 'USD₮0' } for cross-chain routes.
		// IMPORTANT: quote.fee is the bridge/LP service fee, NOT the on-chain gas cost.
		// It must be stored as bridgeFeeUsd, never as gasCostWei.
		let bridgeFeeUsd = 0;
		let gasCostWei: string | undefined;
		// USD values for cross-currency cost comparison.
		// amountInUsd from Symbiosis API is in micro-USD (6 decimals).
		let inputValueUsd = 0
		if (quote.fee) {
			if (typeof quote.fee === 'object' && quote.fee !== null && 'amount' in quote.fee) {
				// Object format: fee may be in a stablecoin (USDT0) or native token (ETH).
				// Use priceUsd when available to convert to actual USD value.
				const feeAmount = Number((quote.fee as { amount: string }).amount);
				const feeDecimals = (quote.fee as { decimals: number }).decimals ?? 6;
				const feePriceUsd = parseFloat((quote.fee as { priceUsd?: string }).priceUsd ?? '0');
				if (isFinite(feeAmount) && feeAmount > 0) {
					const feeInTokenUnits = feeAmount / 10 ** feeDecimals;
					// If priceUsd is available, multiply to get actual USD value.
					// Otherwise treat as stablecoin (1:1 USD).
					bridgeFeeUsd = feePriceUsd > 0 ? feeInTokenUnits * feePriceUsd : feeInTokenUnits;
					debug.log(
						'Symbiosis fee object: %s %s (priceUsd=%s) → $%s',
						(quote.fee as { amount: string }).amount,
						(quote.fee as { symbol: string }).symbol ?? '?',
						feePriceUsd > 0 ? feePriceUsd.toFixed(2) : 'N/A',
						bridgeFeeUsd.toFixed(4)
					);
				}
			} else {
				// Numeric format: raw amount in output token decimals.
				// This is the bridge/LP fee, NOT gas. Convert to USD for cost comparison.
				try {
					const feeRaw = Number(quote.fee);
					if (isFinite(feeRaw) && feeRaw > 0) {
						// Convert from output token's smallest unit to USD
						// For stablecoins (6 decimals): raw / 1e6 = USD
						// For BTC-tokens (8/18 decimals): raw / 10^decimals * btcPrice
						if (to.decimals === 6) {
							bridgeFeeUsd = feeRaw / 10 ** to.decimals;
						} else {
							// BTC-denominated: convert via input value ratio
							bridgeFeeUsd = inputValueUsd > 0
								? (feeRaw / (Number(quote.tokenAmountOut.amount) || 1)) * inputValueUsd
								: 0;
						}
						debug.log(
							'Symbiosis fee raw: %s → bridgeFeeUsd=$%s',
							quote.fee,
							bridgeFeeUsd.toFixed(6)
						);
					}
				} catch (_e) {
					debug.warn('Failed to parse Symbiosis fee: %s', quote.fee);
				}
			}
		}
;
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

		// Compute feePercent. Use USD values when available (cross-currency accurate).
		// Cap at 0 — if price feed says output > input, the difference is rounding noise.
		let feePercent: number;
		if (bridgeFeeUsd > 0 && inputValueUsd > 0) {
			feePercent = (bridgeFeeUsd / inputValueUsd) * 100;
		} else {
			feePercent =
				amountSats > 0 ? Math.max(0, ((amountSats - rawOutputSats) / amountSats) * 100) : 0;
		}

		// Cap outputSats at inputSats — never show "profit" from price feed rounding.
		const outputSats = Math.min(rawOutputSats, amountSats);

		// Estimate on-chain gas for Symbiosis swaps.
		// Symbiosis router is a complex aggregator: ~6.4M gas on Arbitrum.
		// This is much higher than simple DEX swaps (~150-200K gas).
		// Use realistic estimates so route ranking can compare fairly.
		if (!gasCostWei && to.chain === 'rsk') {
			gasCostWei = (6_400_000n * 65_000_000n).toString(); // ~416M wei ≈ 41.6 sats
		} else if (!gasCostWei && to.chain === 'arbitrum') {
			gasCostWei = (6_400_000n * 1_000_000_000n).toString(); // 6.4B wei ≈ 0.0064 ETH
		} else if (!gasCostWei) {
			gasCostWei = (6_400_000n * 1_000_000_000n).toString(); // conservative fallback
		}

		// For stablecoin outputs (USDT0, USDC), raw / 10^decimals = USD.
		// For non-stablecoins, do NOT approximate from input value — that makes
		// the route appear zero-cost in ranking (feeUsd = input - output ≈ 0).
		// Leave undefined so rankRoutes() falls back to feePercent-based calculation.
		const STABLECOIN_DECIMALS = new Set([6]);
		const outputValueUsd = STABLECOIN_DECIMALS.has(to.decimals)
			? Number(quote.tokenAmountOut.amount) / 10 ** to.decimals
			: undefined;

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
