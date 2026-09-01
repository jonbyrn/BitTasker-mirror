/**
 * Wallet Utilities — store helpers, formatting, derived stores, compatibility object
 *
 * Pure utility functions and derived stores that read from the shared
 * walletStore singleton.  Also exports the `walletManager` compatibility
 * object that mirrors the old monolithic API surface.
 */

import { derived, get } from 'svelte/store';
import type { SwapUpdateEvent } from '@bittasker/wallet-core';
import { ethers } from 'ethers';
import { walletStore, getWalletManager } from './wallet-state';
import {
	initialize,
	getRSKAddress,
	disconnectWallet,
	softCleanup,
	markExpectingInbound
} from './wallet-init';
import {
	loadAssets,
	loadRbtcExchangeRate,
	loadRSKTokenBalances,
	getTokenBalance
} from './wallet-balances';
import { loadTransactions, refreshTransactions } from './wallet-transactions';
import {
	sendRBTC,
	sendRSKToken,
	sendBSCUSDT,
	sendBSCBNB,
	sendRSKUSDT0,
	estimateRBTCGas,
	estimateERC20Gas
} from './wallet-send';
import {
	createReverseSwap,
	createChainSwap,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	getSubmarineSwapLimits,
	getSubmarineSwapPairs,
	getReverseSwapPairs,
	getChainSwapPairs,
	getCachedSubmarineSwapPairs,
	getCachedReverseSwapPairs,
	getCachedChainSwapPairs,
	clearSwapPairsCache
} from './wallet-swaps';

// ─── Simple store-update helpers ─────────────────────────────────────────────

/**
 * Set active network in wallet UI
 *
 * @param network - Network to set as active
 */
export function setActiveNetwork(network: 'liquid' | 'rsk' | 'bsc'): void {
	walletStore.update((state) => ({ ...state, activeNetwork: network }));
}

/**
 * Set active tab in wallet UI
 *
 * @param tab - Tab to set as active
 */
export function setActiveTab(
	tab: 'balance' | 'send' | 'receive' | 'transactions' | 'buy-sell' | 'swap'
): void {
	walletStore.update((state) => ({ ...state, activeTab: tab }));
}

/**
 * Set selected asset in wallet UI
 *
 * @param asset - Asset identifier to select
 */
export function setSelectedAsset(asset: string): void {
	walletStore.update((state) => ({ ...state, selectedAsset: asset }));
}

// ─── Getter functions ────────────────────────────────────────────────────────

/**
 * Get wallet instance for specified network (backward compatibility)
 *
 * @param network - Network to get wallet for ('rsk' | 'bsc')
 * @returns Wallet instance or null if not initialized
 */
export function getWallet(network: 'rsk' | 'bsc'): ethers.Wallet | null {
	const state = get(walletStore);
	return network === 'rsk' ? state.rsk.wallet : state.bsc.wallet;
}

/**
 * Get provider instance for specified network (backward compatibility)
 *
 * @param network - Network to get provider for ('rsk' | 'bsc')
 * @returns Provider instance or null if not initialized
 */
export function getProvider(network: 'rsk' | 'bsc'): ethers.JsonRpcProvider | null {
	const state = get(walletStore);
	return network === 'rsk' ? state.rsk.provider : state.bsc.provider;
}

// ─── Formatting utilities ────────────────────────────────────────────────────

export { formatAddress, formatSats, formatUsd } from '$lib/utils/wallet/format';

// ─── Derived stores for backward compatibility ───────────────────────────────

export const isConnected = derived(walletStore, ($w) => $w.isConnected);
export const rskAddress = derived(walletStore, ($w) => $w.rsk.address);
export const bscAddress = derived(walletStore, ($w) => $w.bsc.address);
export const rskBalance = derived(walletStore, ($w) => $w.rsk.formattedBalance);
export const bscBnbBalance = derived(walletStore, ($w) => $w.bsc.formattedBnbBalance);
export const bscUsdtBalance = derived(walletStore, ($w) => $w.bsc.formattedUsdtBalance);
export const rskConnection = derived(walletStore, ($w) => $w.rsk);
export const bscConnection = derived(walletStore, ($w) => $w.bsc);
export const allAssets = derived(walletStore, ($w) => $w.assets);
export const totalBalances = derived(walletStore, ($w) => $w.totalBalances);
export const rbtcToBtcRate = derived(walletStore, ($w) => $w.rbtcToBtcRate);
export const transactions = derived(walletStore, ($w) => $w.transactions);

// ─── Wallet manager compatibility object ─────────────────────────────────────

// Uses getter pattern to handle ES module evaluation order — the referenced
// functions are live bindings from sibling modules that may initialise after
// this module is evaluated.  Accessing via `get` defers resolution to call-time.

export const walletManager = {
	get initialize() {
		return initialize;
	},
	get cleanup() {
		return disconnectWallet;
	},
	get softCleanup() {
		return softCleanup;
	},
	get getRSKAddress() {
		return getRSKAddress;
	},
	get setActiveTab() {
		return setActiveTab;
	},
	get loadAssets() {
		return loadAssets;
	},
	get loadTransactions() {
		return loadTransactions;
	},
	get refreshTransactions() {
		return refreshTransactions;
	},
	get markExpectingInbound() {
		return markExpectingInbound;
	},
	get loadRbtcExchangeRate() {
		return loadRbtcExchangeRate;
	},
	get sendRBTC() {
		return sendRBTC;
	},
	get sendRSKToken() {
		return sendRSKToken;
	},
	get sendBSCUSDT() {
		return sendBSCUSDT;
	},
	get sendBSCBNB() {
		return sendBSCBNB;
	},
	get sendRSKUSDT0() {
		return sendRSKUSDT0;
	},
	get createReverseSwap() {
		return createReverseSwap;
	},
	get createChainSwap() {
		return createChainSwap;
	},
	get estimateRBTCGas() {
		return estimateRBTCGas;
	},
	get createSubmarineSwap() {
		return createSubmarineSwap;
	},
	get lockSubmarineSwapFunds() {
		return lockSubmarineSwapFunds;
	},
	get getSubmarineSwapLimits() {
		return getSubmarineSwapLimits;
	},
	get getSubmarineSwapPairs() {
		return getSubmarineSwapPairs;
	},
	get getReverseSwapPairs() {
		return getReverseSwapPairs;
	},
	get getChainSwapPairs() {
		return getChainSwapPairs;
	},
	get getCachedSubmarineSwapPairs() {
		return getCachedSubmarineSwapPairs;
	},
	get getCachedReverseSwapPairs() {
		return getCachedReverseSwapPairs;
	},
	get getCachedChainSwapPairs() {
		return getCachedChainSwapPairs;
	},
	get clearSwapPairsCache() {
		return clearSwapPairsCache;
	},
	get loadRSKTokenBalances() {
		return loadRSKTokenBalances;
	},
	get getTokenBalance() {
		return getTokenBalance;
	},
	get estimateERC20Gas() {
		return estimateERC20Gas;
	},
	onSwapUpdate(callback: (event: SwapUpdateEvent) => void): () => void {
		return getWalletManager().onSwapUpdate(callback);
	},
	get submarineSwapService() {
		return getWalletManager().submarineSwapService;
	},
	get reverseSwapService() {
		return getWalletManager().reverseSwapService;
	},
	get chainSwapService() {
		return getWalletManager().chainSwapService;
	}
};

