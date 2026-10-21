/**
 * Unified Wallet Store - SDK Version
 *
 * This store uses the @bittasker/wallet-core SDK for all wallet operations.
 * It maintains backward compatibility with the existing wallet store API.
 */

import {
	WalletManager,
	type WalletManagerConfig,
	type WalletAsset,
	type WalletState,
	type NetworkType,
	type GasEstimation,
	type SubmarineSwapData,
	type CreateSubmarineSwapParams,
	type SubmarineSwapResult,
	type BoltzSwapData,
	type ChainSwapData,
	type SwapPairs,
	type SwapUpdateEvent,
	ERC20_ABI
} from '@bittasker/wallet-core';
import type { SwapPairsCache, TokenBalance } from '$lib/types/wallet';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import {
	passkeyPromptAllowed,
	withPasskeyPrompt,
	type PasskeyPromptReason
} from '$lib/utils/keys/passkey-policy';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers, type JsonRpcProvider } from 'ethers';
import {
	processTransactions,
	type ProcessedTransaction
} from '$lib/utils/wallet/transactionHistory';
import {
	isSwapCompleted,
	mapSwapToTransaction,
	shouldShowSwap,
	getSwapType
} from '$lib/utils/wallet/swapTransaction';
import { isSwapFailed, isSwapFinal } from '$lib/utils/wallet/swapStatusMap';
import {
	projectTransactions,
	applyChainSortHints,
	mergeSwapUpdate
} from '$lib/utils/wallet/transactionLedger';
import {
	buildChainSortHintsFromSwaps,
	hydrateChainSortHints,
	mergeChainSortHints,
	persistChainSortHint,
	persistChainSortHintsMap,
	clearPersistedChainSortHints,
	toSortIso
} from '$lib/utils/wallet/chainSortHints';
import { syncNdkSignerFromAppStore } from '$lib/nostr/ndkSigner';
import { ERROR_MESSAGES } from '$lib/utils/constants/wallet.constants';
import { StorageKeys } from '$lib/utils/constants/storage';
import tokenBalanceService from '$lib/api/services/token-balance.service';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { Preferences } from '@capacitor/preferences';
import {
	registerSwapResumeHandler,
	unregisterSwapResumeHandler
} from '$lib/utils/wallet/swapMonitor';

// Extended wallet state with processed transactions
type WalletStateExtended = Omit<WalletState, 'transactions'> & {
	transactions: ProcessedTransaction[];
	/** True after a successful balance load. Stays false while the first load is in flight. */
	balancesLoaded: boolean;
};

// Initial state
const initialState: WalletStateExtended = {
	isInitializing: false,
	isConnected: false,
	balancesLoaded: false,
	error: null,

	rsk: {
		connected: false,
		connecting: false,
		error: null,
		address: null,
		balance: '0',
		formattedBalance: '0.00',
		blockNumber: null,
		provider: null,
		wallet: null
	},

	bsc: {
		connected: false,
		connecting: false,
		error: null,
		address: null,
		bnbBalance: '0',
		formattedBnbBalance: '0.00',
		usdtBalance: '0',
		formattedUsdtBalance: '0.00',
		blockNumber: null,
		provider: null,
		wallet: null,
		usdtContract: null,
		paymasterContract: null,
		paymasterConnected: false,
		paymasterAddress: null,
		canPayFeesInUsdt: false
	},

	assets: [],
	transactions: [],
	totalBalances: {
		usd: 0,
		sats: 0,
		rbtc: 0,
		usdt: 0,
		bnb: 0
	},

	rbtcToBtcRate: 1.0,
	rbtcRateError: false,

	activeNetwork: 'rsk',
	selectedAsset: 'rBTC'
};

// Create the wallet store
export const walletStore = writable<WalletStateExtended>(initialState);

// SDK wallet manager instance
let sdkWalletManager: WalletManager | null = null;

// Cached swap storage instances to avoid re-initialization
let cachedSwapStorages: {
	reverse: NostrSwapStorage;
	chain: NostrSwapStorage;
	submarine: NostrSwapStorage;
} | null = null;

// Transaction load coordination
let loadTransactionsPromise: Promise<void> | null = null;
let chainRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let balanceRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeSwapUpdates: (() => void) | null = null;
let unsubscribeBlockWatch: (() => void) | null = null;
let expectingInboundUntil = 0;
const terminalSwapIds = new Set<string>();
/** Preserves list position when a swap row is replaced by its on-chain tx. */
const chainSortHints = new Map<string, string>();
let recoverSwapsOnNextLoad = true;

async function refreshChainSortHintsFromNostr(): Promise<void> {
	if (!cachedSwapStorages) return;

	const [submarineSwaps, reverseSwaps, chainSwaps] = await Promise.all([
		cachedSwapStorages.submarine.loadAllIncludingFinal(),
		cachedSwapStorages.reverse.loadAllIncludingFinal(),
		cachedSwapStorages.chain.loadAllIncludingFinal()
	]);

	const fromNostr = buildChainSortHintsFromSwaps([
		...submarineSwaps.map((swap) => ({ swapType: 'submarine' as const, swap })),
		...reverseSwaps.map((swap) => ({ swapType: 'reverse' as const, swap })),
		...chainSwaps.map((swap) => ({ swapType: 'chain' as const, swap }))
	]);

	mergeChainSortHints(chainSortHints, fromNostr);
	await persistChainSortHintsMap(chainSortHints);
}

function hasActiveInboundSwaps(): boolean {
	if (!sdkWalletManager) return false;

	const chain = sdkWalletManager.chainSwapService.getActiveSwaps();
	const chainPending = chain.some((swap) => !isSwapCompleted(swap.status));

	const state = get(walletStore);
	const reversePending = state.transactions.some(
		(tx) =>
			tx.swap?.type === 'reverse' &&
			tx.swap.rawStatus &&
			!isSwapCompleted(tx.swap.rawStatus) &&
			!isSwapFailed(tx.swap.rawStatus)
	);

	return chainPending || reversePending;
}

function isExpectingInbound(): boolean {
	return Date.now() < expectingInboundUntil || hasActiveInboundSwaps();
}

/** Extend inbound balance watch (receive flows, pending reverse/chain swaps). */
export function markExpectingInbound(ttlMs = 30 * 60 * 1000): void {
	expectingInboundUntil = Date.now() + ttlMs;
	ensureInboundBlockWatch();
}

