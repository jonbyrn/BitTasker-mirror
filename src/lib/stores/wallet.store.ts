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
	type Transaction,
	type GasEstimation,
	type SubmarineSwapData,
	type CreateSubmarineSwapParams,
	type SubmarineSwapResult
} from '@bittasker/wallet-core';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers } from 'ethers';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { processTransactionWithContractDetection } from '$lib/utils/wallet/transactionHistory';
import type { Transaction as LocalTransaction } from '$lib/types/wallet';

// Extend WalletState to include transaction loading timestamp and loading state
type ExtendedWalletState = WalletState & {
	transactionsLastLoaded: number | null;
	isLoadingTransactions: boolean; // Flag to prevent concurrent loads
};

// Initial state
const initialState: ExtendedWalletState = {
	isInitializing: false,
	isConnected: false,
	isConnecting: false, // Required by WalletState type, but not actively used (dev branch pattern)
	hasAnyConnection: false,
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
	transactionsLastLoaded: null, // Timestamp of last transaction load
	isLoadingTransactions: false, // Flag to prevent concurrent loads
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
	activeTab: 'balance',
	selectedAsset: 'rBTC'
};

// Create the wallet store
export const walletStore = writable<ExtendedWalletState>(initialState);

// Track whether assets have been loaded at least once after connection
// This prevents showing zero balance during the brief window after initialization
const hasLoadedAssets = writable(false);

// Derived store to check if we should show loading state
export const isAssetsLoading = derived(
	[walletStore, hasLoadedAssets],
	([$walletStore, $hasLoadedAssets]) => {
		// Show loading if wallet is initializing
		if ($walletStore.isInitializing) {
			return true;
		}
		// Show loading if wallet has connected but assets haven't been loaded yet
		if ($walletStore.hasAnyConnection && !$hasLoadedAssets) {
			return true;
		}
		return false;
	}
);

// SDK wallet manager instance
let sdkWalletManager: WalletManager | null = null;

// Cached swap storage instances to avoid re-initialization
let cachedSwapStorages: {
	reverse: NostrSwapStorage;
	chain: NostrSwapStorage;
	submarine: NostrSwapStorage;
} | null = null;

// Event listeners cleanup
const eventListeners: (() => void)[] = [];

// Promise cache for getRSKAddress() to prevent race conditions
let rskAddressPromise: Promise<string> | null = null;

/**
 * Get wallet manager instance
 */
export function getWalletManager(): WalletManager {
	if (!sdkWalletManager) {
		throw new Error('Wallet not initialized. Call initializeWallet() first.');
	}
	return sdkWalletManager;
}

/**
 * Get RSK wallet instance (for escrow utilities)
 */
export function getRSKWallet(): ethers.Wallet | null {
	const state = get(walletStore);
	return state.rsk.wallet;
}

/**
 * Get RSK provider instance (for escrow utilities)
 */
export function getRSKProvider(): ethers.JsonRpcProvider | null {
	const state = get(walletStore);
	return state.rsk.provider;
}

/**
 * Get event listeners array (for cleanup management)
 */
export function getEventListeners(): (() => void)[] {
	return eventListeners;
}

/**
 * Initialize wallet using SDK
 */
