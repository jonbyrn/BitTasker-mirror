/**
 * LI.FI Provider Adapter
 *
 * Wraps lifiService into the SwapProvider interface for the route engine.
 * Handles any EVM↔EVM cross-chain and same-chain DEX swaps.
 * Also handles EVM→Bitcoin via bridges.
 * Does NOT originate from Bitcoin or Lightning.
 */

import type { SwapProvider, Token } from '../types';
import type { Route } from '$lib/services/route-resolver';
import { satsToTokenAmount, tokenAmountToSats } from '../utils/amount-conversion';
import { lifiService } from '$lib/services/lifi.service';
import { isLifiEnabled } from '$lib/services/kill-switch';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('lifi-provider');

/** Placeholder address for quote-only calls (no real execution). */
const FALLBACK_ADDR = '0x0000000000000000000000000000000000000001';

// ---------------------------------------------------------------------------
// Chain ID mapping (chain name → numeric chain ID)
// ---------------------------------------------------------------------------

const CHAIN_NAME_TO_ID: Record<string, number> = {
	rsk: 30,
	bsc: 56,
	arbitrum: 42161,
	bitcoin: 0
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const lifiProvider: SwapProvider = {
	name: 'lifi',

	supports(from: Token, to: Token): boolean {
		if (!isLifiEnabled()) return false;

		// LI.FI does not originate from Bitcoin or Lightning
		if (from.chain === 'bitcoin' || from.chain === 'lightning') return false;

		// LI.FI can target any chain except Lightning
		if (to.chain === 'lightning') return false;

		// Skip same-chain same-token transfers (direct send, not a swap)
		if (from.chain === to.chain && from.key === to.key) return false;

		return true;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		signal?: AbortSignal,
		sourceAmountRaw?: string
	): Promise<Route | null> {
		// NOTE: lifiService.getQuote does not accept an external AbortSignal.
		// Signal is accepted for interface compliance but cannot be forwarded.
		void signal;
		const { data: route, error } = await tryCatch(
			(async () => {
				const fromChainId = CHAIN_NAME_TO_ID[from.chain] ?? from.chainId;
				const toChainId = CHAIN_NAME_TO_ID[to.chain] ?? to.chainId;
				const fromAmount = sourceAmountRaw ?? satsToTokenAmount(amountSats, from.decimals);

				debug.log(
					'Requesting quote: %s (chain %s) → %s (chain %s) (%s sats)',
					from.symbol,
					fromChainId,
					to.symbol,
					toChainId,
					amountSats
				);

				const lifiRoute = await lifiService.getQuote({
					fromChain: fromChainId,
					toChain: toChainId,
					fromToken: from.address,
					toToken: to.address,
					fromAmount,
					fromAddress: FALLBACK_ADDR
				});

				return lifiRoute;
			})()
		);

		if (error || !route?.estimate?.toAmount) {
			if (error) debug.error('LI.FI quote failed: %s', String(error));
			return null;
		}

		const outputSats = tokenAmountToSats(route.estimate.toAmount, to.decimals);
		if (outputSats <= 0) return null;

		const feePercent = amountSats > 0 ? ((amountSats - outputSats) / amountSats) * 100 : 0;

		// Extract gas cost and fee costs from estimate
		const gasCostWei = route.estimate.gasCosts?.[0]?.amount;
		const feeCosts = route.estimate.feeCosts?.map((fc) => ({
			name: fc.name,
			amount: fc.amount
		}));

		const result: Route = {
			id: `lifi-${from.key}-${to.key}`,
			label: `LI.FI (${from.symbol} → ${to.symbol})`,
			hops: [
				{
					service: 'lifi',
					fromAsset: from.symbol,
					fromChain: from.chain,
					toAsset: to.symbol,
					toChain: to.chain,
					feePercent: Math.max(0, feePercent),
					estimatedTimeMin: 1,
					estimatedTimeMax: Math.max(1, Math.ceil(route.estimate.executionDuration / 60)),
					gasCostWei,
					feeCosts
				}
			],
			totalFeePercent: Math.max(0, feePercent),
			estimatedTime: `${Math.max(1, Math.ceil(route.estimate.executionDuration / 60))} min`,
			recommended: false,
			gasCostWei,
			feeCosts,
			outputSats,
			outputAmount: route.estimate.toAmount,
			outputDecimals: to.decimals,
			inputValueUsd: [6, 8, 18].includes(from.decimals)
				? (Number(route.estimate.fromAmount) / 10 ** from.decimals) *
					(route.fromToken?.priceUSD ? parseFloat(route.fromToken.priceUSD) : 0)
				: undefined,
			outputValueUsd: [6, 8].includes(to.decimals)
				? Number(route.estimate.toAmount) / 10 ** to.decimals
				: undefined
		};

		return result;
	}
};