function ensureInboundBlockWatch(): void {
	if (!sdkWalletManager?.rskWallet || unsubscribeBlockWatch) return;
	if (typeof sdkWalletManager.rskWallet.onBlock !== 'function') return;

	unsubscribeBlockWatch = sdkWalletManager.rskWallet.onBlock(() => {
		if (!isExpectingInbound()) return;
		scheduleBalanceRefresh();
	});
}

function wireSwapUpdates(): void {
	if (!sdkWalletManager || typeof sdkWalletManager.onSwapUpdate !== 'function') {
		return;
	}

	unsubscribeSwapUpdates?.();
	unsubscribeSwapUpdates = sdkWalletManager.onSwapUpdate((event: SwapUpdateEvent) => {
		const swapType = getSwapType(event.swapData);
		updateSwapTransaction(event.swapId, event.swapData, swapType);
	});
}

function scheduleBalanceRefresh(): void {
	if (balanceRefreshTimer) clearTimeout(balanceRefreshTimer);
	balanceRefreshTimer = setTimeout(() => {
		balanceRefreshTimer = null;
		const address = get(walletStore).rsk.address;
		if (address) {
			tokenBalanceService.clearBalanceCache(address);
		}
		loadAssets().catch((err) => {
			console.error('[wallet] Balance refresh failed:', err);
		});
	}, 500);
}

function clearRefreshTimers(): void {
	if (chainRefreshTimer) {
		clearTimeout(chainRefreshTimer);
		chainRefreshTimer = null;
	}
	if (balanceRefreshTimer) {
		clearTimeout(balanceRefreshTimer);
		balanceRefreshTimer = null;
	}
}

// Cache instances for each swap type
let cachedSwapPairs: {
	submarine: SwapPairsCache | null;
	reverse: SwapPairsCache | null;
	chain: SwapPairsCache | null;
} = {
	submarine: null,
	reverse: null,
	chain: null
};

// Cache TTL: 1 hour (swap pair data rarely changes)
const SWAP_PAIRS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Get wallet manager instance
 */
function getWalletManager(): WalletManager {
	if (!sdkWalletManager) {
		throw new Error('Wallet is not initialized.');
	}

	return sdkWalletManager;
}

/**
 * Test if the provider is healthy by making a lightweight RPC call
 * More reliable than checking internal properties like _destroyed
 *
 * @param provider - JSON-RPC provider to test
 * @returns true if provider is healthy, false otherwise
 */