export async function initializeWallet(): Promise<void> {
	const state = get(walletStore);

	// Skip if already initializing or already connected
	if (state.isInitializing) return;

	// Skip if already fully initialized
	if (sdkWalletManager && state.isConnected) return;

	const startTime = performance.now();
	console.log('[WalletStore] Starting wallet initialization...');

	try {
		const storeUpdateStartTime = performance.now();
		walletStore.update(s => ({ ...s, isInitializing: true, error: null }));
		const storeUpdateDuration = performance.now() - storeUpdateStartTime;
		console.log(`[WalletStore] Initial store update completed in ${storeUpdateDuration.toFixed(2)}ms`);

		// Get mnemonic
		// Check if biometric data is cached (user already authenticated)
		// We only want to measure the time AFTER user authentication is complete
		const { appStore } = await import('$lib/stores/app.store');
		const { get } = await import('svelte/store');
		let mnemonic: string;

		const cachedState = get(appStore);
		const biometricData = cachedState.biometricData;

		if (!biometricData) {
			// User needs to authenticate - don't measure this time
			// getMnemonic() will handle authentication (user interaction) and then decrypt
			console.log('[WalletStore] User authentication required (not measuring authentication time)...');
			mnemonic = await getMnemonic(); // This includes authentication + decryption, but we don't measure it
			// After getMnemonic() completes, authentication is done and mnemonic is decrypted
			// We don't log a duration here since it includes user interaction time
			console.log('[WalletStore] Mnemonic fetched (authentication + decryption, user interaction time not measured)');
		} else {
			// Biometric data is cached - user already authenticated, only measure decryption time
			const decryptStartTime = performance.now();
			console.log('[WalletStore] Decrypting mnemonic (authentication cached, measuring decryption only)...');
			const { decryptWalletMnemonicWithBiometrics } = await import('$lib/utils/helpers/auth');
			mnemonic = await decryptWalletMnemonicWithBiometrics(biometricData.password);
			const decryptDuration = performance.now() - decryptStartTime;
			console.log(`[WalletStore] Mnemonic decryption completed in ${decryptDuration.toFixed(2)}ms`);
		}

		// Get network from environment
		const networkConfigStartTime = performance.now();
		const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as NetworkType;
		const networkConfigDuration = performance.now() - networkConfigStartTime;
		console.log(`[WalletStore] Network config loaded in ${networkConfigDuration.toFixed(2)}ms (network: ${network})`);

		// Create or reuse swap storage instances
		const storageStartTime = performance.now();
		if (!cachedSwapStorages) {
			console.log('[WalletStore] Creating Nostr storage adapters...');
			const { nsec } = await getNostrKeyPair();
			cachedSwapStorages = {
				reverse: new NostrSwapStorage(nsec, 'boltz-swap-reverse'),
				chain: new NostrSwapStorage(nsec, 'boltz-swap-chain'),
				submarine: new NostrSwapStorage(nsec, 'boltz-swap-submarine')
			};
			const storageDuration = performance.now() - storageStartTime;
			console.log(`[WalletStore] Nostr storage adapters created in ${storageDuration.toFixed(2)}ms`);
		} else {
			const storageDuration = performance.now() - storageStartTime;
			console.log(`[WalletStore] Reusing cached swap storages (${storageDuration.toFixed(2)}ms)`);
		}

		// Initialize wallet manager
		const configStartTime = performance.now();
		const config: WalletManagerConfig = {
			network,
			mnemonic,
			swapStorages: cachedSwapStorages
		};
		const configDuration = performance.now() - configStartTime;
		console.log(`[WalletStore] WalletManager config created in ${configDuration.toFixed(2)}ms`);

		const managerCreateStartTime = performance.now();
		console.log('[WalletStore] Creating WalletManager instance...');
		sdkWalletManager = new WalletManager(config);
		const managerCreateDuration = performance.now() - managerCreateStartTime;
		console.log(`[WalletStore] WalletManager instance created in ${managerCreateDuration.toFixed(2)}ms`);

		const sdkInitStartTime = performance.now();
		console.log('[WalletStore] Initializing WalletManager SDK...');
		await sdkWalletManager.initialize();
		const sdkInitDuration = performance.now() - sdkInitStartTime;
		console.log(`[WalletStore] WalletManager SDK initialization completed in ${sdkInitDuration.toFixed(2)}ms`);

		// Update store with wallet info
		const walletInfoStartTime = performance.now();
		console.log('[WalletStore] Getting wallet instances...');
		const rskWallet = sdkWalletManager.rskWallet;
		const bscWallet = sdkWalletManager.bscWallet;
		const walletInfoDuration = performance.now() - walletInfoStartTime;
		console.log(`[WalletStore] Wallet instances retrieved in ${walletInfoDuration.toFixed(2)}ms`);

		if (rskWallet && bscWallet) {
			// Get balances in parallel
			const balancesStartTime = performance.now();
			console.log('[WalletStore] Fetching wallet balances in parallel...');
			const [rskBalanceData, bscBalances] = await Promise.all([
				rskWallet.getBalance(),
				bscWallet.getBalances()
			]);
			const balancesDuration = performance.now() - balancesStartTime;
			console.log(`[WalletStore] Wallet balances fetched in ${balancesDuration.toFixed(2)}ms (RSK: ${rskBalanceData.formatted}, BNB: ${bscBalances.bnb.formatted}, USDT: ${bscBalances.usdt.formatted})`);

			const storeUpdateStartTime = performance.now();
			console.log('[WalletStore] Updating store with wallet info...');
			walletStore.update(s => ({
				...s,
				isConnected: true,
				isInitializing: false,
				hasAnyConnection: true,
				rsk: {
					...s.rsk,
					connected: true,
					connecting: false,
					address: rskWallet.getAddress(),
					balance: rskBalanceData.balance.toString(),
					formattedBalance: rskBalanceData.formatted,
					wallet: rskWallet.getWallet() as ethers.Wallet,
					provider: rskWallet.getProvider() as ethers.JsonRpcProvider
				},
				bsc: {
					...s.bsc,
					connected: true,
					connecting: false,
					address: bscWallet.getAddress(),
					bnbBalance: bscBalances.bnb.balance.toString(),
					usdtBalance: bscBalances.usdt.balance.toString(),
					formattedBnbBalance: bscBalances.bnb.formatted,
					formattedUsdtBalance: bscBalances.usdt.formatted,
					wallet: bscWallet.getWallet() as ethers.Wallet,
					provider: bscWallet.getProvider() as ethers.JsonRpcProvider
				}
			}));
			const storeUpdateDuration = performance.now() - storeUpdateStartTime;
			console.log(`[WalletStore] Store updated with wallet info in ${storeUpdateDuration.toFixed(2)}ms`);

			// Load additional data (defer transaction loading for faster perceived initialization)
			const additionalDataStartTime = performance.now();
			console.log('[WalletStore] Loading additional data (assets, exchange rate) in parallel, deferring transactions...');
			const [assetsResult, exchangeRateResult] = await Promise.allSettled([
				loadAssets(),
				loadRbtcExchangeRate()
			]);
			const additionalDataDuration = performance.now() - additionalDataStartTime;
			console.log(`[WalletStore] Additional data loading completed in ${additionalDataDuration.toFixed(2)}ms`);

			// Log results
			if (assetsResult.status === 'fulfilled') {
				console.log('[WalletStore] Assets loaded successfully');
			} else {
				console.error('[WalletStore] Assets loading failed:', assetsResult.reason);
			}

			if (exchangeRateResult.status === 'fulfilled') {
				console.log('[WalletStore] Exchange rate loaded successfully');
			} else {
				console.error('[WalletStore] Exchange rate loading failed:', exchangeRateResult.reason);
			}

			// Defer transaction loading to improve perceived initialization speed
			// This allows the wallet UI to appear faster while transactions load in the background
			console.log('[WalletStore] Deferring transaction loading to background...');
			loadTransactions().catch((error) => {
				console.error('[WalletStore] Deferred transaction loading failed:', error);
			});
		} else {
			console.warn('[WalletStore] Wallet instances not available (rskWallet:', !!rskWallet, ', bscWallet:', !!bscWallet, ')');
		}

		const totalDuration = performance.now() - startTime;
		console.log(`[WalletStore] Total wallet initialization completed in ${totalDuration.toFixed(2)}ms`);

	} catch (error) {
		const errorDuration = performance.now() - startTime;
		console.error(`[WalletStore] Failed to initialize wallet after ${errorDuration.toFixed(2)}ms:`, error);
		
		// Cleanup SDK manager if it was partially initialized
		if (sdkWalletManager) {
			try {
				if (sdkWalletManager.rskWallet) {
					sdkWalletManager.rskWallet.disconnect();
				}
				if (sdkWalletManager.bscWallet) {
					sdkWalletManager.bscWallet.disconnect();
				}
			} catch (cleanupError) {
				console.warn('[WalletStore] Error during cleanup after failed initialization:', cleanupError);
			}
			sdkWalletManager = null;
		}
		
		walletStore.update(s => ({
			...s,
			isInitializing: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallet'
		}));
		throw error;
	}
}

