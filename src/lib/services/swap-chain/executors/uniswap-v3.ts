/**
 * Swap Chain — Uniswap V3 Hop Executor
 *
 * Executes a Uniswap V3 same-chain swap on Arbitrum via SwapRouter02.
 *
 * Used as hop 2 in Boltz 2-hop routes when LI.FI is unavailable (e.g.,
 * tBTC→WBTC where LI.FI returns 400/404 but the on-chain V3 pool has liquidity).
 *
 * Flow:
 *   1. Approve source token for SwapRouter
 *   2. Call exactInputSingle on SwapRouter
 */

import { ethers, Contract } from 'ethers';
import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { createDebug } from '$lib/utils/debug';
import { walletStore } from '$lib/stores/wallet.store';
import { getHandle } from '$lib/stores/connected-wallets.store';
import type { RouteHop } from '$lib/services/route-resolver';
import { parseDecimalToSmallestUnit } from '$lib/utils/amount-conversion';
import {
	CHAIN_ID_ARB,
	NATIVE_TOKEN,
	GAS_LIMIT_ARB_SWAP,
	resolveChainId,
	resolveTokenAddress,
	LIFI_ASSET_DECIMALS
} from '../utils';
import { encodeUniswapV3ExactInputSingle, encodeUniswapV3ExactInput, encodeERC20Approve } from '../abi';
import { safeAddress, type SwapChainState } from '../state';
import { sendEvmTransaction } from '../tx-helpers';
import { capBalanceToWalletMax } from './helpers';

const d = createDebug('swap-chain');

/** Max uint256 — infinite approval. */
const MAX_UINT256 = (1n << 256n) - 1n;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Uniswap V3 SwapRouter02 on Arbitrum */
const UNISWAP_V3_ROUTER_ARB = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

/** Uniswap V3 QuoterV2 on Arbitrum — for on-chain price quotes */
const QUOTER_V2 = '0x61fFE014bA17989E743c5F6cB21bF9697530B21e';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

/** QuoterV2 ABI (read-only) */
const QUOTER_ABI = [
	'function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)',
	'function quoteExactInput(bytes path, uint256 amountIn) external returns (uint256 amountOut, uint160[] sqrtPriceX96AfterList, uint32[] initializedTicksCrossedList, uint256 gasEstimate)'
];

/** Known pool fee tiers (must match uniswap-v3.provider.ts KNOWN_POOLS) */
const UNISWAP_V3_FEE_TIERS: Record<string, number> = {
	'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40:0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 500,
	'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 500
};

/**
 * Multi-hop routes for pairs without a direct pool.
 * Must match uniswap-v3.provider.ts MULTI_HOP_ROUTES.
 */
const MULTI_HOP_ROUTES: Record<string, { path: string[]; fees: number[] }> = {
	// tBTC → USDT0 via WBTC
	'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': {
		path: [
			'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40', // tBTC
			'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', // WBTC
			'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9'  // USDT0
		],
		fees: [500, 500]
	}
};

/**
 * Encode a Uniswap V3 multi-hop path.
 * Format: tokenA (20 bytes) + fee (3 bytes) + tokenB (20 bytes) + fee (3 bytes) + tokenC (20 bytes)
 */
function encodeMultiHopPath(tokenAddresses: string[], fees: number[]): string {
	let path = '0x';
	for (let i = 0; i < fees.length; i++) {
		path += tokenAddresses[i].slice(2).toLowerCase();
		path += fees[i].toString(16).padStart(6, '0');
	}
	path += tokenAddresses[tokenAddresses.length - 1].slice(2).toLowerCase();
	return path;
}

// ---------------------------------------------------------------------------
// Uniswap V3 hop
// ---------------------------------------------------------------------------

/**
 * Execute a Uniswap V3 same-chain swap on Arbitrum.
 */
