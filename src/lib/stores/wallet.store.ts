/**
 * Unified Wallet Store
 * 
 * This store combines both Breez (Liquid) and RSK wallet functionality
 * into a single, centralized implementation without importing from the separate stores.
 */

import { writable, derived, get } from 'svelte/store';
import { ethers } from 'ethers';
import type {
	GetInfoResponse,
	Rate,
	Payment
} from '@breeztech/breez-sdk-liquid/web';
import type { RSKTransaction, EscrowData } from '$lib/types/wallet';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { RSK_NETWORKS, type RSKNetwork } from '$lib/utils/wallet/escrowContract';
import {
	getAssetMetadata,
	getCurrentNetwork,
	getAssetId,
	type AssetMetadata as IAssetMetadata
} from '$lib/utils/constants/assets';
// Import Breez SDK functions directly
import {
	connectToBreez,
	disconnect,
	getWalletInfo,
	fetchFiatRates,
	isConnectedStore,
	getTransactions
} from '$lib/wallet/breez/walletService';
import cryptoPriceService from '$lib/api/services/crypto-price.service';

// Wallet asset interface
export interface WalletAsset extends IAssetMetadata {
	balance: number;
	usdValue: number;
	formattedBalance: string;
	network: 'Liquid' | 'Bitcoin' | 'RSK';
}

// Combined wallet state
export interface CombinedWalletState {
	// Connection status
	isInitializing: boolean;
	isConnected: boolean;
	isConnecting: boolean;
	hasAnyConnection: boolean;
	error: string | null;

	// Network states
	liquid: {
		connected: boolean;
		connecting: boolean;
		error: string | null;
		walletInfo: GetInfoResponse | null;
	};

	rsk: {
		connected: boolean;
		connecting: boolean;
		error: string | null;
		address: string | null;
		balance: string;
		formattedBalance: string;
		blockNumber: number | null;
		provider: ethers.JsonRpcProvider | null;
		wallet: ethers.Wallet | null;
		contractAddress?: string;
		contractConnected?: boolean;
		escrows?: EscrowData[];
	};

	// Combined data
	assets: WalletAsset[];
	transactions: (Payment | RSKTransaction)[];
	fiatRates: Rate[];
	totalBalances: {
		usd: number;
		sats: number;
		rbtc: number;
	};

	// Exchange rates
	rbtcToBtcRate: number;
	rbtcRateError: boolean;

	// UI state
	activeNetwork: 'liquid' | 'rsk';
	activeTab: 'balance' | 'send' | 'receive' | 'transactions';
	selectedAsset: string;
}

// Initial state
const initialState: CombinedWalletState = {
	isInitializing: false,
	isConnected: false,
	isConnecting: false,
	hasAnyConnection: false,
	error: null,

	liquid: {
		connected: false,
		connecting: false,
		error: null,
		walletInfo: null
	},

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

	assets: [],
	transactions: [],
	fiatRates: [],
	totalBalances: {
		usd: 0,
		sats: 0,
		rbtc: 0
	},

	rbtcToBtcRate: 1.0, // Default 1:1 when no rate available
	rbtcRateError: false,

	activeNetwork: 'liquid',
	activeTab: 'balance',
	selectedAsset: 'L-BTC'
};

// Create the wallet store
export const walletStore = writable(initialState);

// Internal state for event listeners
let eventListeners: (() => void)[] = [];
let refreshIntervals: NodeJS.Timeout[] = [];

// Helper functions (simplified implementations)
async function loadAllData(): Promise<void> {
	try {
		await Promise.allSettled([
			loadAssets(),
			loadFiatRates(),
			loadRbtcExchangeRate()
		]);
	} catch (error) {
		console.error('Failed to load wallet data:', error);
	}
}

function setupRSKEventListeners(provider: ethers.JsonRpcProvider, wallet: ethers.Wallet): void {
	// Listen for new blocks
	const blockListener = (blockNumber: number) => {
		walletStore.update(state => ({
			...state,
			rsk: { ...state.rsk, blockNumber }
		}));
	};

	provider.on('block', blockListener);
	eventListeners.push(() => provider.off('block', blockListener));
}

/**
 * Initialize both Liquid and RSK wallets
 */