/**
 * Get RSK wallet address, initializing wallet if needed.
 * Uses a promise cache to prevent race conditions from concurrent calls.
 * 
 * @returns The RSK wallet address
 */
export async function getRSKAddress(): Promise<string> {
	const state = get(walletStore);

	// If address already exists, return it immediately
	if (state.rsk.address) {
		return state.rsk.address;
	}

	// If there's already an initialization in progress, return the cached promise
	if (rskAddressPromise) {
		return rskAddressPromise;
	}

	// Create and cache the initialization promise
	rskAddressPromise = initializeWallet()
		.then(() => {
			const address = get(walletStore).rsk.address;
			// Clear cache after successful initialization
			rskAddressPromise = null;
			return address || '';
		})
		.catch((error) => {
			// Clear cache on error so retry is possible
			rskAddressPromise = null;
			throw error;
		});
	
	return rskAddressPromise;
}

/**
 * Disconnect wallet and clean up all resources
 */
export function disconnectWallet(): void {
	// Clear RSK address promise cache
	rskAddressPromise = null;

	if (sdkWalletManager) {
		// Disconnect individual wallets safely
		try {
			if (sdkWalletManager.rskWallet) {
				sdkWalletManager.rskWallet.disconnect();
			}
		} catch (error) {
			console.warn('[WalletStore] Error disconnecting RSK wallet:', error);
		}

		try {
			if (sdkWalletManager.bscWallet) {
				sdkWalletManager.bscWallet.disconnect();
			}
		} catch (error) {
			console.warn('[WalletStore] Error disconnecting BSC wallet:', error);
		}

		sdkWalletManager = null;
	}

	// Clear cached swap storages
	cachedSwapStorages = null;

	// Cleanup event listeners
	eventListeners.forEach(cleanup => {
		try {
			cleanup();
		} catch (error) {
			console.warn('[WalletStore] Error cleaning up event listener:', error);
		}
	});
	eventListeners.length = 0;

	walletStore.set(initialState);
	hasLoadedAssets.set(false); // Reset flag on disconnect
}

/**
 * Load wallet assets and update balances from blockchain
 * Fetches fresh balances for RSK and BSC networks and calculates total USD value
 * 
 * @throws {Error} If wallet manager is not initialized
 */
