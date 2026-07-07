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
import { encodeUniswapV3ExactInputSingle } from '../abi';
import { safeAddress, type SwapChainState } from '../state';
import { sendEvmTransaction } from '../tx-helpers';
import { approveErc20Token, capBalanceToWalletMax } from './helpers';

const d = createDebug('swap-chain');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Uniswap V3 SwapRouter02 on Arbitrum */
const UNISWAP_V3_ROUTER_ARB = '0xE592427A0AEce92De3Edee1F18E0157C05861564';

/** Known pool fee tiers (must match uniswap-v3.provider.ts KNOWN_POOLS) */
const UNISWAP_V3_FEE_TIERS: Record<string, number> = {
	'0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40:0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f': 500,
	'0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f:0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9': 500
};

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
	if (!feeTier) {
		return {
			data: null,
			error: new Error(`No known Uniswap V3 pool for ${hop.fromAsset}→${hop.toAsset}`)
		};
	}

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

		// Cap at actual on-chain balance for ERC-20 tokens
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const { data: cappedAmount, error: capError } = await capBalanceToWalletMax({
				tokenAddress: fromTokenAddr,
				userAddress: userAddr,
				chain: 'arbitrum',
				requestedAmount: amountIn,
				label: 'UniswapV3'
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

		// Step 1: Approve source token for SwapRouter
		if (fromTokenAddr !== NATIVE_TOKEN) {
			const { error: approveError } = await approveErc20Token({
				tokenAddress: fromTokenAddr,
				spenderAddress: UNISWAP_V3_ROUTER_ARB,
				approveAmount: amountIn,
				chain: 'arbitrum',
				sourceConnectedWalletId: state.sourceConnectedWalletId,
				label: 'UniswapV3'
			});
			if (approveError) {
				return { data: null, error: approveError };
			}
		}

		// Step 2: Call exactInputSingle
		const deadline = BigInt(Math.floor(Date.now() / 1000) + 1200); // 20 min deadline

		// 0.5% slippage protection — industry standard default
		// For same-peg assets (tBTC↔WBTC), expected output ≈ input minus pool fee
		const SLIPPAGE_BPS = 50;
		const expectedAmountOut = amountIn;
		const amountOutMinimum = (expectedAmountOut * BigInt(10000 - SLIPPAGE_BPS)) / 10000n;

		const swapCalldata = encodeUniswapV3ExactInputSingle(
			fromTokenAddr,
			toTokenAddr,
			feeTier,
			userAddr,
			deadline,
			amountIn,
			amountOutMinimum
		);

		d.log('executeUniswapV3Hop: submitting swap via sendEvmTransaction');
		const { data: txHash, error: swapError } = await sendEvmTransaction({
			to: UNISWAP_V3_ROUTER_ARB,
			data: swapCalldata,
			value: 0n,
			chain: 'arbitrum',
			gasLimit: GAS_LIMIT_ARB_SWAP,
			sourceConnectedWalletId: state.sourceConnectedWalletId
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
