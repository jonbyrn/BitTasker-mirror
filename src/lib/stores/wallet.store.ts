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
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NostrSwapStorage } from '$lib/utils/swapAdapter';
import { ethers } from 'ethers';
import cryptoPriceService from '$lib/api/services/crypto-price.service';
import type { EscrowData, DisputeProposal } from '$lib/types/wallet';

// Escrow management state (separate from main wallet state)
interface EscrowState {
	escrows: EscrowData[];
	disputeProposals: DisputeProposal[];
}

const initialEscrowState: EscrowState = {
	escrows: [],
	disputeProposals: []
};

// Create escrow store
export const escrowStore = writable(initialEscrowState);

// Initial state
const initialState: WalletState = {
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
export const walletStore = writable(initialState);

// SDK wallet manager instance
let sdkWalletManager: WalletManager | null = null;
let originalConnectWebSocket: (() => Promise<void>) | null = null;
let boltzConnectionPromise: Promise<void> | null = null;
let boltzIsConnected = false;

// Track initialization state to prevent concurrent initializations
let isInitializing = false;
let initializationPromise: Promise<void> | null = null;

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
	// If already initialized, return immediately
	if (sdkWalletManager?.rskWallet && sdkWalletManager?.bscWallet) {
		return;
	}
	
	// If initialization is in progress, wait for it
	if (isInitializing && initializationPromise) {
		return initializationPromise;
	}
	
	// Start new initialization
	isInitializing = true;
	originalConnectWebSocket = null;
	boltzConnectionPromise = null;
	boltzIsConnected = false;
	initializationPromise = (async () => {
		try {
			walletStore.update(s => ({ ...s, isInitializing: true, isConnecting: true, error: null }));
			
			// Get mnemonic
			const mnemonic = await getMnemonic();
			
			// Get Nostr keys for swap storage
			const { nsec } = await getNostrKeyPair();
			
			// Get network from environment
			const network = (import.meta.env.VITE_RSK_NETWORK || 'testnet') as NetworkType;
			
			// Create Nostr storage adapter for reverse swaps
			const reverseSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-reverse');
			const chainSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-chain');
			const submarineSwapStorage = new NostrSwapStorage(nsec, 'boltz-swap-submarine');
			
			// Initialize wallet manager
			const config: WalletManagerConfig = {
				network,
				mnemonic,
				swapStorages: {
					reverse: reverseSwapStorage,
					chain: chainSwapStorage,
					submarine: submarineSwapStorage
				}
			};
			
			sdkWalletManager = new WalletManager(config);
			
			// Patch Boltz WebSocket connection so it only opens when explicitly requested.
			const walletManagerWithSocket = sdkWalletManager as unknown as { connectWebSocket?: () => Promise<void> };
			originalConnectWebSocket = walletManagerWithSocket.connectWebSocket?.bind(sdkWalletManager) ?? null;
			if (walletManagerWithSocket.connectWebSocket) {
				walletManagerWithSocket.connectWebSocket = async () => Promise.resolve();
			}

			await sdkWalletManager.initialize();
			
			// Update store with wallet info
			const rskWallet = sdkWalletManager.rskWallet;
			const bscWallet = sdkWalletManager.bscWallet;
			
			if (rskWallet && bscWallet) {
				const rskBalanceData = await rskWallet.getBalance();
				const bscBalances = await bscWallet.getBalances();
				
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
				
				// Load additional data
				await Promise.allSettled([
					loadAssets(),
					loadTransactions(),
					loadRbtcExchangeRate()
				]);
			}
		
		} catch (error) {
			console.error('Failed to initialize wallet:', error);
			walletStore.update(s => ({
				...s,
				isInitializing: false,
				isConnecting: false,
				error: error instanceof Error ? error.message : 'Failed to initialize wallet'
			}));
			throw error;
		} finally {
			isInitializing = false;
			initializationPromise = null;
		}
	})();
	
	return initializationPromise;
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
	originalConnectWebSocket = null;
	boltzConnectionPromise = null;
	boltzIsConnected = false;
	
	// Cleanup event listeners
	eventListeners.forEach(cleanup => cleanup());
	eventListeners.length = 0;
	
	walletStore.set(initialState);
}