async function isProviderHealthy(provider: JsonRpcProvider): Promise<boolean> {
	try {
		// Use a lightweight call with timeout to verify provider works
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

/**
 * Initialize wallet using SDK
 *
 * @returns void
 * @throws {Error} If the wallet fails to initialize
 */
async function initialize(options?: {
	prompt?: Extract<PasskeyPromptReason, 'unlock' | 'funding' | 'escrow'>;
}): Promise<void> {
	if (options?.prompt && !passkeyPromptAllowed()) {
		return withPasskeyPrompt(options.prompt, () => initialize());
	}
	const state = get(walletStore);

	// Skip if already initializing - prevent race conditions
	if (state.isInitializing) return;

	// Set initializing FIRST before any other state mutations to prevent race conditions
	walletStore.update((s) => ({ ...s, isInitializing: true, error: null }));

	try {
		// Check if already fully initialized with healthy provider
		if (sdkWalletManager && state.isConnected) {
			const provider = state.rsk?.provider;
			if (provider && (await isProviderHealthy(provider))) {
				// Provider is healthy, skip reinitialization
				walletStore.update((s) => ({ ...s, isInitializing: false }));
				return;
			}
			// A real reinit must not treat the previous balance as ready.
			walletStore.update((s) => ({ ...s, balancesLoaded: false }));
			// Provider unhealthy - continue with reinitialization
			// Don't reset state yet - let successful init replace it
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
		if (!cachedSwapStorages) {
			const { nsec } = await getNostrKeyPair();
			cachedSwapStorages = {
				reverse: new NostrSwapStorage(nsec, 'boltz-swap-reverse'),
				chain: new NostrSwapStorage(nsec, 'boltz-swap-chain'),
				submarine: new NostrSwapStorage(nsec, 'boltz-swap-submarine')
			};
		}

		recoverSwapsOnNextLoad = true;

		// Dispose old manager if exists (but don't reset store state)
		if (sdkWalletManager) {
			try {
				sdkWalletManager.dispose();
			} catch {
				// Ignore disposal errors
			}
		}

		// Initialize wallet manager
		const config: WalletManagerConfig = {
			network,
			mnemonic,
			swapStorages: cachedSwapStorages
		};

		sdkWalletManager = new WalletManager(config);
		await sdkWalletManager.initialize();

		wireSwapUpdates();
		ensureInboundBlockWatch();

		// Resume handler: balance-based incoming fund detection + swap recovery
		// Fires on background→foreground transitions (visibilitychange / appStateChange)
		const onResume = async () => {
			// Read persisted balance (survives app kills, unlike in-memory store)
			let persistedBalance: number | null = null;
			try {
				const { value: stored } = await Preferences.get({
					key: StorageKeys.WALLET_LAST_BALANCE_SATS
				});
				if (stored !== null) {
					const parsed = parseInt(stored, 10);
					if (!isNaN(parsed)) persistedBalance = parsed;
				}
			} catch {
				// Preferences unavailable
			}

			// loadAssets() fetches RSK + BSC balances (4 parallel RPC calls, fast)
			// Also persists balance to Preferences for cross-kill detection
			await loadAssets();

			const newBalanceSats = get(walletStore).totalBalances.sats;

			// Show toast if balance increased from persisted value
			// persistedBalance === null means first open ever — skip toast (save baseline)
			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				const delta = newBalanceSats - persistedBalance;
				void import('$lib/stores/app.store').then(({ appStore }) => {
					appStore.showInfoToast(`Received ${formatSats(delta)} sats`, 5000, {
						dedupKey: `received-balance-${newBalanceSats}`
					});
				});
			}

			// Recover pending swaps independently (Nostr queries only, no blockchain RPC)
			if (sdkWalletManager) {
				try {
					await Promise.all([
						sdkWalletManager.submarineSwapService.recoverPendingSwaps().catch(() => []),
						sdkWalletManager.reverseSwapService.recoverPendingSwaps().catch(() => []),
						sdkWalletManager.chainSwapService.recoverPendingSwaps().catch(() => [])
					]);
				} catch {
					// Swap recovery failure is non-critical
				}
			}
		};

		registerSwapResumeHandler(onResume);

		// Run once on cold start to establish persisted baseline
		// Fire-and-forget: does not block initialize() or first paint
		onResume().catch(() => {});

		// Update store with wallet info
		const rskWallet = sdkWalletManager.rskWallet;
		const bscWallet = sdkWalletManager.bscWallet;

		if (rskWallet && bscWallet) {
			walletStore.update((s) => ({
				...s,
				isConnected: true,
				isInitializing: false,
				error: null,
				rsk: {
					...s.rsk,
					connected: true,
					connecting: false,
					error: null,
					address: rskWallet.getAddress(),
					wallet: rskWallet.getWallet() as ethers.Wallet,
					provider: rskWallet.getProvider() as ethers.JsonRpcProvider
				},
				bsc: {
					...s.bsc,
					connected: true,
					connecting: false,
					error: null,
					address: bscWallet.getAddress(),
					wallet: bscWallet.getWallet() as ethers.Wallet,
					provider: bscWallet.getProvider() as ethers.JsonRpcProvider
				}
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
 * Get RSK wallet address, initializing only RSK wallet if needed.
 * This is a lightweight operation that doesn't require full wallet initialization.
 *
 * @returns The RSK wallet address
 */
export async function getRSKAddress(): Promise<string> {
	const state = get(walletStore);

	// If address already exists, return it
	if (state.rsk.address) {
		return state.rsk.address;
	}

	const address = await initialize().then(() => {
		return get(walletStore).rsk.address;
	});

	return address || '';
}

/**
 * Disconnect wallet completely - only called on explicit logout
 * This resets all wallet state to initial values
 */
function disconnectWallet(): void {
	if (sdkWalletManager) {
		try {
			sdkWalletManager.dispose();
		} catch (error) {
			// Log but don't throw - we want cleanup to complete
			console.warn('[WALLET-STORE] Error disposing wallet manager:', error);
		}
		sdkWalletManager = null;
	}

	// Clear cached swap storages
	cachedSwapStorages = null;
	terminalSwapIds.clear();
	chainSortHints.clear();
	clearRefreshTimers();
	unsubscribeSwapUpdates?.();
	unsubscribeSwapUpdates = null;
	unsubscribeBlockWatch?.();
	unsubscribeBlockWatch = null;
	unregisterSwapResumeHandler();
	expectingInboundUntil = 0;
	void clearPersistedChainSortHints();
	recoverSwapsOnNextLoad = true;
	loadTransactionsPromise = null;

	// Clear swap pairs cache
	cachedSwapPairs = {
		submarine: null,
		reverse: null,
		chain: null
	};

	walletStore.set(initialState);
}

/**
 * Soft cleanup - disposes resources but preserves cached balance data
 * Use this for temporary disconnects (e.g., backgrounding the app)
 */
function softCleanup(): void {
	// Only dispose the SDK manager, keep the store state for quick reconnect
	if (sdkWalletManager) {
		try {
			sdkWalletManager.dispose();
		} catch {
			// Ignore disposal errors
		}
		sdkWalletManager = null;
	}
}

/**
 * Helper function to fetch balance with retry logic
 * Retries up to maxRetries times with exponential backoff
 *
 * @param fetchFn - Function that fetches the balance
 * @param maxRetries - Maximum number of retries (default: 3)
 * @returns Balance data or null if all retries fail
 */
async function fetchWithRetry<T>(
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
 * Load wallet assets and update balances from blockchain
 * Fetches fresh balances for RSK and BSC networks and calculates total USD value
 * Includes retry logic for transient failures
 *
 * @throws {Error} If wallet manager is not initialized
 */
async function loadAssets(): Promise<void> {
	try {
		const manager = getWalletManager();
		const state = get(walletStore);
		const assets: WalletAsset[] = [];

		// Initialize totals
		let totalRbtc = 0;
		let totalBnb = 0;
		let totalUsdt = 0;
		let totalUsd = 0;
		let priceError = false;

		// Fetch ALL data in parallel with retry logic for balance fetches
		const [rbtcPriceResult, bnbPriceResult, rskBalanceData, bscBalances] = await Promise.all([
			cryptoPriceService.getCurrentPrice('RBTC').catch((err) => {
				console.warn('[WALLET-STORE] Failed to fetch RBTC price:', err);
				return null; // null indicates price unavailable (vs 0 which means no value)
			}),
			cryptoPriceService.getCurrentPrice('BNB').catch((err) => {
				console.warn('[WALLET-STORE] Failed to fetch BNB price:', err);
				return null;
			}),
			state.rsk.connected && manager.rskWallet
				? fetchWithRetry(() => manager.rskWallet.getBalance())
				: Promise.resolve(null),
			state.bsc.connected && manager.bscWallet
				? fetchWithRetry(() => manager.bscWallet.getBalances())
				: Promise.resolve(null)
		]);

		// Use fallback price of 0 if price fetch failed, but track the error
		const rbtcPrice = rbtcPriceResult ?? 0;
		const bnbPrice = bnbPriceResult ?? 0;
		if (rbtcPriceResult === null || bnbPriceResult === null) {
			priceError = true;
		}

		// Process RSK assets
		if (rskBalanceData) {
			// Keep formatted balance for display and USD calculations
			const rbtcBalance = parseFloat(rskBalanceData.formatted);
			totalRbtc += rbtcBalance;
			const rbtcUsdValue = rbtcBalance * rbtcPrice;
			totalUsd += rbtcUsdValue;

			// Update store with fresh balance
			walletStore.update((s) => ({
				...s,
				rsk: {
					...s.rsk,
					balance: rskBalanceData.balance.toString(),
					formattedBalance: rskBalanceData.formatted,
					error: null
				}
			}));

			assets.push({
				assetId: 'rbtc',
				name: 'Rootstock Bitcoin',
				ticker: 'RBTC',
				precision: 8,
				icon: '₿',
				balance: rbtcBalance,
				formattedBalance: rskBalanceData.formatted,
				network: 'RSK',
				usdValue: rbtcUsdValue
			});
		} else if (state.rsk.connected) {
			// Balance fetch failed but we're connected - report error but keep existing balance
			walletStore.update((s) => ({
				...s,
				rsk: {
					...s.rsk,
					error: 'Failed to fetch balance. Please refresh.'
				}
			}));
		}

		// Process BSC assets
		if (bscBalances) {
			const bnbBalance = parseFloat(bscBalances.bnb.formatted);
			totalBnb += bnbBalance;
			const bnbUsdValue = bnbBalance * bnbPrice;
			totalUsd += bnbUsdValue;

			// Update store with fresh balances
			walletStore.update((s) => ({
				...s,
				bsc: {
					...s.bsc,
					bnbBalance: bscBalances.bnb.balance.toString(),
					usdtBalance: bscBalances.usdt.balance.toString(),
					formattedBnbBalance: bscBalances.bnb.formatted,
					formattedUsdtBalance: bscBalances.usdt.formatted,
					error: null
				}
			}));

			assets.push({
				assetId: 'bnb',
				name: 'BNB',
				ticker: 'BNB',
				precision: 8,
				icon: 'BNB',
				balance: bnbBalance,
				formattedBalance: bscBalances.bnb.formatted,
				network: 'BSC',
				usdValue: bnbUsdValue
			});

			if (bscBalances.usdt.balance > BigInt(0)) {
				const usdtBalance = parseFloat(bscBalances.usdt.formatted);
				totalUsdt += usdtBalance;
				totalUsd += usdtBalance; // USDT is 1:1 with USD

				assets.push({
					assetId: 'usdt',
					name: 'Tether USD',
					ticker: 'USDT',
					precision: 6,
					icon: '₮',
					balance: usdtBalance,
					formattedBalance: bscBalances.usdt.formatted,
					network: 'BSC',
					usdValue: usdtBalance
				});
			}
		}

		// Calculate total sats (RBTC to sats)
		const totalSats = Math.floor(totalRbtc * 100_000_000);

		// Update store with assets and totals
		// Note: If priceError is true, USD values may be inaccurate but sats balance is correct
		walletStore.update((s) => ({
			...s,
			assets,
			balancesLoaded: true,
			totalBalances: {
				usd: totalUsd,
				sats: totalSats,
				rbtc: totalRbtc,
				usdt: totalUsdt,
				bnb: totalBnb
			},
			// Store price error state for UI to potentially display
			rbtcRateError: priceError || s.rbtcRateError
		}));

		// Persist balance for incoming fund detection across app kills
		try {
			await Preferences.set({
				key: StorageKeys.WALLET_LAST_BALANCE_SATS,
				value: totalSats.toString()
			});
		} catch {
			// Preferences unavailable
		}
	} catch (error) {
		console.error('[WALLET-STORE] Failed to load assets:', error);
		// Don't reset balances on error - keep showing last known values
		walletStore.update((s) => ({
			...s,
			error: 'Failed to refresh balances. Showing cached data.'
		}));
	}
}

function scheduleChainRefresh(): void {
	if (chainRefreshTimer) clearTimeout(chainRefreshTimer);
	chainRefreshTimer = setTimeout(() => {
		chainRefreshTimer = null;
		loadTransactions().catch((err) => {
			console.error('[loadTransactions] Debounced chain refresh failed:', err);
		});
	}, 500);
}

/**
 * Load transactions including pending swaps (single-flight mutex).
 */
async function loadTransactionsInternal(): Promise<void> {
	try {
		await hydrateChainSortHints(chainSortHints);

		const state = get(walletStore);
		const shouldRecoverSwaps = recoverSwapsOnNextLoad;

		// Ensure wallet is initialized before loading transactions
		if (!state.isConnected || !sdkWalletManager) {
			// Initialize wallet if not already initialized
			if (!state.isInitializing) {
				await initialize();
			} else {
				// Wait for initialization to complete
				// Poll until initialized or timeout after 10 seconds
				const maxWaitTime = 10000; // 10 seconds
				const startTime = Date.now();
				while (Date.now() - startTime < maxWaitTime) {
					await new Promise((resolve) => setTimeout(resolve, 100));
					const currentState = get(walletStore);
					if (!currentState.isInitializing || (currentState.isConnected && sdkWalletManager)) {
						break;
					}
				}
			}

			// Re-check state after initialization attempt
			const updatedState = get(walletStore);
			if (!updatedState.isConnected || !sdkWalletManager) {
				throw new Error('Wallet not initialized. Cannot load transactions.');
			}
		}

		const manager = getWalletManager();
		const finalState = get(walletStore);

		if (shouldRecoverSwaps) {
			await refreshChainSortHintsFromNostr();
		}

		// Validate wallets exist
		if (!manager.rskWallet || !manager.bscWallet) {
			throw new Error(
				`Wallets not available. RSK: ${!!manager.rskWallet}, BSC: ${!!manager.bscWallet}`
			);
		}

		// Get current balance for running balance calculation
		const currentBalanceSats = finalState.totalBalances.sats;

		// Load blockchain transactions
		const [rskTxs, bscTxs] = await Promise.all([
			manager.rskWallet.loadTransactions(),
			manager.bscWallet.loadTransactions()
		]);

		// Process blockchain transactions
		const [processedRskTxs, processedBscTxs] = await Promise.all([
			processTransactions(rskTxs, finalState.rsk.address || '', 'rsk'),
			processTransactions(bscTxs, finalState.bsc.address || '', 'bsc')
		]);

		// Recover pending swaps only on init / explicit refresh — not every WS-driven reload
		let submarineSwaps: SubmarineSwapData[] = [];
		let reverseSwaps: BoltzSwapData[] = [];
		let chainSwaps: ChainSwapData[] = [];

		if (recoverSwapsOnNextLoad) {
			[submarineSwaps, reverseSwaps, chainSwaps] = await Promise.all([
				manager.submarineSwapService.recoverPendingSwaps().catch(() => []),
				manager.reverseSwapService.recoverPendingSwaps().catch(() => []),
				manager.chainSwapService.recoverPendingSwaps().catch(() => [])
			]);
			submarineSwaps = submarineSwaps.filter((s) => shouldShowSwap(s.status, 'submarine', s));
			reverseSwaps = reverseSwaps.filter((s) => shouldShowSwap(s.status, 'reverse', s));
			chainSwaps = chainSwaps.filter((s) => shouldShowSwap(s.status, 'chain', s));
			recoverSwapsOnNextLoad = false;
		} else {
			submarineSwaps = manager.submarineSwapService.getActiveSwaps();
			chainSwaps = manager.chainSwapService.getActiveSwaps();
			const reverseIds = finalState.transactions
				.filter((tx) => tx.swap?.type === 'reverse')
				.map((tx) => tx.swap!.id);
			reverseSwaps = reverseIds
				.map((id) => manager.reverseSwapService.getSwap(id))
				.filter((swap): swap is BoltzSwapData => swap != null);
		}

		// One-shot post-recovery cleanup (inline — no second loadTransactions)
		if (shouldRecoverSwaps) {
			cleanupExpiredSwaps(manager, submarineSwaps, reverseSwaps, chainSwaps);
		}

		// Map swaps to transaction format
		const swapTransactions = [
			...submarineSwaps.map((s) => mapSwapToTransaction(s, 'submarine', currentBalanceSats)),
			...reverseSwaps.map((s) => mapSwapToTransaction(s, 'reverse', currentBalanceSats)),
			...chainSwaps.map((s) => mapSwapToTransaction(s, 'chain', currentBalanceSats))
		];

		const mappedSwapIds = new Set(
			swapTransactions.map((tx) => tx.swap?.id).filter((id): id is string => !!id)
		);
		const preservedSwapRows = finalState.transactions.filter((tx) =>
			shouldPreserveSwapRow(tx, mappedSwapIds)
		);

		const allTransactions = projectTransactions(
			applyChainSortHints([...processedRskTxs, ...processedBscTxs], chainSortHints),
			[...swapTransactions, ...preservedSwapRows],
			currentBalanceSats
		);

		walletStore.update((s) => ({ ...s, transactions: allTransactions }));
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error('[loadTransactions] Failed to load transactions:', errorMessage, error);

		// Update store with error for UI to display
		walletStore.update((s) => ({
			...s,
			error: s.error || errorMessage
		}));

		// Re-throw to allow calling code to handle
		throw error;
	}
}

async function loadTransactions(): Promise<void> {
	if (loadTransactionsPromise) {
		return loadTransactionsPromise;
	}
	loadTransactionsPromise = loadTransactionsInternal().finally(() => {
		loadTransactionsPromise = null;
	});
	return loadTransactionsPromise;
}

/** Force Nostr swap recovery on next load (manual refresh / modal open). */
function refreshTransactions(): Promise<void> {
	recoverSwapsOnNextLoad = true;
	return loadTransactions();
}

/** Remember on-chain tx sort position when a swap completes. */
function recordChainSortHints(
	swapType: 'submarine' | 'reverse' | 'chain',
	swap: BoltzSwapData | ChainSwapData | SubmarineSwapData
): void {
	if (swapType === 'submarine') {
		const lockupHash = (swap as SubmarineSwapData).lockupTxHash;
		const createdAt = toSortIso(swap.createdAt);
		if (lockupHash && createdAt && /^0x[0-9a-fA-F]{64}$/.test(lockupHash)) {
			const normalized = lockupHash.toLowerCase();
			chainSortHints.set(normalized, createdAt);
			void persistChainSortHint(normalized, createdAt);
		}
		return;
	}

	const claimHash =
		swapType === 'reverse'
			? (swap as BoltzSwapData).claimTxHash
			: (swap as ChainSwapData).claimTxHash;
	const completionTime = toSortIso(swap.updatedAt) ?? new Date().toISOString();

	if (claimHash && /^0x[0-9a-fA-F]{64}$/.test(claimHash)) {
		const normalized = claimHash.toLowerCase();
		chainSortHints.set(normalized, completionTime);
		void persistChainSortHint(normalized, completionTime);
	}
}

function shouldPreserveSwapRow(tx: ProcessedTransaction, mappedSwapIds: Set<string>): boolean {
	if (!tx.swap || mappedSwapIds.has(tx.swap.id)) {
		return false;
	}
	const rawStatus = tx.swap.rawStatus ?? '';
	if (isSwapCompleted(rawStatus)) {
		return false;
	}
	if (isSwapFailed(rawStatus) && rawStatus !== 'transaction.claim.failed') {
		return false;
	}
	return true;
}

/**
 * Update a specific swap transaction in the transactions store
 * without replacing the entire array
 *
 * @param swapId - Unique identifier for the swap
 * @param updatedSwap - Updated swap data from Boltz SDK
 * @param swapType - Type of swap (submarine/reverse/chain)
 */
export function updateSwapTransaction(
	swapId: string,
	updatedSwap: BoltzSwapData | ChainSwapData | SubmarineSwapData,
	swapType: 'submarine' | 'reverse' | 'chain'
): void {
	if (terminalSwapIds.has(swapId)) return;

	const state = get(walletStore);
	const txIndex = state.transactions.findIndex((tx) => tx.swap?.id === swapId);
	const currentTx = txIndex === -1 ? null : state.transactions[txIndex];
	const currentSwapStatus = currentTx?.swap?.rawStatus;
	const newSwapStatus = updatedSwap.status;

	if (currentSwapStatus === newSwapStatus) {
		return;
	}

	const balanceAnchor = currentTx?.balanceAfter ?? state.totalBalances.sats;
	const updatedTx = mapSwapToTransaction(updatedSwap, swapType, balanceAnchor);

	if (isSwapFinal(newSwapStatus)) {
		terminalSwapIds.add(swapId);

		if (isSwapCompleted(newSwapStatus)) {
			recordChainSortHints(swapType, updatedSwap);
			walletStore.update((s) => ({
				...s,
				transactions: s.transactions.filter((tx) => tx.swap?.id !== swapId)
			}));
			if (swapType === 'reverse' || swapType === 'chain') {
				scheduleBalanceRefresh();
			}
			scheduleChainRefresh();
			return;
		}

		if (isSwapFailed(newSwapStatus)) {
			if (txIndex === -1) {
				walletStore.update((s) => ({
					...s,
					transactions: projectTransactions(s.transactions, [updatedTx], s.totalBalances.sats)
				}));
			} else {
				walletStore.update((s) => ({
					...s,
					transactions: mergeSwapUpdate(s.transactions, swapId, updatedTx, s.totalBalances.sats)
				}));
			}
			return;
		}
	}

	walletStore.update((s) => ({
		...s,
		transactions: mergeSwapUpdate(s.transactions, swapId, updatedTx, s.totalBalances.sats)
	}));
}

/**
 * Load RBTC to BTC exchange rate
 * Updates the store with the current exchange rate or sets error flag on failure
 */
async function loadRbtcExchangeRate(): Promise<void> {
	try {
		const rate = await cryptoPriceService.getExchangeRate('RBTC', 'BTC');
		walletStore.update((s) => ({
			...s,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
	} catch (error) {
		console.error('Failed to load RBTC exchange rate:', error);
		walletStore.update((s) => ({
			...s,
			rbtcToBtcRate: 1.0,
			rbtcRateError: true
		}));
	}
}

/**
 * Load all RSK token balances from Blockscout API
 * Includes RBTC (native) and all ERC-20 tokens with non-zero balances
 * Filters out tokens with zero balance automatically
 * Uses caching to reduce API calls
 *
 * @param forceRefresh - Force refresh even if cache is valid
 * @returns Array of token balances (non-zero only)
 * @throws {Error} If wallet manager is not initialized or API call fails
 */
export async function loadRSKTokenBalances(forceRefresh = false): Promise<TokenBalance[]> {
	try {
		const manager = getWalletManager();
		const state = get(walletStore);
		const address = state.rsk.address;

		if (!address) {
			if (import.meta.env.DEV) {
				console.error('[WALLET-STORE] loadRSKTokenBalances() - RSK address not available');
			}
			throw new Error(ERROR_MESSAGES.RSK_ADDRESS_NOT_AVAILABLE);
		}

		// Fetch all ERC-20 token balances (service will filter zero balances and use cache)
		const tokenBalances = await tokenBalanceService.getRSKTokenBalances(address, forceRefresh);

		// Always include RBTC (even if zero) for consistency
		const rbtcBalance = await manager.rskWallet.getBalance();
		const rbtcToken: TokenBalance = {
			address: 'native', // Special identifier for native token
			name: 'Smart Bitcoin',
			symbol: 'RBTC',
			decimals: 18,
			balance: rbtcBalance.balance.toString(),
			formattedBalance: rbtcBalance.formatted,
			isNative: true,
			icon: '₿'
		};

		// Combine RBTC with ERC-20 tokens
		// Filter out RBTC if balance is zero (optional - you may want to always show it)
		const allTokens = [rbtcToken, ...tokenBalances];

		// Final filter: remove any tokens with zero balance (except native if you want to keep it)
		return allTokens.filter((token) => {
			if (token.isNative) {
				// Always show native token
				return true;
			}
			const balance = BigInt(token.balance);
			return balance > 0n; // Filter out zero balance ERC-20 tokens
		});
	} catch (error) {
		console.error('Failed to load RSK token balances:', error);
		throw error;
	}
}

/**
 * Send RBTC transaction
 *
 * @param to - Recipient address
 * @param amount - Amount to send in RBTC (as string)
 * @returns Transaction hash
 * @throws {Error} If wallet manager is not initialized or transaction fails
 */
export async function sendRBTC(to: string, amount: string): Promise<string> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const manager = getWalletManager();
	const txHash = await manager.rskWallet.send(to, amount);

	void Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Send ERC-20 token transaction
 *
 * @param tokenAddress - ERC-20 token contract address
 * @param to - Recipient address
 * @param amount - Amount to send in token units (as string)
 * @returns Transaction hash
 * @throws {Error} If wallet manager is not initialized or transaction fails
 */
export async function sendRSKToken(
	tokenAddress: string,
	to: string,
	amount: string
): Promise<string> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const manager = getWalletManager();
	const wallet = manager.rskWallet.getWallet();
	const provider = manager.rskWallet.getProvider();

	if (!wallet || !provider) {
		throw new Error('RSK wallet not initialized');
	}

	// Normalize addresses to EIP-55 checksum format (required by ethers v6)
	// Note: getAddress() requires addresses to be lowercase OR correctly checksummed
	// Convert to lowercase first to handle addresses with invalid checksums
	const normalizedTokenAddress = ethers.getAddress(tokenAddress.toLowerCase());
	const normalizedTo = ethers.getAddress(to.toLowerCase());

	// Create ERC-20 contract instance
	const tokenContract = new ethers.Contract(normalizedTokenAddress, ERC20_ABI, wallet);

	// Get token decimals
	const decimals = await tokenContract.decimals();

	// Parse amount with correct decimals
	const amountWei = ethers.parseUnits(amount, decimals);

	// Send transaction with normalized address
	const tx = await tokenContract.transfer(normalizedTo, amountWei);

	const receipt = await tx.wait();
	if (!receipt) {
		throw new Error('Transaction receipt is null');
	}

	// Refresh data and invalidate token cache
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	// Invalidate token balance cache after successful send
	const state = get(walletStore);
	if (state.rsk?.address) {
		tokenBalanceService.clearBalanceCache(state.rsk.address);
	}

	return receipt.hash;
}

/**
 * Get balance for a specific token
 *
 * @param tokenAddress - Token contract address (or 'native' for RBTC)
 * @returns Token balance or null if not found
 * @throws {Error} If wallet manager is not initialized
 */
export async function getTokenBalance(tokenAddress: string): Promise<TokenBalance | null> {
	try {
		const manager = getWalletManager();

		if (tokenAddress === 'native') {
			// Return native RBTC balance
			const rbtcBalance = await manager.rskWallet.getBalance();
			return {
				address: 'native',
				name: 'Rootstock Bitcoin',
				symbol: 'RBTC',
				decimals: 18,
				balance: rbtcBalance.balance.toString(),
				formattedBalance: rbtcBalance.formatted,
				isNative: true,
				icon: '₿'
			};
		}

		// Load all tokens and find the one matching the address
		const allTokens = await loadRSKTokenBalances();
		return (
			allTokens.find((token) => token.address.toLowerCase() === tokenAddress.toLowerCase()) || null
		);
	} catch (error) {
		console.error('Failed to get token balance:', error);
		return null;
	}
}

/**
 * Send BSC USDT transaction
 *
 * @param to - Recipient address
 * @param amount - Amount to send in USDT (as string)
 * @returns Transaction hash
 * @throws {Error} If wallet manager is not initialized or transaction fails
 */
export async function sendBSCUSDT(to: string, amount: string): Promise<string> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const manager = getWalletManager();
	const txHash = await manager.bscWallet.sendUSDT(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Send BSC BNB transaction
 *
 * @param to - Recipient address
 * @param amount - Amount to send in BNB (as string)
 * @returns Transaction hash
 * @throws {Error} If wallet manager is not initialized or transaction fails
 */
export async function sendBSCBNB(to: string, amount: string): Promise<string> {
	const { requirePasskeyApproval } = await import('$lib/utils/helpers/passkey-approval');
	await requirePasskeyApproval();
	const manager = getWalletManager();
	const txHash = await manager.bscWallet!.sendBNB(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
}

/**
 * Create reverse swap (Lightning → RBTC)
 *
 * @param amountSats - Amount in satoshis to swap
 * @param description - Optional description for the swap
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createReverseSwap(
	amountSats: number,
	description?: string
): Promise<{ swapId: string; invoice: string; swapData: BoltzSwapData }> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

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
 * Create chain swap (L-BTC → RBTC)
 *
 * @param amountSats - Amount in satoshis to swap
 * @param description - Optional description for the swap
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createChainSwap(
	amountSats: number,
	description?: string
): Promise<{ swapId: string; liquidUri: string; swapData: ChainSwapData }> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

	const result = await manager.chainSwapService!.createChainSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner,
		description
	});
	markExpectingInbound();
	return result;
}

/**
 * Get swap limits for all supported swap types
 *
 * @returns Swap limits object
 * @throws {Error} If wallet manager is not initialized
 */
export async function getSwapLimits() {
	const manager = getWalletManager();
	return await manager.getSwapLimits();
}

/**
 * Create submarine swap (RBTC → Lightning)
 *
 * @param invoice - Lightning invoice to pay
 * @param description - Optional description for the swap
 * @returns Submarine swap result
 * @throws {Error} If wallet manager is not initialized or swap creation fails
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
		signer: manager.getRSKWallet(), // Add signer for gas estimation
		description
	};

	return await manager.submarineSwapService.createSubmarineSwap(params);
}

/**
 * Lock funds for submarine swap
 *
 * @param swapData - Submarine swap data
 * @returns Transaction hash
 * @throws {Error} If wallet manager is not initialized or transaction fails
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
 * Get submarine swap limits for RBTC to BTC swaps
 *
 * @returns Swap limits with minimal and maximal amounts
 * @throws {Error} If wallet manager is not initialized
 */
export async function getSubmarineSwapLimits(): Promise<{ minimal: number; maximal: number }> {
	const manager = getWalletManager();
	return await manager.submarineSwapService.getSwapLimits('RBTC', 'BTC');
}

/**
 * Get submarine swap pairs with fee information from Boltz API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized
 */
export async function getSubmarineSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getSubmarineSwapPairs();
}

/**
 * Get cached submarine swap pairs (1 hour TTL)
 * Returns cached data if available and fresh, otherwise fetches from API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized or API call fails
 */
export async function getCachedSubmarineSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	// Return cached data if valid
	if (
		cachedSwapPairs.submarine &&
		now - cachedSwapPairs.submarine.timestamp < cachedSwapPairs.submarine.ttl
	) {
		return cachedSwapPairs.submarine.data;
	}

	// Fetch fresh data
	const data = await getSubmarineSwapPairs();
	cachedSwapPairs.submarine = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Get reverse swap pairs with fee information from Boltz API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized
 */
export async function getReverseSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getReverseSwapPairs();
}

/**
 * Get cached reverse swap pairs (1 hour TTL)
 * Returns cached data if available and fresh, otherwise fetches from API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized or API call fails
 */
export async function getCachedReverseSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	// Return cached data if valid
	if (
		cachedSwapPairs.reverse &&
		now - cachedSwapPairs.reverse.timestamp < cachedSwapPairs.reverse.ttl
	) {
		return cachedSwapPairs.reverse.data;
	}

	// Fetch fresh data
	const data = await getReverseSwapPairs();
	cachedSwapPairs.reverse = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Get chain swap pairs with fee information from Boltz API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized
 */
export async function getChainSwapPairs(): Promise<SwapPairs> {
	const manager = getWalletManager();
	return await manager.boltzClient.getChainSwapPairs();
}

/**
 * Get cached chain swap pairs (1 hour TTL)
 * Returns cached data if available and fresh, otherwise fetches from API
 *
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized or API call fails
 */
export async function getCachedChainSwapPairs(): Promise<SwapPairs> {
	const now = Date.now();

	// Return cached data if valid
	if (cachedSwapPairs.chain && now - cachedSwapPairs.chain.timestamp < cachedSwapPairs.chain.ttl) {
		return cachedSwapPairs.chain.data;
	}

	// Fetch fresh data
	const data = await getChainSwapPairs();
	cachedSwapPairs.chain = { data, timestamp: now, ttl: SWAP_PAIRS_CACHE_TTL };
	return data;
}

/**
 * Clear all swap pairs caches
 * Useful for forcing a refresh of fee data
 */
export function clearSwapPairsCache(): void {
	cachedSwapPairs.submarine = null;
	cachedSwapPairs.reverse = null;
	cachedSwapPairs.chain = null;
}

/**
 * Estimate gas for ERC-20 token transfer
 *
 * @param tokenAddress - ERC-20 token contract address
 * @param to - Recipient address
 * @param amount - Amount to send in token units (as string)
 * @returns Gas estimation with gas limit, gas price, and total cost
 * @throws {Error} If RSK wallet is not initialized or gas estimation fails
 */
export async function estimateERC20Gas(
	tokenAddress: string,
	to: string,
	amount: string
): Promise<GasEstimation> {
	try {
		const state = get(walletStore);
		if (!state.rsk.wallet || !state.rsk.provider) {
			console.error('[WALLET-STORE] estimateERC20Gas() - Wallet not initialized:', {
				hasWallet: !!state.rsk.wallet,
				hasProvider: !!state.rsk.provider
			});
			throw new Error('RSK wallet not initialized');
		}

		const provider = state.rsk.provider;
		const wallet = state.rsk.wallet;

		// Normalize addresses to EIP-55 checksum format (required by ethers v6)
		// Note: getAddress() requires addresses to be lowercase OR correctly checksummed
		// Convert to lowercase first to handle addresses with invalid checksums
		const normalizedTokenAddress = ethers.getAddress(tokenAddress.toLowerCase());
		const normalizedTo = ethers.getAddress(to.toLowerCase());

		// Create ERC-20 contract instance
		const tokenContract = new ethers.Contract(normalizedTokenAddress, ERC20_ABI, wallet);

		// Get token decimals
		const decimals = await tokenContract.decimals();

		// Parse amount with correct decimals
		const amountWei = ethers.parseUnits(amount, decimals);

		// Estimate gas for transfer with normalized address
		const gasEstimate = await tokenContract.transfer.estimateGas(normalizedTo, amountWei);

		// Get gas price
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);

		// Calculate total cost (gas only, no value for ERC-20)
		const gasCost = gasEstimate * gasPrice;

		return {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			totalCost: gasCost.toString(),
			totalCostFormatted: ethers.formatEther(gasCost)
		};
	} catch (error) {
		throw new Error(
			`ERC-20 gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Estimate gas for RBTC transaction
 *
 * @param to - Recipient address
 * @param amount - Amount to send in RBTC (as string)
 * @returns Gas estimation with gas limit, gas price, and total cost
 * @throws {Error} If RSK wallet is not initialized or gas estimation fails
 */
export async function estimateRBTCGas(to: string, amount: string): Promise<GasEstimation> {
	try {
		const manager = getWalletManager();
		return await manager.rskWallet.estimateGas(to, amount);
	} catch (error) {
		throw new Error(
			`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

const BSC_TRANSFER_GAS = 65_000n;

/**
 * Estimate the BNB network fee for a BSC token transfer.
 * Returns the fee in BNB (totalCostFormatted). Callers convert to sats.
 */
export async function estimateBSCTransferGas(): Promise<GasEstimation> {
	try {
		const manager = getWalletManager();
		const provider = manager.bscWallet.getProvider();
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice ?? 0n;
		const gasCost = BSC_TRANSFER_GAS * gasPrice;
		return {
			gasLimit: BSC_TRANSFER_GAS.toString(),
			gasPrice: gasPrice.toString(),
			totalCost: gasCost.toString(),
			totalCostFormatted: ethers.formatEther(gasCost)
		};
	} catch (error) {
		throw new Error(
			`BSC gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Set active network in UI
 *
 * @param network - Network to set as active ('liquid' | 'rsk' | 'bsc')
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

/**
 * Format address with ellipsis in the middle
 *
 * @param address - Address to format
 * @param startChars - Number of characters to show at start (default: 6)
 * @param endChars - Number of characters to show at end (default: 4)
 * @returns Formatted address string
 */
export function formatAddress(address: string, startChars = 6, endChars = 4): string {
	if (!address || address.length < startChars + endChars) {
		return address;
	}
	return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Format satoshis as a number string with thousand separators
 *
 * @param sats - Amount in satoshis
 * @returns Formatted string
 */
export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US').format(sats);
}

/**
 * Format amount as USD currency
 *
 * @param amount - Amount to format
 * @returns Formatted currency string
 */
export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD'
	}).format(amount);
}

// Derived stores for backward compatibility
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

// Wallet manager compatibility object
/**
 * Cleanup expired swaps from Nostr storage
 * Called after WebSocket has synced swap statuses
 *
 * @param manager - Wallet manager instance
 * @param submarineSwaps - Submarine swaps to check
 * @param reverseSwaps - Reverse swaps to check
 * @param chainSwaps - Chain swaps to check
 */
function cleanupExpiredSwaps(
	manager: WalletManager,
	submarineSwaps: SubmarineSwapData[],
	reverseSwaps: BoltzSwapData[],
	chainSwaps: ChainSwapData[]
): void {
	// Collect expired swaps to delete based on swap type
	// See: https://api.docs.boltz.exchange/lifecycle.html
	const swapsToDelete: Array<{ id: string; type: 'submarine' | 'reverse' | 'chain' }> = [];

	// Submarine swaps: delete if expired and user never locked funds
	submarineSwaps.forEach((s) => {
		if (s.status === 'swap.expired' && !s.lockupTxHash) {
			swapsToDelete.push({ id: s.id, type: 'submarine' });
		}
	});

	// Reverse swaps: delete if expired (invoice was never paid or Boltz auto-refunded)
	reverseSwaps.forEach((s) => {
		if (s.status === 'swap.expired') {
			swapsToDelete.push({ id: s.id, type: 'reverse' });
		}
	});

	// Chain swaps: delete if expired and neither side locked funds
	chainSwaps.forEach((s) => {
		if (s.status === 'swap.expired' && !s.lockupTxHash && !s.serverLockupTxHash) {
			swapsToDelete.push({ id: s.id, type: 'chain' });
		}
	});

	// Delete safe-to-delete expired swaps from Nostr storage
	if (swapsToDelete.length > 0) {
		console.log(
			`Deleting ${swapsToDelete.length} expired swap(s) from Nostr:`,
			swapsToDelete.map((s) => s.id)
		);
		Promise.all(
			swapsToDelete.map(({ id, type }) => {
				const service =
					type === 'submarine'
						? manager.submarineSwapService
						: type === 'reverse'
							? manager.reverseSwapService
							: manager.chainSwapService;
				return service.deleteSwap(id);
			})
		).catch((error) => {
			console.error('Failed to delete expired swaps:', error);
		});
	}
}

export const walletManager = {
	initialize,
	cleanup: disconnectWallet,
	softCleanup,
	getRSKAddress,
	setActiveTab,
	loadAssets,
	loadTransactions,
	refreshTransactions,
	markExpectingInbound,
	loadRbtcExchangeRate,
	sendRBTC,
	sendRSKToken,
	sendBSCUSDT,
	sendBSCBNB,
	createReverseSwap,
	createChainSwap,
	estimateRBTCGas,
	estimateBSCTransferGas,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	getSubmarineSwapLimits,
	getSubmarineSwapPairs,
	getReverseSwapPairs,
	getChainSwapPairs,
	getCachedSubmarineSwapPairs,
	getCachedReverseSwapPairs,
	getCachedChainSwapPairs,
	clearSwapPairsCache,
	loadRSKTokenBalances,
	getTokenBalance,
	estimateERC20Gas,
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