export async function initializeWallet(): Promise<void> {
	walletStore.update(state => ({
		...state,
		isInitializing: true,
		isConnecting: true,
		error: null
	}));

	try {
		// Get shared mnemonic
		const mnemonic = await getMnemonic();
		if (!mnemonic) {
			throw new Error('No wallet mnemonic found. Please set up your wallet first.');
		}

		// Initialize both wallets concurrently
		const results = await Promise.allSettled([
			initializeLiquidWallet(mnemonic),
			initializeRSKWallet(mnemonic)
		]);

		// Check results and update state
		const liquidResult = results[0];
		const rskResult = results[1];

		const liquidConnected = liquidResult.status === 'fulfilled';
		const rskConnected = rskResult.status === 'fulfilled';
		const hasAnyConnection = liquidConnected || rskConnected;

		// Collect errors
		const errors: string[] = [];
		if (liquidResult.status === 'rejected') {
			errors.push(`Liquid: ${liquidResult.reason?.message || 'Unknown error'}`);
		}
		if (rskResult.status === 'rejected') {
			errors.push(`RSK: ${rskResult.reason?.message || 'Unknown error'}`);
		}

		walletStore.update(state => ({
			...state,
			isInitializing: false,
			isConnecting: false,
			isConnected: hasAnyConnection,
			hasAnyConnection,
			error: errors.length > 0 && !hasAnyConnection ? errors.join('\n') : null
		}));

		// Load initial data if any wallet connected
		if (hasAnyConnection) {
			await loadAllData();
			await loadTransactions();
		}

	} catch (error) {
		console.error('Failed to initialize wallets:', error);
		walletStore.update(state => ({
			...state,
			isInitializing: false,
			isConnecting: false,
			isConnected: false,
			hasAnyConnection: false,
			error: error instanceof Error ? error.message : 'Failed to initialize wallets'
		}));
		throw error;
	}
}

/**
 * Initialize Liquid wallet (Breez SDK)
 */
async function initializeLiquidWallet(mnemonic: string): Promise<void> {
	try {
		walletStore.update(state => ({
			...state,
			liquid: { ...state.liquid, connecting: true, error: null }
		}));

		// Check if already connected
		if (get(isConnectedStore)) {
			walletStore.update(state => ({
				...state,
				liquid: { ...state.liquid, connected: true, connecting: false }
			}));
			return;
		}

		// Connect to Breez
		await connectToBreez(mnemonic);

		// Get wallet info
		const walletInfo = await getWalletInfo();

		walletStore.update(state => ({
			...state,
			liquid: {
				...state.liquid,
				connected: true,
				connecting: false,
				error: null,
				walletInfo
			}
		}));

	} catch (error) {
		console.error('Liquid wallet initialization failed:', error);
		walletStore.update(state => ({
			...state,
			liquid: {
				...state.liquid,
				connecting: false,
				error: error instanceof Error ? error.message : 'Failed to initialize Liquid wallet'
			}
		}));
		throw error;
	}
}

/**
 * Initialize RSK wallet
 */
async function initializeRSKWallet(mnemonic?: string): Promise<void> {
	try {
		if (!mnemonic) {
			mnemonic = await getMnemonic();

			if (!mnemonic) {
				throw new Error('No mnemonic found. Please set up your wallet first.');
			}
		}

		walletStore.update(state => ({
			...state,
			rsk: { ...state.rsk, connecting: true, error: null }
		}));

		// Get network config
		const network: RSKNetwork = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const networkConfig = RSK_NETWORKS[network];

		// Create provider
		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

		// Create wallet from mnemonic with RSK derivation path
		const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/137'/0'/0/0");
		const wallet = new ethers.Wallet(hdNode.privateKey, provider);

		// Get initial balance and block number
		const balance = await provider.getBalance(wallet.address);
		const blockNumber = await provider.getBlockNumber();
		const formattedBalance = ethers.formatEther(balance);

		walletStore.update(state => ({
			...state,
			rsk: {
				...state.rsk,
				connected: true,
				connecting: false,
				error: null,
				address: wallet.address,
				balance: balance.toString(),
				formattedBalance: parseFloat(formattedBalance).toFixed(6),
				blockNumber,
				provider,
				wallet
			}
		}));

		// Set up RSK event listeners
		setupRSKEventListeners(provider, wallet);
	} catch (error) {
		console.error('RSK wallet initialization failed:', error);
		walletStore.update(state => ({
			...state,
			rsk: {
				...state.rsk,
				connecting: false,
				error: error instanceof Error ? error.message : 'Failed to initialize RSK wallet'
			}
		}));
		throw error;
	}
}

/**
 * Load RSK transactions using the unified wallet's RSK instance
 */