/**
 * Load assets
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
		
		// Fetch current prices
		let rbtcPrice = 0;
		let bnbPrice = 0;
		
		try {
			[rbtcPrice, bnbPrice] = await Promise.all([
				cryptoPriceService.getCurrentPrice('RBTC').catch(() => 0),
				cryptoPriceService.getCurrentPrice('BNB').catch(() => 0)
			]);
		} catch (error) {
			console.warn('Failed to fetch some prices:', error);
		}
		
		// RSK assets - FETCH FRESH BALANCE FROM BLOCKCHAIN
		if (state.rsk.connected && manager.rskWallet) {
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
		if (state.bsc.connected && manager.bscWallet) {
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
 * Lazily establish Boltz websocket connection (used for swap flows)
 */
async function ensureBoltzConnection(): Promise<void> {
	if (!sdkWalletManager) {
		throw new Error('Wallet not initialized. Call initializeWallet() first.');
	}
	if (boltzIsConnected) {
		return;
	}
	if (!originalConnectWebSocket) {
		// No websocket available (e.g., during tests) - treat as connected
		boltzIsConnected = true;
		return;
	}
	if (!boltzConnectionPromise) {
		boltzConnectionPromise = originalConnectWebSocket()
			.then(() => {
				boltzIsConnected = true;
			})
			.catch((error) => {
				boltzConnectionPromise = null;
				throw error;
			});
	}
	return boltzConnectionPromise;
}

/**
 * Load transactions
 */
async function loadTransactions(): Promise<void> {
	try {
		const manager = getWalletManager();
		const transactions: Transaction[] = [];
		
		// Load RSK transactions
		if (manager.rskWallet) {
			const rskTxs = await manager.rskWallet.loadTransactions();
			transactions.push(...rskTxs.map(tx => ({
				...tx,
				network: 'rsk' as const,
				tokenSymbol: 'RBTC'
			})));
		}
		
		// Load BSC transactions
		if (manager.bscWallet) {
			const bscTxs = await manager.bscWallet.loadTransactions();
			transactions.push(...bscTxs.map(tx => ({
				...tx,
				network: 'bsc' as const
			})));
		}
		
		// Sort by timestamp
		transactions.sort((a, b) => b.timestamp - a.timestamp);
		
		walletStore.update(s => ({ ...s, transactions }));
	} catch (error) {
		console.error('Failed to load transactions:', error);
	}
}

/**
 * Load RBTC exchange rate
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
	await ensureBoltzConnection();
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
	await ensureBoltzConnection();
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
	await ensureBoltzConnection();
	const manager = getWalletManager();
	return await manager.getSwapLimits();
}

/**
 * Create submarine swap (RBTC → Lightning)
 */
export async function createSubmarineSwap(invoice: string): Promise<SubmarineSwapResult> {
	await ensureBoltzConnection();
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
	await ensureBoltzConnection();
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
	await ensureBoltzConnection();
	const manager = getWalletManager();
	return await manager.submarineSwapService.getSwapLimits('RBTC', 'BTC');
}

/**
 * Get submarine swap pairs with fee information
 */
export async function getSubmarineSwapPairs(): Promise<any> {
	await ensureBoltzConnection();
	const manager = getWalletManager();
	return await manager.boltzClient.getSubmarineSwapPairs();
}

/**
 * Get reverse swap pairs with fee information
 */
export async function getReverseSwapPairs(): Promise<any> {
	await ensureBoltzConnection();
	const manager = getWalletManager();
	return await manager.boltzClient.getReverseSwapPairs();
}

/**
 * Get chain swap pairs with fee information
 */
export async function getChainSwapPairs(): Promise<any> {
	await ensureBoltzConnection();
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
export const rskEscrows = derived(escrowStore, $e => $e.escrows);
export const rskDisputeProposals = derived(escrowStore, $e => $e.disputeProposals);

// Wallet manager compatibility object
export const walletManager = {
	initialize: initializeWallet,
	disconnect: disconnectWallet,
	cleanup: disconnectWallet,
	ensureBoltzConnection,
	setActiveTab,
	loadAssets,
	loadTransactions,
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
		ensureBoltzConnection().catch(() => {});
		return getWalletManager().submarineSwapService;
	},
	get reverseSwapService() {
		ensureBoltzConnection().catch(() => {});
		return getWalletManager().reverseSwapService;
	},
	get chainSwapService() {
		ensureBoltzConnection().catch(() => {});
		return getWalletManager().chainSwapService;
	}
};

