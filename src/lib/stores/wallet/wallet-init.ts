/**
 * Wallet Initialization, Cleanup & Health Checks
 */

import { browser } from '$app/environment';
import {
	WalletManager,
	type WalletManagerConfig,
	type NetworkType,
	type SwapUpdateEvent
} from '@bittasker/wallet-core';
import { get } from 'svelte/store';
import { Capacitor } from '@capacitor/core';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers } from 'ethers';
import { clearPersistedChainSortHints } from '$lib/utils/wallet/chainSortHints';
import { syncNdkSignerFromAppStore } from '$lib/nostr/ndkSigner';
import { walletStore, state, clearRefreshTimers, isProviderHealthy } from './wallet-state';
import { initialState } from './wallet-types';
import { updateSwapTransaction, loadTransactions } from './wallet-transactions';
import { scheduleBalanceRefresh } from './wallet-balances';
import { getSwapType } from '$lib/utils/wallet/swapTransaction';
import { browserNetworkStatus } from '$lib/utils/network-status';
import { blockchainToastStore } from './blockchain-toast.store';

// ─── Internal helpers ────────────────────────────────────────────────────────

function ensureBlockWatch(): void {
	if (!state.sdkWalletManager?.rskWallet || state.unsubscribeBlockWatch) return;
	if (typeof state.sdkWalletManager.rskWallet.onBlock !== 'function') return;

	state.unsubscribeBlockWatch = state.sdkWalletManager.rskWallet.onBlock((_blockNumber) => {
		try {
			scheduleBalanceRefresh();
			blockchainToastStore.onBlock('rsk', _blockNumber);
		} catch (err) {
			console.error('[wallet-init] Block callback error:', err);
		}
	});
}

function wireSwapUpdates(): void {
	if (!state.sdkWalletManager || typeof state.sdkWalletManager.onSwapUpdate !== 'function') {
		return;
	}

	state.unsubscribeSwapUpdates?.();
	state.unsubscribeSwapUpdates = state.sdkWalletManager.onSwapUpdate((event: SwapUpdateEvent) => {
		const swapType = getSwapType(event.swapData);
		updateSwapTransaction(event.swapId, event.swapData, swapType);
	});
}

// ─── App Resume + Network Reconnect ────────────────────────────────────────────

let resumeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleResumeRefresh(): void {
	if (resumeRefreshTimer) clearTimeout(resumeRefreshTimer);
	resumeRefreshTimer = setTimeout(() => {
		resumeRefreshTimer = null;
		try {
			ensureBlockWatch(); // Re-establish if softCleanup disposed it
			scheduleBalanceRefresh();
			void loadTransactions();
			blockchainToastStore.checkPendingReceipts();
		} catch (err) {
			console.error('[wallet-init] Resume refresh error:', err);
		}
	}, 1000); // 1s debounce to coalesce resume + reconnect
}

function setupAppLifecycleHandlers(): void {
	if (!browser) return;

	// Capacitor app resume — dynamic import, platform guard (matches activityTracker.ts)
	if (Capacitor.isNativePlatform()) {
		import('@capacitor/app').then(({ App }) => {
			App.addListener('appStateChange', ({ isActive }) => {
				if (isActive) scheduleResumeRefresh();
			});
		});
	}

	// Network reconnect — use existing browserNetworkStatus store
	browserNetworkStatus.subscribe((status) => {
		if (status.lastTransition === 'online' && state.sdkWalletManager) {
			scheduleResumeRefresh();
		}
	});
}

// ─── Exported functions ──────────────────────────────────────────────────────

/**
 * Extend inbound balance watch (receive flows, pending reverse/chain swaps).
 */
export function markExpectingInbound(ttlMs = 30 * 60 * 1000): void {
	state.expectingInboundUntil = Date.now() + ttlMs;
	ensureBlockWatch();
}

/**
 * Get RSK wallet address, initializing only RSK wallet if needed.
 * This is a lightweight operation that doesn't require full wallet initialization.
 */
export async function getRSKAddress(): Promise<string> {
	const storeState = get(walletStore);

	// If address already exists, return it
	if (storeState.rsk.address) {
		return storeState.rsk.address;
	}

	try {
		await initialize();
	} catch (err) {
		console.error('[wallet-init] Initialization failed in getRSKAddress:', err);
		return '';
	}

	return get(walletStore).rsk.address || '';
}

/**
 * Initialize wallet using SDK.
 */