async function loadRSKTransactions(): Promise<RSKTransaction[]> {
	try {
		const state = get(walletStore);
		if (!state.rsk.connected || !state.rsk.provider || !state.rsk.wallet) {
			return [];
		}

		const transactions: RSKTransaction[] = [];
		const address = state.rsk.wallet.address.toLowerCase();
		const network = import.meta.env.VITE_RSK_NETWORK || 'testnet';

		// Use RSK Explorer API to get transaction history
		const explorerApiUrl = network === 'mainnet'
			? 'https://rootstock.blockscout.com/api'
			: 'https://rootstock-testnet.blockscout.com/api';

		try {
			// Fetch transactions from RSK Explorer API
			const response = await fetch(
				`${explorerApiUrl}/v2/addresses/${address}/transactions`
			);

			if (!response.ok) {
				throw new Error(`API responded with status: ${response.status}`);
			}

			const data = await response.json();

			if (data.items && Array.isArray(data.items)) {
				for (const tx of data.items.slice(0, 50)) { // Limit to 50 most recent
					const transaction: RSKTransaction = {
						hash: tx.hash,
						from: tx.from.hash,
						to: tx.to?.hash || '0x0000000000000000000000000000000000000000',
						value: tx.value || '0',
						gasUsed: tx.gas_used?.toString() || '0',
						gasPrice: tx.gas_price?.toString() || '0',
						blockNumber: parseInt(tx.block_number) || 0,
						timestamp: new Date(tx.timestamp).getTime(),
						status: tx.status === 'ok' ? 'confirmed' : 'failed',
						type: tx.from.hash.toLowerCase() === address ? 'send' : 'receive'
					};

					transactions.push(transaction);
				}
			}

		} catch (apiError) {
			console.error('Failed to fetch from explorer API:', apiError);

			// Try alternative API endpoint format
			try {
				const altResponse = await fetch(
					`${explorerApiUrl}/v2/addresses/${address}/transactions?type=all`
				);

				if (altResponse.ok) {
					const altData = await altResponse.json();

					if (altData.items && Array.isArray(altData.items)) {
						for (const tx of altData.items.slice(0, 50)) {
							const transaction: RSKTransaction = {
								hash: tx.hash,
								from: tx.from?.hash || tx.from,
								to: tx.to?.hash || tx.to || '0x0000000000000000000000000000000000000000',
								value: tx.value || '0',
								gasUsed: tx.gas_used?.toString() || '0',
								gasPrice: tx.gas_price?.toString() || '0',
								blockNumber: parseInt(tx.block_number) || 0,
								timestamp: new Date(tx.timestamp).getTime(),
								status: tx.status === 'ok' ? 'confirmed' : 'failed',
								type: (tx.from?.hash || tx.from)?.toLowerCase() === address ? 'send' : 'receive'
							};

							transactions.push(transaction);
						}
					}
				}
			} catch (altError) {
				console.error('Alternative API also failed:', altError);

				// Try v1 API as final fallback
				try {
					const v1Response = await fetch(
						`${explorerApiUrl}?module=account&action=txlist&address=${address}&startblock=0&endblock=99999999&sort=desc`
					);

					if (v1Response.ok) {
						const v1Data = await v1Response.json();

						if (v1Data.result && Array.isArray(v1Data.result)) {
							for (const tx of v1Data.result.slice(0, 50)) {
								const transaction: RSKTransaction = {
									hash: tx.hash,
									from: tx.from,
									to: tx.to || '0x0000000000000000000000000000000000000000',
									value: tx.value || '0',
									gasUsed: tx.gasUsed?.toString() || '0',
									gasPrice: tx.gasPrice?.toString() || '0',
									blockNumber: parseInt(tx.blockNumber) || 0,
									timestamp: parseInt(tx.timeStamp) * 1000, // Convert to milliseconds
									status: tx.isError === '0' ? 'confirmed' : 'failed',
									type: tx.from.toLowerCase() === address ? 'send' : 'receive'
								};

								transactions.push(transaction);
							}
						}
					}
				} catch (v1Error) {
					console.error('V1 API also failed:', v1Error);

					// Final fallback: Check transaction count
					const txCount = await state.rsk.provider.getTransactionCount(state.rsk.wallet.address);

					if (txCount > 0) {
						console.warn(`Address has ${txCount} transactions, but all APIs are unavailable`);
					}
				}
			}
		}

		return transactions;
	} catch (error) {
		console.error('Failed to load RSK transactions:', error);
		return [];
	}
}

/**
 * Load Liquid transactions using the Breez SDK
 */
async function loadLiquidTransactions(): Promise<Payment[]> {
	try {
		const state = get(walletStore);
		if (!state.liquid.connected) {
			return [];
		}

		const liquidTransactions = await getTransactions();
		return liquidTransactions || [];
	} catch (error) {
		console.error('Failed to load Liquid transactions:', error);
		return [];
	}
}

/**
 * Load transactions from both networks
 */
