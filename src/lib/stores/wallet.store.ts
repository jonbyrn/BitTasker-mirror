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
	type SubmarineSwapResult,
	weiToSatoshi
} from '@bittasker/wallet-core';
import type { SwapPairsCache } from '$lib/types/wallet';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers } from 'ethers';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import { processTransactions, type ProcessedTransaction } from '$lib/utils/wallet/transactionHistory';

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
	if (!sdkWalletManager) {
		throw new Error('Wallet is not initialized.');
	}
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

	// Skip if already initializing or already connected
	if (state.isInitializing) return;

	// Skip if already fully initialized
	if (sdkWalletManager && state.isConnected) return;

	try {
		walletStore.update(s => ({ ...s, isInitializing: true, error: null }));

		// Get mnemonic
		const mnemonic = await getMnemonic();

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

		sdkWalletManager = new WalletManager(config);
		await sdkWalletManager.initialize();

		// Update store with wallet info
		const rskWallet = sdkWalletManager.rskWallet;
		const bscWallet = sdkWalletManager.bscWallet;

		if (rskWallet && bscWallet) {
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

			if (getBalance) {
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
		console.error('Failed to initialize wallet:', error);
		walletStore.update(s => ({
			...s,
			isInitializing: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallet'
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

	const address = await initializeWallet().then(() => {
		return get(walletStore).rsk.address;
	});

	return address || '';
}

/**
 * Disconnect wallet
 */
function disconnectWallet(): void {
	if (sdkWalletManager) {
		sdkWalletManager.dispose();
		sdkWalletManager = null;
	}

	// Clear cached swap storages
	cachedSwapStorages = null;

	// Cleanup event listeners
	eventListeners.forEach(cleanup => cleanup());
	eventListeners.length = 0;

	walletStore.set(initialState);
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
		const [rbtcPrice, bnbPrice, rskBalanceData, bscBalances] = await Promise.all([
			cryptoPriceService.getCurrentPrice('RBTC').catch(() => 0),
			cryptoPriceService.getCurrentPrice('BNB').catch(() => 0),
			state.rsk.connected && manager.rskWallet ? manager.rskWallet.getBalance() : Promise.resolve(null),
			state.bsc.connected && manager.bscWallet ? manager.bscWallet.getBalances() : Promise.resolve(null)
		]);

		// Process RSK assets
		if (rskBalanceData) {
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

		// Calculate total sats (RBTC to sats)
		const totalSats = Math.floor(totalRbtc * 100_000_000);

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
 * Load transactions
 */
async function loadTransactions(): Promise<void> {
	try {
		const manager = getWalletManager();
		const state = get(walletStore);

		// Get current balance for running balance calculation
		const currentBalanceSats = state.totalBalances.sats;

		// Load and process transactions (everything computed in single pass)
		const [rskTxs, bscTxs] = await Promise.all([
			manager.rskWallet ? manager.rskWallet.loadTransactions() : Promise.resolve([]),
			manager.bscWallet ? manager.bscWallet.loadTransactions() : Promise.resolve([])
		]);

		// Process both networks in parallel with all properties computed
		const [processedRskTxs, processedBscTxs] = await Promise.all([
			processTransactions(rskTxs, state.rsk.address || '', 'rsk', currentBalanceSats),
			processTransactions(bscTxs, state.bsc.address || '', 'bsc', currentBalanceSats)
		]);

		// Combine and sort by timestamp (newest first)
		const allTransactions = [...processedRskTxs, ...processedBscTxs].sort(
			(a, b) => new Date(b.timestamp)?.getTime() - new Date(a.timestamp)?.getTime()
		);

		walletStore.update((s) => ({ ...s, transactions: allTransactions }));
	} catch (error) {
		console.error('Failed to load transactions:', error);
	}
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
	cleanup: disconnectWallet,
	getRSKAddress,
	setActiveTab,
	loadAssets,
	loadTransactions,
	loadRbtcExchangeRate,
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
	getCachedSubmarineSwapPairs,
	getCachedReverseSwapPairs,
	getCachedChainSwapPairs,
	clearSwapPairsCache,
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