export async function initialize(): Promise<void> {
	const storeState = get(walletStore);

	// Skip if already initializing - prevent race conditions
	if (storeState.isInitializing) return;

	// Set initializing FIRST before any other state mutations to prevent race conditions
	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	try {
		// Check if already fully initialized with healthy provider
		if (state.sdkWalletManager && storeState.isConnected) {
			const provider = storeState.rsk?.provider;
			if (provider && (await isProviderHealthy(provider))) {
				// Provider is healthy, skip reinitialization
				walletStore.update((s) => ({ ...s, isInitializing: false }));
				return;
			}
			// Provider unhealthy - continue with reinitialization
			if (import.meta.env.DEV) {
				console.warn('[WALLET-STORE] Provider unhealthy, reinitializing...');
			}
		}

		// Get mnemonic
		const mnemonic = await getMnemonic();

		// Get network from environment
		const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as NetworkType;

		// NDK signer + cache before swap recovery
		await syncNdkSignerFromAppStore();

		// Create or reuse swap storage instances
		if (!state.cachedSwapStorages) {
			const { nsec } = await getNostrKeyPair();
			state.cachedSwapStorages = {
				reverse: new NostrSwapStorage(nsec, 'boltz-swap-reverse'),
				chain: new NostrSwapStorage(nsec, 'boltz-swap-chain'),
				submarine: new NostrSwapStorage(nsec, 'boltz-swap-submarine')
			};
		}

		state.recoverSwapsOnNextLoad = true;

		// Dispose old manager if exists (but don't reset store state)
		if (state.sdkWalletManager) {
			try {
				state.sdkWalletManager.dispose();
			} catch (err) {
				console.warn('[wallet-init] Disposal error:', err);
			}
		}

		// Initialize wallet manager
		const config: WalletManagerConfig = {
			network,
			mnemonic,
			swapStorages: state.cachedSwapStorages
		};

		state.sdkWalletManager = new WalletManager(config);
		await state.sdkWalletManager.initialize();

		wireSwapUpdates();
		ensureBlockWatch();
		setupAppLifecycleHandlers();

		// Update store with wallet info — set each chain independently so a
		// failure in one doesn't prevent the others from getting addresses.
		const rskWallet = state.sdkWalletManager.rskWallet;
		const bscWallet = state.sdkWalletManager.bscWallet;

		const rskUpdate: Partial<typeof initialState.rsk> = {};
		const bscUpdate: Partial<typeof initialState.bsc> = {};
		const arbUpdate: Partial<typeof initialState.arb> = {};

		if (rskWallet) {
			rskUpdate.connected = true;
			rskUpdate.connecting = false;
			rskUpdate.error = null;
			rskUpdate.address = rskWallet.getAddress();
			rskUpdate.wallet = rskWallet.getWallet() as ethers.Wallet;
			rskUpdate.provider = rskWallet.getProvider() as ethers.JsonRpcProvider;
			// Arbitrum uses the same EVM address as RSK
			arbUpdate.address = rskWallet.getAddress();
		}

		if (bscWallet) {
			bscUpdate.connected = true;
			bscUpdate.connecting = false;
			bscUpdate.error = null;
			bscUpdate.address = bscWallet.getAddress();
			bscUpdate.wallet = bscWallet.getWallet() as ethers.Wallet;
			bscUpdate.provider = bscWallet.getProvider() as ethers.JsonRpcProvider;
		}

		if (rskWallet || bscWallet) {
			walletStore.update((s) => ({
				...s,
				isConnected: true,
				isInitializing: false,
				error: null,
				rsk: { ...s.rsk, ...rskUpdate },
				bsc: { ...s.bsc, ...bscUpdate },
				arb: { ...s.arb, ...arbUpdate }
			}));
		}
	} catch (error) {
		console.error('[WALLET-STORE] initializeWallet() - Failed to initialize wallet:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to initialize wallet';
		walletStore.update((s) => ({
			...s,
			isInitializing: false,
			error: errorMessage
		}));
		throw error;
	}
}

/**
 * Disconnect wallet completely — only called on explicit logout.
 * Resets all wallet state to initial values.
 */
export function disconnectWallet(): void {
	if (state.sdkWalletManager) {
		try {
			state.sdkWalletManager.dispose();
		} catch (error) {
			console.warn('[WALLET-STORE] Error disposing wallet manager:', error);
		}
		state.sdkWalletManager = null;
	}

	// Clear cached swap storages
	state.cachedSwapStorages = null;
	state.terminalSwapIds.clear();
	state.chainSortHints.clear();
	clearRefreshTimers();
	state.unsubscribeSwapUpdates?.();
	state.unsubscribeSwapUpdates = null;
	state.unsubscribeBlockWatch?.();
	state.unsubscribeBlockWatch = null;
	state.expectingInboundUntil = 0;
	void clearPersistedChainSortHints();
	state.recoverSwapsOnNextLoad = true;
	state.loadTransactionsPromise = null;

	// Clear swap pairs cache
	state.cachedSwapPairs = {
		submarine: null,
		reverse: null,
		chain: null
	};

	walletStore.set(initialState);
}

/**
 * Soft cleanup — disposes resources but preserves cached balance data.
 * Use this for temporary disconnects (e.g., backgrounding the app).
 */
export function softCleanup(): void {
	state.unsubscribeBlockWatch?.();
	state.unsubscribeBlockWatch = null;

	if (state.sdkWalletManager) {
		try {
			state.sdkWalletManager.dispose();
		} catch (err) {
			console.warn('[wallet-init] softCleanup disposal error:', err);
		}
		state.sdkWalletManager = null;
	}
}