async function loadAssets(): Promise<void> {
	const startTime = performance.now();
	console.log('[WalletStore] Starting asset loading...');

	try {
		const managerStartTime = performance.now();
		const manager = getWalletManager();
		const state = get(walletStore);
		const managerDuration = performance.now() - managerStartTime;
		console.log(`[WalletStore] Wallet manager retrieved in ${managerDuration.toFixed(2)}ms`);

		const assets: WalletAsset[] = [];

		// Initialize totals
		let totalRbtc = 0;
		let totalBnb = 0;
		let totalUsdt = 0;
		let totalUsd = 0;

		// Fetch current prices
		const pricesStartTime = performance.now();
		console.log('[WalletStore] Fetching crypto prices in parallel...');
		let rbtcPrice = 0;
		let bnbPrice = 0;

		try {
			[rbtcPrice, bnbPrice] = await Promise.all([
				cryptoPriceService.getCurrentPrice('RBTC').catch(() => 0),
				cryptoPriceService.getCurrentPrice('BNB').catch(() => 0)
			]);
			const pricesDuration = performance.now() - pricesStartTime;
			console.log(`[WalletStore] Crypto prices fetched in ${pricesDuration.toFixed(2)}ms (RBTC: $${rbtcPrice}, BNB: $${bnbPrice})`);
		} catch (error) {
			const pricesDuration = performance.now() - pricesStartTime;
			console.warn(`[WalletStore] Failed to fetch some prices after ${pricesDuration.toFixed(2)}ms:`, error);
		}

		// RSK assets - FETCH FRESH BALANCE FROM BLOCKCHAIN
		const rskBalanceStartTime = performance.now();
		if (state.rsk.connected && manager.rskWallet) {
			console.log('[WalletStore] Fetching fresh RSK balance from blockchain...');
			const rskBalanceData = await manager.rskWallet.getBalance();
			const rbtcBalance = parseFloat(rskBalanceData.formatted);
			totalRbtc += rbtcBalance;
			const rbtcUsdValue = rbtcBalance * rbtcPrice;
			totalUsd += rbtcUsdValue;

			// Update store with fresh balance
			walletStore.update(s => ({
				...s,
				rsk: {
					...s.rsk,
					balance: rskBalanceData.balance.toString(),
					formattedBalance: rskBalanceData.formatted
				}
			}));

			const rskBalanceDuration = performance.now() - rskBalanceStartTime;
			console.log(`[WalletStore] RSK balance fetched in ${rskBalanceDuration.toFixed(2)}ms: ${rskBalanceData.formatted} RBTC`);

			assets.push({
				assetId: 'rbtc',
				name: 'Smart Bitcoin',
				ticker: 'RBTC',
				precision: 8,
				icon: '₿',
				balance: rbtcBalance,
				formattedBalance: rskBalanceData.formatted,
				network: 'RSK',
				usdValue: rbtcUsdValue
			});
		}

		// BSC assets - FETCH FRESH BALANCES FROM BLOCKCHAIN
		const bscBalanceStartTime = performance.now();
		if (state.bsc.connected && manager.bscWallet) {
			console.log('[WalletStore] Fetching fresh BSC balances from blockchain...');
			const bscBalances = await manager.bscWallet.getBalances();
			const bnbBalance = parseFloat(bscBalances.bnb.formatted);
			totalBnb += bnbBalance;
			const bnbUsdValue = bnbBalance * bnbPrice;
			totalUsd += bnbUsdValue;

			// Update store with fresh balances
			walletStore.update(s => ({
				...s,
				bsc: {
					...s.bsc,
					bnbBalance: bscBalances.bnb.balance.toString(),
					usdtBalance: bscBalances.usdt.balance.toString(),
					formattedBnbBalance: bscBalances.bnb.formatted,
					formattedUsdtBalance: bscBalances.usdt.formatted
				}
			}));

			const bscBalanceDuration = performance.now() - bscBalanceStartTime;
			console.log(`[WalletStore] BSC balances fetched in ${bscBalanceDuration.toFixed(2)}ms: BNB: ${bscBalances.bnb.formatted}, USDT: ${bscBalances.usdt.formatted}`);

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
		const finalStoreUpdateStartTime = performance.now();
		walletStore.update(s => ({
			...s,
			assets,
			totalBalances: {
				usd: totalUsd,
				sats: totalSats,
				rbtc: totalRbtc,
				usdt: totalUsdt,
				bnb: totalBnb
			}
		}));
		const finalStoreUpdateDuration = performance.now() - finalStoreUpdateStartTime;
		console.log(`[WalletStore] Final store update with assets and totals completed in ${finalStoreUpdateDuration.toFixed(2)}ms`);

		// Mark assets as loaded after successful completion
		hasLoadedAssets.set(true);

		const totalDuration = performance.now() - startTime;
		console.log(`[WalletStore] Total asset loading completed in ${totalDuration.toFixed(2)}ms (${assets.length} assets)`);
	} catch (error) {
		const errorDuration = performance.now() - startTime;
		console.error(`[WalletStore] Failed to load assets after ${errorDuration.toFixed(2)}ms:`, error);
		
		// Reset hasLoadedAssets flag after a delay to allow retry
		// This prevents infinite loading state while still allowing recovery
		setTimeout(() => {
			hasLoadedAssets.set(false);
		}, 5000); // Reset after 5 seconds to allow retry
	}
}

/**
 * Extended Transaction type with balanceAfter field
 */
type TransactionWithBalance = Transaction & {
	balanceAfter?: number;
};

/**
 * Fetch balances from blockchain for transactions
 * Gets the balance at the block number after each transaction
 */
async function fetchTransactionBalances(
	transactions: TransactionWithBalance[],
	manager: WalletManager
): Promise<void> {
	const balanceStartTime = performance.now();
	console.log('[WalletStore] Starting balance fetch for transactions...');

	// Get current wallet state
	const state = get(walletStore);

	// Process transactions in batches to avoid overwhelming the API
	const BATCH_SIZE = 10;
	const batches: TransactionWithBalance[][] = [];
	for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
		batches.push(transactions.slice(i, i + BATCH_SIZE));
	}

	// Process each batch in parallel
	for (const batch of batches) {
		await Promise.allSettled(
			batch.map(async (tx) => {
				try {
					// Skip if balance already exists or transaction is pending/failed
					if (tx.balanceAfter !== undefined || tx.status !== 'confirmed' || !tx.blockNumber) {
						return;
					}

					// Get the provider for the transaction's network
					let provider: ethers.Provider | null = null;
					let address: string | null = null;

					if (tx.network === 'rsk' && state.rsk.provider && state.rsk.address) {
						provider = state.rsk.provider;
						address = state.rsk.address;
					} else if (tx.network === 'bsc' && state.bsc.provider && state.bsc.address) {
						provider = state.bsc.provider;
						address = state.bsc.address;
					}

					if (!provider || !address) {
						return;
					}

					// Get balance at the block number after the transaction
					// Use blockNumber + 1 to get balance after the transaction was included
					const balanceBlock = tx.blockNumber + 1;
					const balanceWei = await provider.getBalance(address, balanceBlock);
					
					// Convert wei to sats (1 rBTC = 1e18 wei, 1 rBTC = 100,000,000 sats)
					const balanceRBTC = parseFloat(ethers.formatEther(balanceWei));
					const balanceSats = Math.floor(balanceRBTC * 100_000_000);

					// Update transaction with balance
					tx.balanceAfter = balanceSats;
				} catch (error) {
					// Silently fail - we'll fall back to calculated balance
					console.debug(`[WalletStore] Failed to fetch balance for tx ${tx.hash}:`, error);
				}
			})
		);
	}

	const balanceDuration = performance.now() - balanceStartTime;
	const balancesFetched = transactions.filter((tx) => tx.balanceAfter !== undefined).length;
	console.log(
		`[WalletStore] Balance fetch completed in ${balanceDuration.toFixed(2)}ms (${balancesFetched}/${transactions.length} balances fetched)`
	);
}

