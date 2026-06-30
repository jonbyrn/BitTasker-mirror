/**
 * Uniswap V3 Same-Chain Provider
 *
 * Uses the on-chain Uniswap V3 QuoterV2 contract to get quotes for
 * same-chain token swaps on Arbitrum. Bypasses aggregators (Symbiosis,
 * LI.FI) which may not have liquidity for low-volume tokens like tBTC.
 *
 * Key use case: tBTC → WBTC hop2 in Boltz 2-hop routes, where
 * aggregators return 400/404 but the on-chain V3 pool has 4.59 tBTC TVL.
 */

import { Contract, ethers } from 'ethers';
import type { SwapProvider, Token, Route, RouteHop } from '../types';
import { tryCatch } from '$lib/utils/tryCatch';
import { createDebug } from '$lib/utils/debug';

const debug = createDebug('route-engine:uniswap-v3');

// ---------------------------------------------------------------------------
// Contract addresses — Arbitrum
// ---------------------------------------------------------------------------

const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

// Known pools with sufficient liquidity (verified on-chain)
const KNOWN_POOLS: Record<string, { fee: number; poolAddress: string }> = {
	// tBTC/WBTC at 0.05% — 4.59 tBTC TVL
	'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40:0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': {
		fee: 500,
		poolAddress: '0xe9e6b9aA31D4a8D09c3a1dE337b8c1a0B45e8c5A'
	},
	// WBTC/USDT0 at 0.05% — 107 WBTC TVL
	'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': {
		fee: 500,
		poolAddress: '0x5969efdde3cf5c0d9a88ae51e47d721096a97203'
	}
};

// ---------------------------------------------------------------------------
// QuoterV2 ABI (read-only)
// ---------------------------------------------------------------------------

const QUOTER_ABI = [
	'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)'
];

// ---------------------------------------------------------------------------
// Gas estimation for Arbitrum swap
// ---------------------------------------------------------------------------

// Uniswap V3 swap gas: ~150k-200k on Arbitrum
const SWAP_GAS_LIMIT = 200_000n;
const ARB_GAS_PRICE = 30_000_000n; // 0.03 gwei (Arbitrum is very cheap)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export const uniswapV3Provider: SwapProvider = {
	name: 'uniswap-v3',

	supports(from: Token, to: Token): boolean {
		// Only Arbitrum same-chain swaps
		if (from.chain !== 'arbitrum' || to.chain !== 'arbitrum') return false;
		if (from.key === to.key) return false;

		// Check both orderings (pool key is sorted by address)
		const poolKey = `${from.address}:${to.address}`;
		const poolKeyReverse = `${to.address}:${from.address}`;
		return poolKey in KNOWN_POOLS || poolKeyReverse in KNOWN_POOLS;
	},

	async getQuote(
		from: Token,
		to: Token,
		amountSats: number,
		signal?: AbortSignal,
		sourceAmountRaw?: string
	): Promise<Route | null> {
		void signal;

		// Check both orderings
		const poolKey = `${from.address}:${to.address}`;
		const poolKeyReverse = `${to.address}:${from.address}`;
		const poolInfo = KNOWN_POOLS[poolKey] ?? KNOWN_POOLS[poolKeyReverse];
		if (!poolInfo) {
			debug.log('No known pool for %s → %s', from.key, to.key);
			return null;
		}

		debug.log(
			'Quoting %s → %s (%d sats, fee tier %d)',
			from.symbol,
			to.symbol,
			amountSats,
			poolInfo.fee
		);

		const { data: result, error } = await tryCatch(
			(async () => {
				const provider = new ethers.JsonRpcProvider(ARB_RPC);
				const quoter = new Contract(QUOTER_V2, QUOTER_ABI, provider);

				// Use raw source amount when available (non-BTC tokens like USDT0).
				// satsToTokenAmount-style conversion breaks for 6-decimal tokens.
				const amountIn = sourceAmountRaw
					? BigInt(sourceAmountRaw)
					: BigInt(amountSats) * BigInt(10) ** BigInt(from.decimals - 8);

				const params = {
					tokenIn: from.address,
					tokenOut: to.address,
					amountIn,
					fee: poolInfo.fee,
					sqrtPriceLimitX96: 0n
				};

				// Use staticCall (read-only, no gas)
				const quoteResult = await quoter.quoteExactInputSingle.staticCall(params);
				return quoteResult;
			})()
		);

		if (error || !result) {
			if (error) debug.warn('Quote failed: %s', String(error));
			return null;
		}

		const amountOut = result.amountOut ?? result[0];
		if (!amountOut || amountOut === 0n) {
			debug.log('Zero output from QuoterV2');
			return null;
		}

		// Convert output to sats
		const outputSats = Number(amountOut / BigInt(10) ** BigInt(to.decimals - 8));

		if (outputSats <= 0) {
			debug.log('Output too small: %d sats', outputSats);
			return null;
		}

		const feePercent = amountSats > 0 ? ((amountSats - outputSats) / amountSats) * 100 : 0;

		// Gas cost for the swap on Arbitrum
		const gasCostWei = (SWAP_GAS_LIMIT * ARB_GAS_PRICE).toString();

		const hop: RouteHop = {
			service: 'uniswap-v3',
			fromAsset: from.symbol,
			fromChain: from.chain,
			toAsset: to.symbol,
			toChain: to.chain,
			feePercent: Math.max(0, feePercent),
			estimatedTimeMin: 1,
			estimatedTimeMax: 3,
			gasCostWei
		};

		// USD values: input is BTC-denominated, output may be BTC or stablecoin
		const inputValueUsd = 0; // caller computes from btcPrice
		const outputValueUsd =
			to.decimals === 6
				? Number(amountOut) / 1e6 // stablecoin
				: 0; // BTC-denominated — caller computes

		const route: Route = {
			id: `uniswap-v3-${from.key}-${to.key}`,
			label: `Uniswap V3 (${from.symbol} → ${to.symbol})`,
			hops: [hop],
			totalFeePercent: Math.max(0, feePercent),
			estimatedTime: '1-3 min',
			recommended: false,
			gasCostWei,
			outputSats,
			outputAmount: amountOut.toString(),
			outputDecimals: to.decimals,
			inputValueUsd,
			outputValueUsd
		};

		debug.log(
			'Quote: %d sats in → %d sats out (%.4f%% fee, gas=%s wei)',
			amountSats,
			outputSats,
			feePercent,
			gasCostWei
		);

		return route;
	}
};