export async function loadTransactions(): Promise<void> {
	try {
		const allTransactions: (Payment | RSKTransaction)[] = [];

		// Load transactions from both networks in parallel
		const [liquidTxs, rskTxs] = await Promise.allSettled([
			loadLiquidTransactions(),
			loadRSKTransactions()
		]);

		// Process Liquid transactions
		if (liquidTxs.status === 'fulfilled' && liquidTxs.value.length > 0) {
			allTransactions.push(...liquidTxs.value);
		} else if (liquidTxs.status === 'rejected') {
			console.warn('Failed to load Liquid transactions:', liquidTxs.reason);
		}

		// Process RSK transactions
		if (rskTxs.status === 'fulfilled' && rskTxs.value.length > 0) {
			allTransactions.push(...rskTxs.value);
		} else if (rskTxs.status === 'rejected') {
			console.warn('Failed to load RSK transactions:', rskTxs.reason);
		}

		// Sort by timestamp (newest first)
		const sortedTransactions = allTransactions.sort((a, b) => {
			// For Payment objects, timestamp is in seconds, for RSKTransaction it's in milliseconds
			const aTime = 'paymentType' in a ? a.timestamp * 1000 : a.timestamp;
			const bTime = 'paymentType' in b ? b.timestamp * 1000 : b.timestamp;
			return bTime - aTime;
		});

		walletStore.update(state => ({ ...state, transactions: sortedTransactions }));
	} catch (error) {
		console.error('Failed to load transactions:', error);
	}
}

/**
 * Load and combine assets from both networks
 */
export async function loadAssets(): Promise<void> {
	try {
		const state = get(walletStore);
		const assets: WalletAsset[] = [];

		// Load Liquid assets if connected
		if (state.liquid.connected) {
			try {
				const info = await getWalletInfo();
				const fiatRates = await fetchFiatRates();
				const btcUsdRate = fiatRates.find((rate) => rate.coin === 'BTC')?.value || 0;
				const currentNetwork = getCurrentNetwork();

				// L-BTC asset
				const lbtcBalance = info?.walletInfo?.balanceSat || 0;
				const lbtcMetadata = getAssetMetadata(currentNetwork, getAssetId('LBTC'));
				if (lbtcMetadata) {
					const balanceInBtc = lbtcBalance / 100_000_000;
					assets.push({
						...lbtcMetadata,
						balance: lbtcBalance,
						usdValue: balanceInBtc * btcUsdRate,
						formattedBalance: balanceInBtc.toFixed(8).replace(/\.?0+$/, ''),
						network: 'Liquid'
					});
				}
			} catch (error) {
				console.error('Failed to load Liquid assets:', error);
			}
		}

		// Load RSK assets if connected
		if (state.rsk.connected && state.rsk.provider && state.rsk.wallet) {
			try {
				const balance = await state.rsk.provider.getBalance(state.rsk.wallet.address);
				const rbtcValue = parseFloat(ethers.formatEther(balance));
				const btcPrice = state.fiatRates.find(rate => rate.coin === 'BTC')?.value || 0;

				assets.push({
					assetId: 'rbtc',
					name: 'Rootstock Bitcoin',
					ticker: 'rBTC',
					precision: 18,
					icon: '₿',
					balance: rbtcValue,
					usdValue: rbtcValue * btcPrice,
					formattedBalance: rbtcValue.toFixed(6),
					network: 'RSK'
				});
			} catch (error) {
				console.error('Failed to load RSK assets:', error);
			}
		}

		const totalBalances = {
			usd: assets.reduce((sum, asset) => sum + asset.usdValue, 0),
			sats: assets.filter(a => a.ticker === 'L-BTC').reduce((sum, asset) => sum + asset.balance, 0),
			rbtc: assets.filter(a => a.network === 'RSK').reduce((sum, asset) => sum + asset.balance, 0)
		};

		walletStore.update(state => ({ ...state, assets, totalBalances }));
	} catch (error) {
		console.error('Failed to load assets:', error);
	}
}

/**
 * Load fiat rates
 */
export async function loadFiatRates(): Promise<void> {
	try {
		const rates = await fetchFiatRates();
		walletStore.update(state => ({ ...state, fiatRates: rates }));
	} catch (error) {
		console.error('Failed to load fiat rates:', error);
	}
}

/**
 * Load rBTC to BTC exchange rate
 */
