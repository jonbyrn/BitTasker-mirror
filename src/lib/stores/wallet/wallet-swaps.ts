/**
 * Wallet Swaps — swap creation, swap pairs caching, swap limits
 */

import type {
	SwapPairs,
	SubmarineSwapData,
	CreateSubmarineSwapParams,
	SubmarineSwapResult,
	BoltzSwapData,
	ChainSwapData
} from '@bittasker/wallet-core';
import { state, getWalletManager } from './wallet-state';
import { SWAP_PAIRS_CACHE_TTL } from './wallet-types';
import { markExpectingInbound } from './wallet-init';
import { loadAssets } from './wallet-balances';
import { loadTransactions } from './wallet-transactions';

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Create reverse swap (Lightning → RBTC).
 */
export async function createReverseSwap(
	amountSats: number,
	description?: string
): Promise<{ swapId: string; invoice: string; swapData: BoltzSwapData }> {
	const manager = getWalletManager();
	if (!manager.rskWallet) {
		throw new Error('RSK wallet not initialized — cannot create reverse swap');
	}
	const rskAddress = manager.rskWallet.getAddress();
	const walletSigner = manager.rskWallet.getWallet();

	const result = await manager.reverseSwapService.createReverseSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner,
		description
	});
	markExpectingInbound();
	return result;
}

/**
 * Create chain swap (L-BTC → RBTC).
 */
export async function createChainSwap(
	amountSats: number,
	description?: string
): Promise<{ swapId: string; liquidUri: string; swapData: ChainSwapData }> {
	const manager = getWalletManager();
	if (!manager.rskWallet) {
		throw new Error('RSK wallet not initialized — cannot create chain swap');
	}
	const rskAddress = manager.rskWallet.getAddress();
	const walletSigner = manager.rskWallet.getWallet();

	const result = manager.chainSwapService
		? await manager.chainSwapService.createChainSwap({
				amountSats,
				rbtcAddress: rskAddress,
				walletSigner,
				description
			})
		: null;
	if (!result) {
		throw new Error('Chain swap service not initialized — cannot create chain swap');
	}
	markExpectingInbound();
	return result;
}

/**
 * Get swap limits for all supported swap types.
 */
export async function getSwapLimits() {
	const manager = getWalletManager();
	return await manager.getSwapLimits();
}

/**
 * Create submarine swap (RBTC → Lightning).
 */
export async function createSubmarineSwap(
	invoice: string,
	description?: string
): Promise<SubmarineSwapResult> {
	const manager = getWalletManager();

	const params: CreateSubmarineSwapParams = {
		from: 'RBTC',
		to: 'BTC', // Lightning (represented as BTC in Boltz API)
		invoice,
		signer: manager.getRSKWallet(),
		description
	};

	return await manager.submarineSwapService.createSubmarineSwap(params);
}

/**
 * Lock funds for submarine swap.
 */
export async function lockSubmarineSwapFunds(
	swapData: SubmarineSwapData
): Promise<{ txHash: string }> {
	const manager = getWalletManager();
	const signer = manager.rskWallet.getWallet();

	const result = await manager.submarineSwapService.lockFundsEVM(swapData, signer);

	void Promise.allSettled([loadAssets(), loadTransactions()]);

	return result;
}

/**
 * Get submarine swap limits for RBTC to BTC swaps.
 */
export async function getSubmarineSwapLimits(): Promise<{ minimal: number; maximal: number }> {
	const manager = getWalletManager();
	return await manager.submarineSwapService.getSwapLimits('RBTC', 'BTC');
}

/**
 * Get submarine swap pairs with fee information from Boltz API.
 */
export async function getSubmarineSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getSubmarineSwapPairs();
}

/**
 * Get cached submarine swap pairs (1 hour TTL).
 * Returns cached data if available and fresh, otherwise fetches from API.
 */
export async function getCachedSubmarineSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	// Return cached data if valid
	if (
		state.cachedSwapPairs.submarine &&
		now - state.cachedSwapPairs.submarine.timestamp < state.cachedSwapPairs.submarine.ttl
	) {
		return state.cachedSwapPairs.submarine.data;
	}

	// Fetch fresh data
	const data = await getSubmarineSwapPairs();
	state.cachedSwapPairs.submarine = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Get reverse swap pairs with fee information from Boltz API.
 */
export async function getReverseSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getReverseSwapPairs();
}

/**
 * Get cached reverse swap pairs (1 hour TTL).
 */
export async function getCachedReverseSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	if (
		state.cachedSwapPairs.reverse &&
		now - state.cachedSwapPairs.reverse.timestamp < state.cachedSwapPairs.reverse.ttl
	) {
		return state.cachedSwapPairs.reverse.data;
	}

	const data = await getReverseSwapPairs();
	state.cachedSwapPairs.reverse = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Get chain swap pairs with fee information from Boltz API.
 */
export async function getChainSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getChainSwapPairs();
}

/**
 * Get cached chain swap pairs (1 hour TTL).
 */
export async function getCachedChainSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	if (
		state.cachedSwapPairs.chain &&
		now - state.cachedSwapPairs.chain.timestamp < state.cachedSwapPairs.chain.ttl
	) {
		return state.cachedSwapPairs.chain.data;
	}

	const data = await getChainSwapPairs();
	state.cachedSwapPairs.chain = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Clear all swap pairs caches.
 * Useful for forcing a refresh of fee data.
 */
export function clearSwapPairsCache(): void {
	state.cachedSwapPairs.submarine = null;
	state.cachedSwapPairs.reverse = null;
	state.cachedSwapPairs.chain = null;
}
