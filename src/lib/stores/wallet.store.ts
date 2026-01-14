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
} from '@bittasker/wallet-core';
import type { SwapPairsCache } from '$lib/types/wallet';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers, type JsonRpcProvider } from 'ethers';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { processTransactions, type ProcessedTransaction } from '$lib/utils/wallet/transactionHistory';
import { isSwapCompleted, mapSwapToTransaction, shouldShowSwap } from '$lib/utils/wallet/swapTransaction';
import tokenBalanceService from '$lib/api/services/token-balance.service';
import type { TokenBalance } from '$lib/types/wallet';
import { ERROR_MESSAGES } from '$lib/utils/constants/wallet.constants';

// Extended wallet state with processed transactions
type WalletStateExtended = Omit<WalletState, 'transactions'> & {
	transactions: ProcessedTransaction[];
};

// Initial state
const initialState: WalletStateExtended = {
	isInitializing: false,
	isConnected: false,
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

// Event listeners cleanup
const eventListeners: (() => void)[] = [];

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
	console.log('[WALLET-STORE] getWalletManager() - Checking if wallet manager exists');
	console.log('[WALLET-STORE] getWalletManager() - sdkWalletManager exists:', !!sdkWalletManager);
	
	if (!sdkWalletManager) {
		console.error('[WALLET-STORE] getWalletManager() - Wallet manager is null, throwing error');
		throw new Error('Wallet is not initialized.');
	}
	
	console.log('[WALLET-STORE] getWalletManager() - Returning wallet manager');
	return sdkWalletManager;
}

/**
 * Get event listeners array (for cleanup management)
 */
export function getEventListeners(): (() => void)[] {
	return eventListeners;
}

/**
 * Initialize wallet using SDK
 * 
 * @param getBalance - Whether to get the balance of the wallet (RSK and BSC)
 * @returns void
 * @throws {Error} If the wallet fails to initialize
 */