/**
 * Load transactions
 * @param forceRefresh - If true, bypasses the loading lock to force a refresh
 */
async function loadTransactions(forceRefresh: boolean = false): Promise<void> {
	const startTime = performance.now();

	// Check if already loading to prevent concurrent loads (unless forcing refresh)
	if (!forceRefresh) {
		const currentState = get(walletStore);
		if (currentState.isLoadingTransactions) {
			console.log('[WalletStore] Transaction load already in progress, skipping duplicate request');
			return;
		}
	} else {
		console.log('[WalletStore] Force refresh requested, bypassing loading lock');
	}

	// Set loading flag
	walletStore.update(s => ({ ...s, isLoadingTransactions: true }));

	console.log('[WalletStore] Starting transaction load...');

	try {
		const manager = getWalletManager();

		// Check if wallet is connected before attempting to load
		if (!manager || !manager.rskWallet || !manager.bscWallet) {
			console.log('[WalletStore] Wallet not connected, skipping transaction load');
			walletStore.update(s => ({ ...s, isLoadingTransactions: false }));
			return;
		}

		const transactions: TransactionWithBalance[] = [];

		// Load RSK and BSC transactions in parallel
		const parallelStartTime = performance.now();
		console.log('[WalletStore] Loading RSK and BSC transactions in parallel...');

		const [rskResult, bscResult] = await Promise.allSettled([
			manager.rskWallet ? manager.rskWallet.loadTransactions() : Promise.resolve([]),
			manager.bscWallet ? manager.bscWallet.loadTransactions() : Promise.resolve([])
		]);

		const parallelDuration = performance.now() - parallelStartTime;
		console.log(`[WalletStore] Parallel network loading completed in ${parallelDuration.toFixed(2)}ms`);
		
		// Log internal transaction fetch status
		if (rskResult.status === 'fulfilled') {
			console.log(`[WalletStore] RSK wallet-core returned ${rskResult.value.length} transactions`);
			// Check if any transactions have input data
			const withInput = rskResult.value.filter((tx: any) => tx.input || tx.data);
			console.log(`[WalletStore] RSK transactions with input data: ${withInput.length}/${rskResult.value.length}`);
			if (withInput.length === 0 && rskResult.value.length > 0) {
				console.warn(`[WalletStore] ⚠️ CRITICAL: No RSK transactions have input data! Contract function calls cannot be decoded without input data.`);
				console.warn(`[WalletStore] ⚠️ This suggests wallet-core's loadTransactions() may not be fetching complete transaction data from the API.`);
			}
			
			// Check for contract interactions that should have input data
			const contractTxs = rskResult.value.filter((tx: any) => {
				const to = typeof tx.to === 'string' ? tx.to : (tx.to?.hash || '');
				// Check if 'to' address looks like a contract (not a regular address pattern)
				return to && to.startsWith('0x') && to.length === 42;
			});
			console.log(`[WalletStore] RSK transactions to contract addresses: ${contractTxs.length}/${rskResult.value.length}`);
			if (contractTxs.length > 0) {
				const contractTxsWithoutInput = contractTxs.filter((tx: any) => !(tx.input || tx.data));
				if (contractTxsWithoutInput.length > 0) {
					console.error(`[WalletStore] ❌ ERROR: ${contractTxsWithoutInput.length} contract transactions are missing input data!`);
					console.error(`[WalletStore] ❌ These transactions cannot be properly classified or decoded.`);
				}
			}
		}

		// Process RSK transactions with contract detection
		if (rskResult.status === 'fulfilled') {
			const rskTxs = rskResult.value;
			console.log(`[WalletStore] Loaded ${rskTxs.length} raw RSK transactions from API`);
			
			// Log all raw transactions for debugging
			rskTxs.forEach((tx: any, index: number) => {
				console.log(`[WalletStore] Raw RSK transaction ${index + 1}/${rskTxs.length}:`, {
					hash: tx.hash || tx.txHash || 'unknown',
					from: typeof tx.from === 'string' ? tx.from.substring(0, 10) + '...' : (tx.from?.hash?.substring(0, 10) + '...' || 'unknown'),
					to: typeof tx.to === 'string' ? tx.to.substring(0, 10) + '...' : (tx.to?.hash?.substring(0, 10) + '...' || 'null'),
					value: tx.value || '0',
					hasInput: !!(tx.input || tx.data),
					inputLength: (tx.input || tx.data || '').length,
					input: (tx.input || tx.data || '').substring(0, 20) + '...' || 'none',
					blockNumber: tx.blockNumber || 'unknown',
					timestamp: tx.timestamp || 'unknown',
					// Log all available fields to see what wallet-core provides
					allFields: Object.keys(tx)
				});
			});
			
			const mapStartTime = performance.now();
			const state = get(walletStore);
			const address = state.rsk.wallet?.address?.toLowerCase() || '';
			const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as 'mainnet' | 'testnet';
			
			console.log(`[WalletStore] Processing RSK transactions for address: ${address.substring(0, 10)}...`);
			
			// Get EtherSwap address for swap detection
			let etherSwapAddress: string | null = null;
			try {
				const { getBoltzConfig } = await import('$lib/utils/wallet/networkConfig');
				const boltzConfig = getBoltzConfig(network);
				const contractResponse = await fetch(`${boltzConfig.boltzApiUrl}/v2/chain/RBTC/contracts`);
				if (contractResponse.ok) {
					const contracts = await contractResponse.json();
					etherSwapAddress = contracts.swapContracts?.EtherSwap?.toLowerCase() || null;
					console.log(`[WalletStore] EtherSwap address: ${etherSwapAddress || 'not found'}`);
				}
			} catch (error) {
				console.warn('[WalletStore] Could not fetch EtherSwap address:', error);
			}
			
			// Process each transaction with contract detection
			const processPromises = rskTxs.map(async (tx: any) => {
				try {
					// Convert wallet-core Transaction to format expected by contract detection
					const processedTx = await processTransactionWithContractDetection(
						{
							hash: tx.hash || tx.txHash || '',
							from: typeof tx.from === 'string' ? tx.from : (tx.from?.hash || ''),
							to: typeof tx.to === 'string' ? tx.to : (tx.to?.hash || null),
							value: tx.value || '0',
							input: tx.input || tx.data || '',
							data: tx.data || tx.input || '',
							gas_used: tx.gasUsed?.toString() || '0',
							gas_price: tx.gasPrice?.toString() || '0',
							gasUsed: tx.gasUsed?.toString() || '0',
							gasPrice: tx.gasPrice?.toString() || '0',
							block_number: tx.blockNumber?.toString() || '0',
							blockNumber: tx.blockNumber?.toString() || '0',
							timestamp: tx.timestamp || Date.now(),
							status: tx.status === 'confirmed' ? 'ok' : tx.status === 'failed' ? 'failed' : 'ok',
							method: undefined
						},
						address,
						state.rsk.provider,
						'rsk',
						network,
						etherSwapAddress
					);
					
					if (processedTx) {
						console.log(`[WalletStore] Successfully processed transaction ${tx.hash?.substring(0, 10) || 'unknown'}... as type: ${processedTx.type}`);
						// Merge processed transaction with original to preserve any wallet-core specific fields
						return {
							...tx,
							...processedTx,
							network: 'rsk' as const,
							tokenSymbol: 'RBTC'
						} as TransactionWithBalance;
					}
					
					console.log(`[WalletStore] Transaction ${tx.hash?.substring(0, 10) || 'unknown'}... processing returned null, using fallback`);
					// Fallback to original transaction if processing fails
					return {
						...tx,
						network: 'rsk' as const,
						tokenSymbol: 'RBTC'
					} as TransactionWithBalance;
				} catch (error) {
					console.error(`[WalletStore] Failed to process transaction ${tx.hash?.substring(0, 10) || 'unknown'}... with contract detection:`, error);
					// Return original transaction on error
					return {
						...tx,
						network: 'rsk' as const,
						tokenSymbol: 'RBTC'
					} as TransactionWithBalance;
				}
			});
			
			const processedTxs = await Promise.allSettled(processPromises);
			const successfulTxs = processedTxs
				.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
				.map(result => result.value);
			
			// Log all successfully processed transactions with their types
			console.log(`[WalletStore] Successfully processed ${successfulTxs.length} RSK transactions:`);
			successfulTxs.forEach((tx: any, index: number) => {
				console.log(`[WalletStore] Processed transaction ${index + 1}/${successfulTxs.length}:`, {
					hash: tx.hash?.substring(0, 10) + '...' || 'unknown',
					type: tx.type || 'unknown',
					from: tx.from?.substring(0, 10) + '...' || 'unknown',
					to: tx.to?.substring(0, 10) + '...' || 'unknown',
					value: tx.value || '0',
					contractAddress: tx.contractAddress?.substring(0, 10) + '...' || null,
					contractFunction: tx.contractFunction || null,
					escrowId: tx.contractMetadata?.escrowId || null
				});
			});
			
			// Log failed transactions
			const failedTxs = processedTxs.filter(result => result.status === 'rejected');
			if (failedTxs.length > 0) {
				console.warn(`[WalletStore] ${failedTxs.length} RSK transactions failed to process:`);
				failedTxs.forEach((result, index) => {
					console.error(`[WalletStore] Failed transaction ${index + 1}:`, result.reason);
				});
			}
			
			transactions.push(...successfulTxs);
			const mapDuration = performance.now() - mapStartTime;
			console.log(`[WalletStore] RSK transactions loaded: ${rskTxs.length} raw → ${successfulTxs.length} processed, contract detection and mapping completed in ${mapDuration.toFixed(2)}ms`);
		} else {
			console.error('[WalletStore] RSK transaction loading failed:', rskResult.reason);
		}

		// Process BSC transactions with contract detection
		if (bscResult.status === 'fulfilled') {
			const bscTxs = bscResult.value;
			const mapStartTime = performance.now();
			const state = get(walletStore);
			const address = state.bsc.wallet?.address?.toLowerCase() || '';
			const network = (import.meta.env.VITE_BSC_NETWORK || 'testnet') as 'mainnet' | 'testnet';
			
			// Process each transaction with contract detection
			const processPromises = bscTxs.map(async (tx: any) => {
				try {
					// Convert wallet-core Transaction to format expected by contract detection
					const processedTx = await processTransactionWithContractDetection(
						{
							hash: tx.hash || tx.txHash || '',
							from: typeof tx.from === 'string' ? tx.from : (tx.from?.hash || ''),
							to: typeof tx.to === 'string' ? tx.to : (tx.to?.hash || null),
							value: tx.value || '0',
							input: tx.input || tx.data || '',
							data: tx.data || tx.input || '',
							gas_used: tx.gasUsed?.toString() || '0',
							gas_price: tx.gasPrice?.toString() || '0',
							gasUsed: tx.gasUsed?.toString() || '0',
							gasPrice: tx.gasPrice?.toString() || '0',
							block_number: tx.blockNumber?.toString() || '0',
							blockNumber: tx.blockNumber?.toString() || '0',
							timestamp: tx.timestamp || Date.now(),
							status: tx.status === 'confirmed' ? 'ok' : tx.status === 'failed' ? 'failed' : 'ok',
							method: undefined
						},
						address,
						state.bsc.provider,
						'bsc',
						'mainnet', // BSC only has mainnet
						null // No EtherSwap on BSC
					);
					
					if (processedTx) {
						// Merge processed transaction with original to preserve any wallet-core specific fields
						return {
							...tx,
							...processedTx,
							network: 'bsc' as const
						} as TransactionWithBalance;
					}
					
					// Fallback to original transaction if processing fails
					return {
						...tx,
						network: 'bsc' as const
					} as TransactionWithBalance;
				} catch (error) {
					console.warn('[WalletStore] Failed to process transaction with contract detection:', error);
					// Return original transaction on error
					return {
						...tx,
						network: 'bsc' as const
					} as TransactionWithBalance;
				}
			});
			
			const processedTxs = await Promise.allSettled(processPromises);
			const successfulTxs = processedTxs
				.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
				.map(result => result.value);
			
			transactions.push(...successfulTxs);
			const mapDuration = performance.now() - mapStartTime;
			console.log(`[WalletStore] BSC transactions loaded: ${bscTxs.length} transactions, contract detection and mapping completed in ${mapDuration.toFixed(2)}ms`);
		} else {
			console.error('[WalletStore] BSC transaction loading failed:', bscResult.reason);
		}

		// Sort by timestamp
		const sortStartTime = performance.now();
		transactions.sort((a, b) => b.timestamp - a.timestamp);
		const sortDuration = performance.now() - sortStartTime;
		console.log(`[WalletStore] Transaction sorting completed in ${sortDuration.toFixed(2)}ms (${transactions.length} transactions)`);

		// Log final transaction summary before balance fetching
		const finalTypeCounts: Record<string, number> = {};
		transactions.forEach(tx => {
			finalTypeCounts[tx.type] = (finalTypeCounts[tx.type] || 0) + 1;
		});
		console.log(`[WalletStore] Final transaction summary (${transactions.length} total):`, finalTypeCounts);
		
		// Log contract-related transactions specifically
		const contractTxs = transactions.filter(tx => 
			tx.type === 'contract-function' || 
			tx.type === 'contract-send' || 
			tx.type === 'contract-receive'
		);
		if (contractTxs.length > 0) {
			console.log(`[WalletStore] Found ${contractTxs.length} contract-related transactions:`);
			contractTxs.forEach((tx, index) => {
				console.log(`[WalletStore] Contract transaction ${index + 1}/${contractTxs.length}:`, {
					hash: tx.hash?.substring(0, 10) + '...' || 'unknown',
					type: tx.type,
					from: tx.from?.substring(0, 10) + '...' || 'unknown',
					to: tx.to?.substring(0, 10) + '...' || 'unknown',
					value: tx.value || '0',
					contractAddress: tx.contractAddress?.substring(0, 10) + '...' || null,
					contractFunction: tx.contractFunction || null,
					escrowId: tx.contractMetadata?.escrowId || null,
					timestamp: new Date(tx.timestamp).toISOString()
				});
			});
		}

		// Fetch balances from blockchain for each transaction (in parallel batches)
		const balanceFetchStartTime = performance.now();
		await fetchTransactionBalances(transactions, manager);
		const balanceFetchDuration = performance.now() - balanceFetchStartTime;
		console.log(`[WalletStore] Balance fetching completed in ${balanceFetchDuration.toFixed(2)}ms`);

		const updateStartTime = performance.now();
		walletStore.update(s => ({
			...s,
			transactions,
			transactionsLastLoaded: Date.now(), // Always update timestamp, even if empty (handles empty transactions case)
			isLoadingTransactions: false
		}));
		const updateDuration = performance.now() - updateStartTime;
		console.log(`[WalletStore] Store update completed in ${updateDuration.toFixed(2)}ms`);

		const totalDuration = performance.now() - startTime;
		console.log(`[WalletStore] Total transaction load completed in ${totalDuration.toFixed(2)}ms (${transactions.length} total transactions)`);
	} catch (error) {
		const errorDuration = performance.now() - startTime;
		console.error(`[WalletStore] Failed to load transactions after ${errorDuration.toFixed(2)}ms:`, error);

		// Reset loading flag on error
		walletStore.update(s => ({ ...s, isLoadingTransactions: false }));
	}
}