export async function executeUniswapV3Hop(
	hop: RouteHop,
	state: SwapChainState
): Promise<{ data: string | null; error: Error | null }> {
	if (!state.destination || state.destination.type !== 'address') {
		return { data: null, error: new Error('Uniswap V3 hop requires an address destination') };
	}

	const fromChainId = resolveChainId(hop.fromChain);
	const toChainId = resolveChainId(hop.toChain);

	if (fromChainId !== CHAIN_ID_ARB || toChainId !== CHAIN_ID_ARB) {
		return {
			data: null,
			error: new Error('Uniswap V3 hop only supports Arbitrum same-chain swaps')
		};
	}

	const fromTokenAddr = resolveTokenAddress(hop.fromAsset, fromChainId);
	const toTokenAddr = resolveTokenAddress(hop.toAsset, toChainId);

	const poolKey = `${fromTokenAddr}:${toTokenAddr}`;
	const poolKeyReverse = `${toTokenAddr}:${fromTokenAddr}`;
	const feeTier = UNISWAP_V3_FEE_TIERS[poolKey] ?? UNISWAP_V3_FEE_TIERS[poolKeyReverse];
	const multiHopRoute = MULTI_HOP_ROUTES[poolKey] ?? MULTI_HOP_ROUTES[poolKeyReverse];

	if (!feeTier && !multiHopRoute) {
		return {
			data: null,
			error: new Error(`No known Uniswap V3 pool for ${hop.fromAsset}→${hop.toAsset}`)
		};
	}

	const isMultiHop = !feeTier && !!multiHopRoute;

	d.log(
		'executeUniswapV3Hop: %s → %s (%s, fee tier %d)',
		hop.fromAsset,
		hop.toAsset,
		state.amount,
		feeTier
	);

	const userAddr = state.sourceConnectedWalletId
		? safeAddress(getHandle(state.sourceConnectedWalletId)?.address)
		: safeAddress(get(walletStore).arb?.address || get(walletStore).rsk.address);

	if (!userAddr) {
		return { data: null, error: new Error('No wallet address for Uniswap V3 swap') };
	}

	try {
		const decimals = LIFI_ASSET_DECIMALS[hop.fromAsset.toUpperCase()] ?? 18;
		let amountIn = parseDecimalToSmallestUnit(state.amount!, decimals);

		// Cap at actual on-chain balance for ERC-20 tokens, minus relay fee buffer
		// to prevent "transfer amount exceeds balance" when the same token is used
		// for both the swap input and gasless fee payment.
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const reserveAmount = state.relayFeeBuffer ? BigInt(state.relayFeeBuffer) : undefined;
			const { data: cappedAmount, error: capError } = await capBalanceToWalletMax({
				tokenAddress: fromTokenAddr,
				userAddress: userAddr,
				chain: 'arbitrum',
				requestedAmount: amountIn,
				label: 'UniswapV3',
				reserveAmount
			});
			if (capError) {
				return { data: null, error: capError };
			}
			amountIn = cappedAmount;
		}

		if (amountIn <= 0n) {
			return {
				data: null,
				error: new Error(`Insufficient ${hop.fromAsset} balance for Uniswap V3 swap`)
			};
		}

		// Step 1: Build approval as extraCalls (batched with swap in single UserOp)
		const extraCalls: Array<{ to: string; data: string; value: bigint }> = [];
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const approveCalldata = encodeERC20Approve(UNISWAP_V3_ROUTER_ARB, MAX_UINT256);
			d.log(
				'executeUniswapV3Hop: batching approval: token=%s spender=%s',
				fromTokenAddr.substring(0, 10),
				UNISWAP_V3_ROUTER_ARB.substring(0, 10)
			);
			extraCalls.push({ to: fromTokenAddr, data: approveCalldata, value: 0n });
		}

		// Step 2: Query QuoterV2 for the actual expected output, then build swap calldata.
		// We MUST quote first to get amountOutMinimum in the OUTPUT token's units.
		// Using amountIn (input decimals) as amountOutMinimum is WRONG for cross-decimal
		// swaps like tBTC(18 dec)→USDT0(6 dec) — the minimum would be ~15,000× too high.
		const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min deadline
		const SLIPPAGE_BPS = 50; // 0.5% slippage

		let expectedAmountOut: bigint;

		try {
			const provider = new ethers.JsonRpcProvider(ARB_RPC);
			const quoter = new Contract(QUOTER_V2, QUOTER_ABI, provider);

			if (isMultiHop && multiHopRoute) {
				const path = encodeMultiHopPath(multiHopRoute.path, multiHopRoute.fees);
				const quoteResult = await quoter.quoteExactInput.staticCall(path, amountIn);
				expectedAmountOut = quoteResult.amountOut ?? quoteResult[0];
				d.log('executeUniswapV3Hop: multi-hop quote: amountIn=%s amountOut=%s',
					amountIn.toString(), expectedAmountOut.toString());
			} else {
				const quoteResult = await quoter.quoteExactInputSingle.staticCall({
					tokenIn: fromTokenAddr,
					tokenOut: toTokenAddr,
					amountIn,
					fee: feeTier!,
					sqrtPriceLimitX96: 0n
				});
				expectedAmountOut = quoteResult.amountOut ?? quoteResult[0];
				d.log('executeUniswapV3Hop: single-hop quote: amountIn=%s amountOut=%s',
					amountIn.toString(), expectedAmountOut.toString());
			}

			await provider.destroy();
		} catch (quoteErr) {
			d.error('executeUniswapV3Hop: QuoterV2 failed: %s', quoteErr instanceof Error ? quoteErr.message : String(quoteErr));
			return {
				data: null,
				error: new Error(`Failed to quote Uniswap V3 swap: ${quoteErr instanceof Error ? quoteErr.message : 'unknown error'}`)
			};
		}

		if (expectedAmountOut <= 0n) {
			return { data: null, error: new Error('Uniswap V3 quote returned zero output — insufficient liquidity') };
		}

		// Calculate amountOutMinimum in the OUTPUT token's units (correct!)
		const amountOutMinimum = (expectedAmountOut * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;
		d.log('executeUniswapV3Hop: slippage: expectedOut=%s minOut=%s (slippage=%d bps)',
			expectedAmountOut.toString(), amountOutMinimum.toString(), SLIPPAGE_BPS);

		// Build swap calldata with the correct amountOutMinimum
		let swapCalldata: string;
		if (isMultiHop && multiHopRoute) {
			const path = encodeMultiHopPath(multiHopRoute.path, multiHopRoute.fees);
			swapCalldata = encodeUniswapV3ExactInput(path, userAddr, deadline, amountIn, amountOutMinimum);
		} else {
			swapCalldata = encodeUniswapV3ExactInputSingle(
				fromTokenAddr, toTokenAddr, feeTier!, userAddr, deadline, amountIn, amountOutMinimum
			);
		}

		// Submit approve + swap as a single batched UserOp via extraCalls
		d.log('executeUniswapV3Hop: submitting batched swap via sendEvmTransaction');
		const { data: txHash, error: swapError } = await sendEvmTransaction({
			to: UNISWAP_V3_ROUTER_ARB,
			data: swapCalldata,
			value: 0n,
			chain: 'arbitrum',
			gasLimit: GAS_LIMIT_ARB_SWAP,
			sourceConnectedWalletId: state.sourceConnectedWalletId,
			extraCalls: extraCalls.length > 0 ? extraCalls : undefined
		});

		if (swapError || !txHash) {
			return { data: null, error: swapError ?? new Error('Uniswap V3 swap failed: no tx hash') };
		}

		d.log('executeUniswapV3Hop: swap confirmed: %s', txHash.substring(0, 16));
		return { data: txHash, error: null };
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Uniswap V3 execution failed';
		d.error('executeUniswapV3Hop FAILED: %s', message);
		Sentry.captureException(err, {
			tags: { component: 'swap-chain', executor: 'uniswap-v3' },
			extra: { hopFrom: hop.fromAsset, hopTo: hop.toAsset, amount: state.amount }
		});
		return { data: null, error: new Error(message) };
	}
}