async function initializeWallet(getBalance = false): Promise<void> {
	const state = get(walletStore);

	console.log('[WALLET-STORE] initializeWallet() - Starting initialization check');
	console.log('[WALLET-STORE] initializeWallet() - Current state:', {
		isInitializing: state.isInitializing,
		isConnected: state.isConnected,
		hasSdkWalletManager: !!sdkWalletManager,
		hasProvider: !!state.rsk?.provider,
		hasError: !!state.error,
		error: state.error
	});

	// Skip if already initializing or already connected
	if (state.isInitializing) {
		console.log('[WALLET-STORE] initializeWallet() - Already initializing, skipping');
		return;
	}

	// Skip if already fully initialized
	// BUT: Check if provider is actually valid (not destroyed)
	if (sdkWalletManager && state.isConnected) {
		console.log('[WALLET-STORE] initializeWallet() - Wallet appears initialized, checking provider validity...');
		
		// Test if provider is actually working (not destroyed)
		const provider = state.rsk?.provider;
		if (provider) {
			// Check if provider is destroyed (type-safe check)
			const providerWithDestroyed = provider as JsonRpcProvider & { _destroyed?: boolean };
			const isDestroyed = providerWithDestroyed._destroyed === true || (provider as any).destroyed === true;
			
			if (isDestroyed) {
				if (import.meta.env.DEV) {
					console.log('[WALLET-STORE] initializeWallet() - Provider is marked as destroyed, forcing reinitialization');
				}
				// Force cleanup and reinitialize
				sdkWalletManager = null;
				walletStore.set(initialState);
				if (import.meta.env.DEV) {
					console.log('[WALLET-STORE] initializeWallet() - Cleaned up destroyed provider, proceeding with initialization');
				}
				// Continue to initialization below
			} else {
				// Provider exists and not marked as destroyed
				if (import.meta.env.DEV) {
					console.log('[WALLET-STORE] initializeWallet() - Provider appears valid, skipping initialization');
				}
				return;
			}
		} else {
			// No provider but state says connected - inconsistent state, force reinitialization
			console.warn('[WALLET-STORE] initializeWallet() - No provider but state.isConnected=true, forcing reinitialization');
			sdkWalletManager = null;
			walletStore.set(initialState);
			// Continue to initialization below
		}
	}
	
	console.log('[WALLET-STORE] initializeWallet() - Proceeding with initialization...');

	try {
		walletStore.update(s => ({ ...s, isInitializing: true, error: null }));
		console.log('[WALLET-STORE] initializeWallet() - Set isInitializing=true');

		// Get mnemonic
		console.log('[WALLET-STORE] initializeWallet() - Getting mnemonic...');
		const mnemonic = await getMnemonic();
		console.log('[WALLET-STORE] initializeWallet() - Got mnemonic');

		// Get network from environment
		const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as NetworkType;

		// Create or reuse swap storage instances
		if (!cachedSwapStorages) {
			const { nsec } = await getNostrKeyPair();
			cachedSwapStorages = {
				reverse: new NostrSwapStorage(nsec, 'boltz-swap-reverse'),
				chain: new NostrSwapStorage(nsec, 'boltz-swap-chain'),
				submarine: new NostrSwapStorage(nsec, 'boltz-swap-submarine')
			};
		}

		// Initialize wallet manager
		const config: WalletManagerConfig = {
			network,
			mnemonic,
			swapStorages: cachedSwapStorages
		};

		console.log('[WALLET-STORE] initializeWallet() - Creating new WalletManager instance...');
		sdkWalletManager = new WalletManager(config);
		console.log('[WALLET-STORE] initializeWallet() - Calling sdkWalletManager.initialize()...');
		await sdkWalletManager.initialize();
		console.log('[WALLET-STORE] initializeWallet() - SDK wallet manager initialized');

		// Update store with wallet info
		const rskWallet = sdkWalletManager.rskWallet;
		const bscWallet = sdkWalletManager.bscWallet;
		console.log('[WALLET-STORE] initializeWallet() - Got wallets:', {
			hasRskWallet: !!rskWallet,
			hasBscWallet: !!bscWallet
		});

		if (rskWallet && bscWallet) {
			console.log('[WALLET-STORE] initializeWallet() - Updating store with wallet info...');
			walletStore.update(s => ({
				...s,
				isConnected: true,
				isInitializing: false,
				rsk: {
					...s.rsk,
					connected: true,
					connecting: false,
					address: rskWallet.getAddress(),
					wallet: rskWallet.getWallet() as ethers.Wallet,
					provider: rskWallet.getProvider() as ethers.JsonRpcProvider
				},
				bsc: {
					...s.bsc,
					connected: true,
					connecting: false,
					address: bscWallet.getAddress(),
					wallet: bscWallet.getWallet() as ethers.Wallet,
					provider: bscWallet.getProvider() as ethers.JsonRpcProvider
				}
			}));
			console.log('[WALLET-STORE] initializeWallet() - Store updated successfully');

			if (getBalance) {
				console.log('[WALLET-STORE] initializeWallet() - Fetching balances...');
				Promise.all([
					rskWallet.getBalance(),
					bscWallet.getBalances()
				]).then(([rskBalance, bscBalances]) => {
					walletStore.update(s => ({
						...s,
						rsk: {
							...s.rsk,
							balance: rskBalance.balance.toString(),
							formattedBalance: rskBalance.formatted,
						},
						bsc: {
							...s.bsc,
							bnbBalance: bscBalances.bnb.balance.toString(),
							usdtBalance: bscBalances.usdt.balance.toString(),
							formattedBnbBalance: bscBalances.bnb.formatted,
							formattedUsdtBalance: bscBalances.usdt.formatted,
						}
					}));
				});
			}
		}
	} catch (error) {
		console.error('[WALLET-STORE] initializeWallet() - Failed to initialize wallet:', error);
		const errorMessage = error instanceof Error ? error.message : 'Failed to initialize wallet';
		console.error('[WALLET-STORE] initializeWallet() - Error details:', {
			message: errorMessage,
			stack: error instanceof Error ? error.stack : 'No stack'
		});
		walletStore.update(s => ({
			...s,
			isInitializing: false,
			error: errorMessage
		}));
		console.error('[WALLET-STORE] initializeWallet() - Store updated with error, rethrowing...');
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

	const address = await initializeWallet().then(() => {
		return get(walletStore).rsk.address;
	});

	return address || '';
}

/**
 * Disconnect wallet
 */
function disconnectWallet(): void {
	console.log('[WALLET-STORE] disconnectWallet() - Starting cleanup');
	console.log('[WALLET-STORE] disconnectWallet() - sdkWalletManager exists:', !!sdkWalletManager);
	
	if (sdkWalletManager) {
		console.log('[WALLET-STORE] disconnectWallet() - Disposing wallet manager...');
		sdkWalletManager.dispose();
		sdkWalletManager = null;
		console.log('[WALLET-STORE] disconnectWallet() - Wallet manager disposed and set to null');
	}

	// Clear cached swap storages
	console.log('[WALLET-STORE] disconnectWallet() - Clearing swap storages');
	cachedSwapStorages = null;

	// Cleanup event listeners
	console.log('[WALLET-STORE] disconnectWallet() - Cleaning up event listeners (count:', eventListeners.length, ')');
	eventListeners.forEach(cleanup => cleanup());
	eventListeners.length = 0;

	console.log('[WALLET-STORE] disconnectWallet() - Resetting wallet store to initial state');
	walletStore.set(initialState);
	console.log('[WALLET-STORE] disconnectWallet() - Cleanup complete');
}

/**
 * Load wallet assets and update balances from blockchain
 * Fetches fresh balances for RSK and BSC networks and calculates total USD value
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

		// Fetch ALL data in parallel: prices and balances
		// Note: For debug wallet, we'll load all tokens separately via loadRSKTokenBalances()
		// This keeps the existing loadAssets() working for main wallet page
		const [rbtcPrice, bnbPrice, rskBalanceData, bscBalances] = await Promise.all([
			cryptoPriceService.getCurrentPrice('RBTC').catch(() => 0),
			cryptoPriceService.getCurrentPrice('BNB').catch(() => 0),
			state.rsk.connected && manager.rskWallet ? manager.rskWallet.getBalance() : Promise.resolve(null),
			state.bsc.connected && manager.bscWallet ? manager.bscWallet.getBalances() : Promise.resolve(null)
		]);

		// Process RSK assets
		if (rskBalanceData) {
			// Use integer arithmetic for sats calculation to match historical balance calculation
			// Convert Wei directly to sats: 1 RBTC = 10^18 Wei, 1 BTC = 10^8 sats
			// So: sats = Wei / 10^10
			const balanceWei = BigInt(rskBalanceData.balance.toString());
			const rbtcBalanceSats = Number(balanceWei / BigInt(10_000_000_000));
			
			// Keep formatted balance for display and USD calculations
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
		}

		// Process BSC assets
		if (bscBalances) {
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

		// Calculate total sats using integer arithmetic to match historical balance calculation
		// This ensures consistency between current and historical balance calculations
		let totalSats = 0;
		if (rskBalanceData) {
			const balanceWei = BigInt(rskBalanceData.balance.toString());
			totalSats = Number(balanceWei / BigInt(10_000_000_000));
		}

		// Update store with assets and totals
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
	} catch (error) {
		console.error('Failed to load assets:', error);
	}
}

/**
 * Load transactions including pending swaps
 */
async function loadTransactions(): Promise<void> {
	try {
		const manager = getWalletManager();
		const state = get(walletStore);

		// Get current balance for running balance calculation
		const currentBalanceSats = state.totalBalances.sats;

		// Load blockchain transactions
		const [rskTxs, bscTxs] = await Promise.all([
			manager.rskWallet ? manager.rskWallet.loadTransactions() : Promise.resolve([]),
			manager.bscWallet ? manager.bscWallet.loadTransactions() : Promise.resolve([])
		]);

		// Process blockchain transactions
		const [processedRskTxs, processedBscTxs] = await Promise.all([
			processTransactions(rskTxs, state.rsk.address || '', 'rsk', currentBalanceSats),
			processTransactions(bscTxs, state.bsc.address || '', 'bsc', currentBalanceSats)
		]);

	// Load pending swaps from all services
	const [submarineSwaps, reverseSwaps, chainSwaps] = await Promise.all([
		manager.submarineSwapService.recoverPendingSwaps().catch(() => []),
		manager.reverseSwapService.recoverPendingSwaps().catch(() => []),
		manager.chainSwapService.recoverPendingSwaps().catch(() => [])
	]);

	// Defer expired swap cleanup to allow WebSocket to sync status first
	// The swaps are recovered from Nostr with potentially stale status (e.g., 'swap.created')
	// but the WebSocket immediately updates them to current status (e.g., 'swap.expired')
	setTimeout(() => {
		cleanupExpiredSwaps(manager, submarineSwaps, reverseSwaps, chainSwaps);
	}, 2000); // Wait 2 seconds for WebSocket to sync

	// Map swaps to transaction format (updated filter signature)
	const swapTransactions = [
		...submarineSwaps
			.filter((s) => shouldShowSwap(s.status, 'submarine', s))
			.map((s) => mapSwapToTransaction(s, 'submarine', currentBalanceSats)),
		...reverseSwaps
			.filter((s) => shouldShowSwap(s.status, 'reverse', s))
			.map((s) => mapSwapToTransaction(s, 'reverse', currentBalanceSats)),
		...chainSwaps
			.filter((s) => shouldShowSwap(s.status, 'chain', s))
			.map((s) => mapSwapToTransaction(s, 'chain', currentBalanceSats))
	];

		// Combine blockchain transactions
		const allBlockchainTxs = [...processedRskTxs, ...processedBscTxs];
		const blockchainTxHashes = new Set(allBlockchainTxs.map((tx) => tx.hash));

		// Filter out swaps that have corresponding blockchain transactions
		const uniqueSwapTxs = swapTransactions.filter((swapTx) => {
			return !blockchainTxHashes.has(swapTx.hash);
		});

		// Combine and sort by timestamp (newest first)
		const allTransactions = [...allBlockchainTxs, ...uniqueSwapTxs].sort(
			(a, b) => new Date(b.timestamp)?.getTime() - new Date(a.timestamp)?.getTime()
		);

		walletStore.update((s) => ({ ...s, transactions: allTransactions }));
	} catch (error) {
		console.error('Failed to load transactions:', error);
	}
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
	const state = get(walletStore);
	const txIndex = state.transactions.findIndex((tx) => tx.swap?.id === swapId);
	if (txIndex === -1) return;


	const currentTx = state.transactions[txIndex];

	// Preserve the original balanceAfter to prevent recalculation with current balance
	// balanceAfter should remain constant for a swap transaction
	const updatedTx = mapSwapToTransaction(
		updatedSwap,
		swapType,
		currentTx.balanceAfter
	);

	// Compare the ACTUAL Boltz swap status, not the UI representation
	// The UI status is derived from the raw status and may have the same label for different states
	const currentSwapStatus = currentTx.swap?.rawStatus;
	const newSwapStatus = updatedSwap.status;

	// Check if actual swap data has changed
	const hasChanged =
		currentSwapStatus !== newSwapStatus || // Compare actual Boltz status
		currentTx.value !== updatedTx.value;   // Or if amount changed

	if (!hasChanged) {
		// No actual change in swap data - skip update to prevent unnecessary re-renders
		return;
	}

	// Check if swap is completed - remove from pending list
	// (it will appear from blockchain transactions shortly)
	if (isSwapCompleted(updatedSwap.status)) {
		walletStore.update((state) => ({
			...state,
			transactions: state.transactions.filter((tx) => tx.swap?.id !== swapId)
		}));
		return;
	}

	// Immutably update only the specific transaction
	walletStore.update((state) => {
		return {
			...state,
			transactions: state.transactions.map((tx, idx) =>
				idx === txIndex ? updatedTx : tx
			)
		};
	});
}

/**
 * Load RBTC to BTC exchange rate
 * Updates the store with the current exchange rate or sets error flag on failure
 */
async function loadRbtcExchangeRate(): Promise<void> {
	try {
		const rate = await cryptoPriceService.getExchangeRate('RBTC', 'BTC');
		walletStore.update(s => ({
			...s,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
	} catch (error) {
		console.error('Failed to load RBTC exchange rate:', error);
		walletStore.update(s => ({
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
	if (import.meta.env.DEV) {
		console.log('[WALLET-STORE] loadRSKTokenBalances() - Starting to load token balances');
	}
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
		return allTokens.filter(token => {
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
	const manager = getWalletManager();
	const txHash = await manager.rskWallet.send(to, amount);

	// Refresh data
	await Promise.allSettled([loadAssets(), loadTransactions()]);

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
	const manager = getWalletManager();
	const wallet = manager.rskWallet.getWallet();
	const provider = manager.rskWallet.getProvider();

	if (!wallet || !provider) {
		throw new Error('RSK wallet not initialized');
	}

	// Import ERC20_ABI
	const { ERC20_ABI } = await import('$lib/utils/wallet/networkConfig');

	// Create ERC-20 contract instance
	const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

	// Get token decimals
	const decimals = await tokenContract.decimals();

	// Parse amount with correct decimals
	const amountWei = ethers.parseUnits(amount, decimals);

	// Send transaction
	const tx = await tokenContract.transfer(to, amountWei);
	const receipt = await tx.wait();

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
		const state = get(walletStore);

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
		return allTokens.find(token => token.address.toLowerCase() === tokenAddress.toLowerCase()) || null;
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
 * @param description - Optional description for the swap
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createReverseSwap(amountSats: number, description?: string): Promise<any> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

	return await manager.reverseSwapService.createReverseSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner,
		description
	});
}

/**
 * Create chain swap (L-BTC → RBTC)
 * 
 * @param amountSats - Amount in satoshis to swap
 * @param description - Optional description for the swap
 * @returns Swap data
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createChainSwap(amountSats: number, description?: string): Promise<any> {
	const manager = getWalletManager();
	const rskAddress = manager.rskWallet!.getAddress();
	const walletSigner = manager.rskWallet!.getWallet();

	return await manager.chainSwapService!.createChainSwap({
		amountSats,
		rbtcAddress: rskAddress,
		walletSigner,
		description
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
 * @param description - Optional description for the swap
 * @returns Submarine swap result
 * @throws {Error} If wallet manager is not initialized or swap creation fails
 */
export async function createSubmarineSwap(invoice: string, description?: string): Promise<SubmarineSwapResult> {
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
 * Get cached submarine swap pairs (1 hour TTL)
 * Returns cached data if available and fresh, otherwise fetches from API
 * 
 * @returns Swap pairs data
 * @throws {Error} If wallet manager is not initialized or API call fails
 */
export async function getCachedSubmarineSwapPairs(): Promise<any> {
	const now = Date.now();

	// Return cached data if valid
	if (cachedSwapPairs.submarine && (now - cachedSwapPairs.submarine.timestamp) < cachedSwapPairs.submarine.ttl) {
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
export async function getReverseSwapPairs(): Promise<any> {
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
export async function getCachedReverseSwapPairs(): Promise<any> {
	const now = Date.now();

	// Return cached data if valid
	if (cachedSwapPairs.reverse && (now - cachedSwapPairs.reverse.timestamp) < cachedSwapPairs.reverse.ttl) {
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
export async function getChainSwapPairs(): Promise<any> {
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
export async function getCachedChainSwapPairs(): Promise<any> {
	const now = Date.now();

	// Return cached data if valid
	if (cachedSwapPairs.chain && (now - cachedSwapPairs.chain.timestamp) < cachedSwapPairs.chain.ttl) {
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
			throw new Error('RSK wallet not initialized');
		}

		const provider = state.rsk.provider;
		const wallet = state.rsk.wallet;

		// Import ERC20_ABI
		const { ERC20_ABI } = await import('$lib/utils/wallet/networkConfig');

		// Create ERC-20 contract instance
		const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);

		// Get token decimals
		const decimals = await tokenContract.decimals();

		// Parse amount with correct decimals
		const amountWei = ethers.parseUnits(amount, decimals);

		// Estimate gas for transfer
		const gasEstimate = await tokenContract.transfer.estimateGas(to, amountWei);

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
		throw new Error(`ERC-20 gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
	manager: any,
	submarineSwaps: any[],
	reverseSwaps: any[],
	chainSwaps: any[]
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
	initialize: initializeWallet,
	cleanup: disconnectWallet,
	getRSKAddress,
	setActiveTab,
	loadAssets,
	loadTransactions,
	loadRbtcExchangeRate,
	sendRBTC,
	sendRSKToken,
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
	getCachedSubmarineSwapPairs,
	getCachedReverseSwapPairs,
	getCachedChainSwapPairs,
	clearSwapPairsCache,
	loadRSKTokenBalances,
	getTokenBalance,
	estimateERC20Gas,
	onSwapUpdate(callback: (event: any) => void): () => void {
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
