/**
 * Wallet Shared Mutable State (INTERNAL)
 *
 * Single source of truth for all mutable singletons shared across wallet/* modules.
 * Other modules import from here to read/write shared state.
 * NOT re-exported from the barrel — consumers should never import this directly.
 */

import { WalletManager } from '@bittasker/wallet-core';
import type { SwapPairsCache } from '$lib/types/wallet';
import { writable } from 'svelte/store';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import type { JsonRpcProvider } from 'ethers';
import { initialState, type WalletStateExtended } from './wallet-types';

// ─── The Writable Store (single instance) ────────────────────────────────────

export const walletStore = writable<WalletStateExtended>(initialState);

// ─── Mutable Singletons ─────────────────────────────────────────────────────

/**
 * All mutable wallet-level state lives inside a single object so that
 * property assignment (`state.xxx = yyy`) works across module boundaries
 * (ES-module imports are live read-only bindings — you cannot reassign
 * a bare `let` export from another module).
 */
export const state = {
	/** SDK wallet manager instance. */
	sdkWalletManager: null as WalletManager | null,

	/** Cached swap storage instances (reverse / chain / submarine). */
	cachedSwapStorages: null as {
		reverse: NostrSwapStorage;
		chain: NostrSwapStorage;
		submarine: NostrSwapStorage;
	} | null,

	/** Cached swap pairs per type (1-hour TTL). */
	cachedSwapPairs: {
		submarine: null,
		reverse: null,
		chain: null
	} as {
		submarine: SwapPairsCache | null;
		reverse: SwapPairsCache | null;
		chain: SwapPairsCache | null;
	},

	// ── Transaction load coordination ──
	loadTransactionsPromise: null as Promise<void> | null,
	chainRefreshTimer: null as ReturnType<typeof setTimeout> | null,
	balanceRefreshTimer: null as ReturnType<typeof setTimeout> | null,
	postCleanupTimer: null as ReturnType<typeof setTimeout> | null,

	// ── Subscription handles ──
	unsubscribeSwapUpdates: null as (() => void) | null,
	unsubscribeBlockWatch: null as (() => void) | null,
	unsubscribeArbBlockWatch: null as (() => void) | null,

	// ── Balance watch state ──
	expectingInboundUntil: 0,

	/** Swap ids that have reached a terminal status — ignore further updates. */
	terminalSwapIds: new Set<string>(),

	/** Preserves list position when a swap row is replaced by its on-chain tx. */
	chainSortHints: new Map<string, string>(),

	/** Whether to recover pending swaps on next loadTransactions call. */
	recoverSwapsOnNextLoad: true,

	/** Guard against concurrent loadAssets calls. */
	loadAssetsLock: false
};

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get wallet manager instance — throws if not initialized.
 */
export function getWalletManager(): WalletManager {
	if (!state.sdkWalletManager) {
		throw new Error('Wallet is not initialized.');
	}
	return state.sdkWalletManager;
}

/**
 * Fetch with retry logic — retries up to maxRetries times with exponential backoff.
 */
export async function fetchWithRetry<T>(
	fetchFn: () => Promise<T>,
	maxRetries: number = 3
): Promise<T | null> {
	for (let i = 0; i < maxRetries; i++) {
		try {
			return await fetchFn();
		} catch (error) {
			if (i === maxRetries - 1) {
				console.error('[WALLET-STORE] All retries failed:', error);
				return null;
			}
			// Exponential backoff: 500ms, 1000ms, 2000ms
			await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, i)));
		}
	}
	return null;
}

/**
 * Clear all pending refresh timers.
 */
export function clearRefreshTimers(): void {
	if (state.chainRefreshTimer) {
		clearTimeout(state.chainRefreshTimer);
		state.chainRefreshTimer = null;
	}
	if (state.balanceRefreshTimer) {
		clearTimeout(state.balanceRefreshTimer);
		state.balanceRefreshTimer = null;
	}
	if (state.postCleanupTimer) {
		clearTimeout(state.postCleanupTimer);
		state.postCleanupTimer = null;
	}
}

/**
 * Test if the provider is healthy by making a lightweight RPC call.
 */
export async function isProviderHealthy(provider: JsonRpcProvider): Promise<boolean> {
	try {
		await Promise.race([
			provider.getNetwork(),
			new Promise((_, reject) =>
				setTimeout(() => reject(new Error('Provider health check timeout')), 2000)
			)
		]);
		return true;
	} catch {
		return false;
	}
}
