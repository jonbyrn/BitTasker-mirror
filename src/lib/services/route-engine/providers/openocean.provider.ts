/**
 * Route Engine — OpenOcean DEX Provider
 *
 * Provides DOC → USDT0 swap quotes on RSK (Rootstock) via OpenOcean's
 * DEX aggregator API. No API key required.
 *
 * Use case: Same-chain stablecoin swaps on RSK where Uniswap V3 / Sovryn
 * may not have direct pools.
 */

import type { SwapProvider, Token, Route, RouteHop } from '../types';
import { createDebug } from '$lib/utils/debug';
import { isOpenOceanEnabled } from '$lib/services/kill-switch';

const debug = createDebug('route-engine:openocean');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENOCEAN_BASE_URL = 'https://open-api.openocean.finance/v4/rootstock';
const REQUEST_TIMEOUT_MS = 10_000;

/** Supported pairs on RSK */
const SUPPORTED_PAIRS: Record<string, { inAddr: string; outAddr: string; inDec: number; outDec: number }> = {
	// DOC → USDT0
	'doc-rsk:usdt0-rsk': {
		inAddr: '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db',
		outAddr: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
		inDec: 18,
		outDec: 6
	},
	// USDT0 → DOC
	'usdt0-rsk:doc-rsk': {
		inAddr: '0x779Ded0c9e1022225f8E0630b35a9b54bE713736',
		outAddr: '0xe700691dA7b9851F2F35f8b8182c69c53CcaD9Db',
		inDec: 6,
		outDec: 18
	}
};

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const openoceanProvider: SwapProvider = {
	name: 'openocean',

	supports(from: Token, to: Token): boolean {
		if (!isOpenOceanEnabled()) return false;
		if (from.chain !== 'rsk' || to.chain !== 'rsk') return false;
		const pairKey = `${from.key}:${to.key}`;
		return pairKey in SUPPORTED_PAIRS;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		signal?: AbortSignal,
		sourceAmountRaw?: string
	): Promise<Route | null> {
		if (!isOpenOceanEnabled()) return null;

		const pairKey = `${from.key}:${to.key}`;
		const pair = SUPPORTED_PAIRS[pairKey];
		if (!pair) return null;

		// Convert amount to source token's smallest unit
		const amountIn = sourceAmountRaw
			? BigInt(sourceAmountRaw)
			: BigInt(Math.round(amountSats * (10 ** (from.decimals - 8))));

		if (amountIn <= 0n) return null;

		debug.log('Quoting %s → %s (amount=%s)', from.symbol, to.symbol, amountIn.toString());

		const url = `${OPENOCEAN_BASE_URL}/quote?inTokenAddress=${pair.inAddr}&outTokenAddress=${pair.outAddr}&amount=${amountIn.toString()}&slippage=1`;

		const { data: result, error } = await tryCancel(
			fetch(url, { signal }).then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json();
			}),
			signal
		);

		if (error || !result) {
			if (error) debug.warn('OpenOcean quote failed: %s', String(error));
			return null;
		}

		const data = (result as { data?: { outAmount?: string; estimatedGas?: string } })?.data;
		if (!data?.outAmount) {
			debug.log('No outAmount in OpenOcean response');
			return null;
		}

		const outAmount = BigInt(data.outAmount);
		if (outAmount <= 0n) return null;

		// Convert output to sats for ranking
		const outputSats = to.decimals >= 8
			? Number(outAmount / BigInt(10) ** BigInt(to.decimals - 8))
			: Math.round(Number(outAmount) / (10 ** (8 - to.decimals)));

		if (outputSats <= 0) return null;

		// Fee calculation
		const inputAsSats = amountSats || Math.round(Number(amountIn) / (10 ** (from.decimals - 8)));
		const feePercent = inputAsSats > 0 ? ((inputAsSats - outputSats) / inputAsSats) * 100 : 0;

		const hop: RouteHop = {
			service: 'openocean',
			fromAsset: from.symbol,
			fromChain: from.chain,
			toAsset: to.symbol,
			toChain: to.chain,
			feePercent: Math.max(0, feePercent),
			estimatedTimeMin: 1,
			estimatedTimeMax: 3
		};

		const outputValueUsd = to.decimals === 6
			? Number(outAmount) / 1e6
			: 0;

		// For stablecoin swaps (DOC↔USDT0), both are ~$1
		const inputValueUsd = from.decimals === 6
			? Number(amountIn) / 1e6
			: from.decimals === 18
				? Number(amountIn) / 1e18 // DOC is ~$1
				: 0;

		const route: Route = {
			id: `openocean-${from.key}-${to.key}-${amountSats}`,
			label: `OpenOcean (${from.symbol} → ${to.symbol})`,
			hops: [hop],
			totalFeePercent: Math.max(0, feePercent),
			estimatedTime: '1-3 min',
			recommended: false,
			outputSats,
			outputAmount: outAmount.toString(),
			outputDecimals: to.decimals,
			inputValueUsd,
			outputValueUsd
		};

		debug.log('Quote: %s in → %s out (%.4f%% fee)', amountIn.toString(), outAmount.toString(), feePercent);

		return route;
	}
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function tryCancel<T>(promise: Promise<T>, signal?: AbortSignal): Promise<{ data: T | null; error: unknown }> {
	if (signal?.aborted) return { data: null, error: new DOMException('Aborted', 'AbortError') };
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error };
	}
}
