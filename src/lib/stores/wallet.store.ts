/**
 * Unified Wallet Store - SDK Version
 *
 * This store uses the @bittasker/wallet-core SDK for all wallet operations.
 * It maintains backward compatibility with the existing wallet store API.
 */

import { WalletManager, 
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

// Extend WalletState to include transaction loading timestamp and loading state
type ExtendedWalletState = WalletState & {
	transactionsLastLoaded: number | null;
	isLoadingTransactions: boolean; // Flag to prevent concurrent loads
};
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers } from 'ethers';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

// Initial state
const initialState: ExtendedWalletState = {
	isInitializing: false,
	isConnected: false,
	isConnecting: false,
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
		// Show loading if wallet is initializing/connecting
		if ($walletStore.isInitializing || $walletStore.isConnecting) {
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

// Event listeners cleanup
const eventListeners: (() => void)[] = [];

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
	const startTime = performance.now();
	console.log('[WalletStore] Starting wallet initialization...');
	
	try {
		const storeUpdateStartTime = performance.now();
		walletStore.update(s => ({ ...s, isInitializing: true, isConnecting: true, error: null }));
		const storeUpdateDuration = performance.now() - storeUpdateStartTime;
		console.log(`[WalletStore] Initial store update completed in ${storeUpdateDuration.toFixed(2)}ms`);
		
		// Get mnemonic
		// Check if biometric data is cached (user already authenticated)
		// We only want to measure the time AFTER user authentication is complete
		const { appStore } = await import('$lib/stores/app.store');
		const { get } = await import('svelte/store');
		let mnemonic: string;
		
		const cachedState = get(appStore);
		const hasCachedAuth = cachedState.biometricData !== null;
		
		if (!hasCachedAuth) {
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
			mnemonic = await decryptWalletMnemonicWithBiometrics(cachedState.biometricData.password);
			const decryptDuration = performance.now() - decryptStartTime;
			console.log(`[WalletStore] Mnemonic decryption completed in ${decryptDuration.toFixed(2)}ms`);
		}
		
		// Get Nostr keys for swap storage
		const nostrKeysStartTime = performance.now();
		console.log('[WalletStore] Fetching Nostr keys...');
		const { nsec } = await getNostrKeyPair();
		const nostrKeysDuration = performance.now() - nostrKeysStartTime;
		console.log(`[WalletStore] Nostr keys fetched in ${nostrKeysDuration.toFixed(2)}ms`);
		
		// Get network from environment
		const networkConfigStartTime = performance.now();
		const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as NetworkType;
		const networkConfigDuration = performance.now() - networkConfigStartTime;
		console.log(`[WalletStore] Network config loaded in ${networkConfigDuration.toFixed(2)}ms (network: ${network})`);
		
		// Create Nostr storage adapter for reverse swaps
		const storageStartTime = performance.now();
		console.log('[WalletStore] Creating Nostr storage adapters...');
		const reverseSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-reverse');
		const chainSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-chain');
		const submarineSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-submarine');
		const storageDuration = performance.now() - storageStartTime;
		console.log(`[WalletStore] Nostr storage adapters created in ${storageDuration.toFixed(2)}ms`);
		
		// Initialize wallet manager
		const configStartTime = performance.now();
		const config: WalletManagerConfig = {
			network,
			mnemonic,
			swapStorages: {
				reverse: reverseSwapStorage,
				chain: chainSwapStorage,
				submarine: submarineSwapStorage
			}
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
				isConnecting: false,
				isInitializing: false,
				hasAnyConnection: true,
				rsk: {
					...s.rsk,
					connected: true,
					connecting: false,
					address: rskWallet.getAddress(),
					balance: rskBalanceData.balance.toString(),
					formattedBalance: rskBalanceData.formatted,
					wallet: rskWallet.getWallet() as any,
					provider: rskWallet.getProvider() as any
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
					wallet: bscWallet.getWallet() as any,
					provider: bscWallet.getProvider() as any
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
		walletStore.update(s => ({
			...s,
			isInitializing: false,
			isConnecting: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallet'
		}));
		throw error;
	}
}

/**
 * Disconnect wallet
 */
export function disconnectWallet(): void {
	if (sdkWalletManager) {
		// Disconnect individual wallets
		if (sdkWalletManager.rskWallet) {
			sdkWalletManager.rskWallet.disconnect();
		}
		if (sdkWalletManager.bscWallet) {
			sdkWalletManager.bscWallet.disconnect();
		}
		sdkWalletManager = null;
	}
	
	// Cleanup event listeners
	eventListeners.forEach(cleanup => cleanup());
	eventListeners.length = 0;
	
	walletStore.set(initialState);
	hasLoadedAssets.set(false); // Reset flag on disconnect
}

/**
 * Load assets
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
		
		// Use balances already fetched during initialization (reuse from store to avoid redundant fetch)
		const balanceReadStartTime = performance.now();
		console.log('[WalletStore] Reading balances from store (already fetched during initialization)...');
		
		// Process RSK balance from store
		if (state.rsk.connected && state.rsk.formattedBalance) {
			const rbtcBalance = parseFloat(state.rsk.formattedBalance);
			totalRbtc += rbtcBalance;
			const rbtcUsdValue = rbtcBalance * rbtcPrice;
			totalUsd += rbtcUsdValue;
			
			console.log(`[WalletStore] RSK balance from store: ${state.rsk.formattedBalance} RBTC`);
			
			assets.push({
				assetId: 'rbtc',
				name: 'Smart Bitcoin',
				ticker: 'RBTC',
				precision: 8,
				icon: '₿',
				balance: rbtcBalance,
				formattedBalance: state.rsk.formattedBalance,
				network: 'RSK',
				usdValue: rbtcUsdValue
			});
		}
		
		// Process BSC balances from store
		if (state.bsc.connected && state.bsc.formattedBnbBalance) {
			const bnbBalance = parseFloat(state.bsc.formattedBnbBalance);
			totalBnb += bnbBalance;
			const bnbUsdValue = bnbBalance * bnbPrice;
			totalUsd += bnbUsdValue;
			
			console.log(`[WalletStore] BSC balances from store: BNB: ${state.bsc.formattedBnbBalance}, USDT: ${state.bsc.formattedUsdtBalance}`);
			
			assets.push({
				assetId: 'bnb',
				name: 'BNB',
				ticker: 'BNB',
				precision: 8,
				icon: 'BNB',
				balance: bnbBalance,
				formattedBalance: state.bsc.formattedBnbBalance,
				network: 'BSC',
				usdValue: bnbUsdValue
			});
			
			// Check USDT balance from store
			if (state.bsc.formattedUsdtBalance) {
				const usdtBalance = parseFloat(state.bsc.formattedUsdtBalance);
				if (usdtBalance > 0) {
					totalUsdt += usdtBalance;
					totalUsd += usdtBalance; // USDT is 1:1 with USD
					
					assets.push({
						assetId: 'usdt',
						name: 'Tether USD',
						ticker: 'USDT',
						precision: 6,
						icon: '₮',
						balance: usdtBalance,
						formattedBalance: state.bsc.formattedUsdtBalance,
						network: 'BSC',
						usdValue: usdtBalance
					});
				}
			}
		}
		
		const balanceReadDuration = performance.now() - balanceReadStartTime;
		console.log(`[WalletStore] Balance reading from store completed in ${balanceReadDuration.toFixed(2)}ms (saved ~500ms by reusing initial fetch)`);
		
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
		// Don't set hasLoadedAssets on error, so loading state persists
	}
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
		
		const transactions: Transaction[] = [];
		
		// Load RSK and BSC transactions in parallel
		const parallelStartTime = performance.now();
		console.log('[WalletStore] Loading RSK and BSC transactions in parallel...');
		
		const [rskResult, bscResult] = await Promise.allSettled([
			manager.rskWallet ? manager.rskWallet.loadTransactions() : Promise.resolve([]),
			manager.bscWallet ? manager.bscWallet.loadTransactions() : Promise.resolve([])
		]);
		
		const parallelDuration = performance.now() - parallelStartTime;
		console.log(`[WalletStore] Parallel network loading completed in ${parallelDuration.toFixed(2)}ms`);
		
		// Process RSK transactions
		if (rskResult.status === 'fulfilled') {
			const rskTxs = rskResult.value;
			const mapStartTime = performance.now();
			transactions.push(...rskTxs.map(tx => ({
				...tx,
				network: 'rsk' as const,
				tokenSymbol: 'RBTC'
			})));
			const mapDuration = performance.now() - mapStartTime;
			console.log(`[WalletStore] RSK transactions loaded: ${rskTxs.length} transactions, mapping completed in ${mapDuration.toFixed(2)}ms`);
		} else {
			console.error('[WalletStore] RSK transaction loading failed:', rskResult.reason);
		}
		
		// Process BSC transactions
		if (bscResult.status === 'fulfilled') {
			const bscTxs = bscResult.value;
			const mapStartTime = performance.now();
			transactions.push(...bscTxs.map(tx => ({
				...tx,
				network: 'bsc' as const
			})));
			const mapDuration = performance.now() - mapStartTime;
			console.log(`[WalletStore] BSC transactions loaded: ${bscTxs.length} transactions, mapping completed in ${mapDuration.toFixed(2)}ms`);
		} else {
			console.error('[WalletStore] BSC transaction loading failed:', bscResult.reason);
		}
		
		// Sort by timestamp
		const sortStartTime = performance.now();
		transactions.sort((a, b) => b.timestamp - a.timestamp);
		const sortDuration = performance.now() - sortStartTime;
		console.log(`[WalletStore] Transaction sorting completed in ${sortDuration.toFixed(2)}ms (${transactions.length} transactions)`);
		
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
 * Load RBTC exchange rate
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
 * Get swap limits
 */
export async function getSwapLimits() {
	const manager = getWalletManager();
	return await manager.getSwapLimits();
}

/**
 * Create submarine swap (RBTC → Lightning)
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
 * Get submarine swap limits
 */
export async function getSubmarineSwapLimits(): Promise<{ minimal: number; maximal: number }> {
	const manager = getWalletManager();
	return await manager.submarineSwapService.getSwapLimits('RBTC', 'BTC');
}

/**
 * Get submarine swap pairs with fee information
 */
export async function getSubmarineSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getSubmarineSwapPairs();
}

/**
 * Get reverse swap pairs with fee information
 */
export async function getReverseSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getReverseSwapPairs();
}

/**
 * Get chain swap pairs with fee information
 */
export async function getChainSwapPairs(): Promise<any> {
	const manager = getWalletManager();
	return await manager.boltzClient.getChainSwapPairs();
}

/**
 * Estimate gas for RBTC transaction
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
 * UI state setters
 */
export function setActiveNetwork(network: 'liquid' | 'rsk' | 'bsc'): void {
	walletStore.update((state) => ({ ...state, activeNetwork: network }));
}

export function setActiveTab(tab: 'balance' | 'send' | 'receive' | 'transactions' | 'buy-sell' | 'swap'): void {
	walletStore.update((state) => ({ ...state, activeTab: tab }));
}

export function setSelectedAsset(asset: string): void {
	walletStore.update((state) => ({ ...state, selectedAsset: asset }));
}

/**
 * Helper functions for backward compatibility
 */
export function getWallet(network: 'rsk' | 'bsc'): ethers.Wallet | null {
	const state = get(walletStore);
	return network === 'rsk' ? state.rsk.wallet : state.bsc.wallet;
}

export function getProvider(network: 'rsk' | 'bsc'): ethers.JsonRpcProvider | null {
	const state = get(walletStore);
	return network === 'rsk' ? state.rsk.provider : state.bsc.provider;
}

export function formatAddress(address: string, startChars = 6, endChars = 4): string {
	if (!address || address.length < startChars + endChars) {
		return address;
	}
	return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US').format(sats);
}

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

