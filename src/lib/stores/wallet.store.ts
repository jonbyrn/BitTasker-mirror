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
import type { RSKTransaction } from '$lib/types/wallet';
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
	isConnectedStore
} from '$lib/wallet/breez/walletService';

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
			loadFiatRates()
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
async function initializeRSKWallet(mnemonic: string): Promise<void> {
	try {
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
 * Send RSK transaction
 */
export async function sendRBTC(to: string, amount: string): Promise<string> {
	const state = get(walletStore);
	if (!state.rsk.connected || !state.rsk.wallet) {
		throw new Error('RSK wallet not connected');
	}

	const tx = await state.rsk.wallet.sendTransaction({
		to,
		value: ethers.parseEther(amount)
	});
	await tx.wait();
	await loadAssets();
	return tx.hash;
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

// Main wallet manager
export const walletManager = {
	initialize: initializeWallet,
	cleanup,
	loadAssets,
	loadFiatRates,
	sendRBTC,
	setActiveNetwork,
	setActiveTab,
	formatSats,
	formatUsd,
	formatAddress
};