/**
 * Load RBTC to BTC exchange rate
 * Updates the store with the current exchange rate or sets error flag on failure
 */
async function loadRbtcExchangeRate(): Promise<void> {
	const startTime = performance.now();
	console.log('[WalletStore] Starting RBTC exchange rate loading...');

	try {
		const rateStartTime = performance.now();
		const rate = await cryptoPriceService.getExchangeRate('RBTC', 'BTC');
		const rateDuration = performance.now() - rateStartTime;
		console.log(`[WalletStore] RBTC exchange rate fetched in ${rateDuration.toFixed(2)}ms (rate: ${rate})`);

		const storeUpdateStartTime = performance.now();
		walletStore.update(s => ({
			...s,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
		const storeUpdateDuration = performance.now() - storeUpdateStartTime;
		console.log(`[WalletStore] Exchange rate store update completed in ${storeUpdateDuration.toFixed(2)}ms`);

		const totalDuration = performance.now() - startTime;
		console.log(`[WalletStore] Total RBTC exchange rate loading completed in ${totalDuration.toFixed(2)}ms`);
	} catch (error) {
		const errorDuration = performance.now() - startTime;
		console.error(`[WalletStore] Failed to load RBTC exchange rate after ${errorDuration.toFixed(2)}ms:`, error);
		walletStore.update(s => ({
			...s,
			rbtcToBtcRate: 1.0,
			rbtcRateError: true
		}));
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
	const manager = getWalletManager();
	const txHash = await manager.rskWallet.send(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

	return txHash;
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
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createReverseSwap(amountSats: number): Promise<any> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

	return await manager.reverseSwapService!.createReverseSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner
	});
}

/**
 * Create chain swap (L-BTC → RBTC)
 * 
 * @param amountSats - Amount in satoshis to swap
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createChainSwap(amountSats: number): Promise<any> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

	return await manager.chainSwapService!.createChainSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner
	});
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
 * @returns Submarine swap result
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createSubmarineSwap(invoice: string): Promise<SubmarineSwapResult> {
	const manager = getWalletManager();

	const params: CreateSubmarineSwapParams = {
		from: 'RBTC',
		to: 'BTC', // Lightning (represented as BTC in Boltz API)
		invoice,
		signer: manager.getRSKWallet() // Add signer for gas estimation
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
export async function lockSubmarineSwapFunds(swapData: SubmarineSwapData): Promise<{ txHash: string }> {
	const manager = getWalletManager();
	const signer = manager.rskWallet.getWallet();

	const result = await manager.submarineSwapService.lockFundsEVM(swapData, signer);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

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
export async function getSubmarineSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getSubmarineSwapPairs();
}

/**
 * Get reverse swap pairs with fee information from Boltz API
 * 
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized
 */
export async function getReverseSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getReverseSwapPairs();
}

/**
 * Get chain swap pairs with fee information from Boltz API
 * 
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized
 */
export async function getChainSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getChainSwapPairs();
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
		const state = get(walletStore);
		if (!state.rsk.wallet || !state.rsk.provider) {
			throw new Error('RSK wallet not initialized');
		}

		const provider = state.rsk.provider;
		const wallet = state.rsk.wallet;

		// Parse amount
		const value = ethers.parseEther(amount);

		// Estimate gas
		const gasEstimate = await provider.estimateGas({
			from: wallet.address,
			to,
			value
		});

		// Get gas price
		const feeData = await provider.getFeeData();
		const gasPrice = feeData.gasPrice || BigInt(0);

		// Calculate total cost
		const gasCost = gasEstimate * gasPrice;
		const totalCost = value + gasCost;

		return {
			gasLimit: gasEstimate.toString(),
			gasPrice: gasPrice.toString(),
			totalCost: totalCost.toString(),
			totalCostFormatted: ethers.formatEther(totalCost)
		};
	} catch (error) {
		throw new Error(`Gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
export function setActiveTab(tab: 'balance' | 'send' | 'receive' | 'transactions' | 'buy-sell' | 'swap'): void {
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
export const isConnected = derived(walletStore, $w => $w.isConnected);
export const rskAddress = derived(walletStore, $w => $w.rsk.address);
export const bscAddress = derived(walletStore, $w => $w.bsc.address);
export const rskBalance = derived(walletStore, $w => $w.rsk.formattedBalance);
export const bscBnbBalance = derived(walletStore, $w => $w.bsc.formattedBnbBalance);
export const bscUsdtBalance = derived(walletStore, $w => $w.bsc.formattedUsdtBalance);
export const rskConnection = derived(walletStore, $w => $w.rsk);
export const bscConnection = derived(walletStore, $w => $w.bsc);
export const allAssets = derived(walletStore, $w => $w.assets);
export const totalBalances = derived(walletStore, $w => $w.totalBalances);
export const rbtcToBtcRate = derived(walletStore, $w => $w.rbtcToBtcRate);
export const transactions = derived(walletStore, $w => $w.transactions);

// Wallet manager compatibility object
export const walletManager = {
	initialize: initializeWallet,
	getRSKAddress,
	disconnect: disconnectWallet,
	cleanup: disconnectWallet,
	setActiveTab,
	loadAssets,
	loadTransactions: (forceRefresh?: boolean) => loadTransactions(forceRefresh || false),
	retryRbtcExchangeRate: loadRbtcExchangeRate,
	sendRBTC,
	sendBSCUSDT,
	sendBSCBNB,
	createReverseSwap,
	createChainSwap,
	estimateRBTCGas,
	createSubmarineSwap,
	lockSubmarineSwapFunds,
	getSubmarineSwapLimits,
	getSubmarineSwapPairs,
	getReverseSwapPairs,
	getChainSwapPairs,
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