export async function loadRbtcExchangeRate(): Promise<void> {
	try {
		const rate = await cryptoPriceService.getExchangeRate('RBTC', 'BTC');
		walletStore.update(state => ({
			...state,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
	} catch (error) {
		console.error('Failed to load rBTC exchange rate:', error);
		// Set error flag so UI can handle appropriately
		walletStore.update(state => ({
			...state,
			rbtcToBtcRate: 1.0, // Use 1:1 as safe fallback
			rbtcRateError: true
		}));
	}
}

/**
 * Send RSK transaction
 */
export async function sendRBTC(to: string, amount: string): Promise<string> {
	const state = get(walletStore);
	if (!state.rsk.connected || !state.rsk.wallet) {
		throw new Error('RSK wallet not connected');
	}

	try {
		const tx = await state.rsk.wallet.sendTransaction({
			to,
			value: ethers.parseEther(amount)
		});

		// Add to pending transactions in the store
		const pendingTx: RSKTransaction = {
			hash: tx.hash,
			from: state.rsk.wallet.address,
			to,
			value: ethers.parseEther(amount).toString(),
			gasUsed: '0',
			gasPrice: tx.gasPrice?.toString() || '0',
			blockNumber: 0,
			timestamp: Date.now(),
			status: 'pending',
			type: 'send'
		};

		// Add pending transaction to the combined transactions
		walletStore.update(storeState => ({
			...storeState,
			transactions: [pendingTx, ...storeState.transactions]
		}));

		// Wait for confirmation
		const receipt = await tx.wait();

		// Update transaction status
		updateRSKTransactionStatus(tx.hash, receipt);

		// Refresh assets and transactions
		await loadAssets();
		await loadTransactions();

		return tx.hash;

	} catch (error) {
		throw new Error(`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Update RSK transaction status when confirmed
 */
function updateRSKTransactionStatus(hash: string, receipt: ethers.TransactionReceipt | null): void {
	if (!receipt) return;

	walletStore.update(state => {
		// Remove the pending transaction and add the confirmed one
		const updatedTransactions = state.transactions.map(tx => {
			if ('hash' in tx && tx.hash === hash) {
				// Update the RSK transaction
				return {
					...tx,
					gasUsed: receipt.gasUsed.toString(),
					gasPrice: receipt.gasPrice?.toString() || '0',
					blockNumber: receipt.blockNumber,
					timestamp: Date.now(),
					status: receipt.status === 1 ? 'confirmed' : 'failed'
				} as RSKTransaction;
			}
			return tx;
		});

		return {
			...state,
			transactions: updatedTransactions
		};
	});
}

/**
 * UI State Management
 */
export function setActiveNetwork(network: 'liquid' | 'rsk'): void {
	walletStore.update(state => ({ ...state, activeNetwork: network }));
}

export function setActiveTab(tab: 'balance' | 'send' | 'receive' | 'transactions'): void {
	walletStore.update(state => ({ ...state, activeTab: tab }));
}

/**
 * Cleanup
 */
export async function cleanup(): Promise<void> {
	refreshIntervals.forEach(interval => clearInterval(interval));
	eventListeners.forEach(cleanup => cleanup());
	await disconnect();
	walletStore.set(initialState);
}

// Derived stores for easy access
export const liquidConnection = derived(walletStore, $store => $store.liquid);
export const rskConnection = derived(walletStore, $store => $store.rsk);
export const combinedWalletState = derived(walletStore, $store => $store);
export const allAssets = derived(walletStore, $store => $store.assets);
export const totalBalances = derived(walletStore, $store => $store.totalBalances);
export const rbtcToBtcRate = derived(walletStore, $store => $store.rbtcToBtcRate);

/**
 * Utility functions
 */
export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US').format(sats);
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatAddress(address: string | null, startChars: number = 6, endChars: number = 4): string {
	if (!address) return '';
	if (address.length <= startChars + endChars) return address;
	return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}

/**
 * Get RSK wallet instance
 */
export function getRSKWallet(): ethers.Wallet | null {
	const state = get(walletStore);
	return state.rsk.wallet;
}

/**
 * Get RSK provider instance
 */
export function getRSKProvider(): ethers.JsonRpcProvider | null {
	const state = get(walletStore);
	return state.rsk.provider;
}

/**
 * Get RSK address
 */
export const rskAddress = derived(walletStore, $store => $store.rsk.address);

// Main wallet manager
export const walletManager = {
	initialize: initializeWallet,
	initializeRSKWallet,
	cleanup,
	loadAssets,
	loadFiatRates,
	loadRbtcExchangeRate,
	loadTransactions,
	retryRbtcExchangeRate: () => loadRbtcExchangeRate(),
	sendRBTC,
	setActiveNetwork,
	setActiveTab,
	formatSats,
	formatUsd,
	formatAddress,
	getRSKWallet,
	getRSKProvider
};