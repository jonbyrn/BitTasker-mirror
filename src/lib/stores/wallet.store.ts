import type { GetInfoResponse, Rate, Payment, SdkEvent, PrepareSendResponse } from '@breeztech/breez-sdk-liquid/web';
import type { WalletBalance } from '$lib/wallet/bitcoin/types';
import { writable, derived, get } from 'svelte/store';
import { 
	connectToBreez, 
	disconnect, 
	getWalletInfo, 
	getAssetBalances, 
	fetchFiatRates,
	isConnectedStore,
	listPendingPayments,
	pendingPaymentsStore,
	paymentEventsStore
} from '$lib/wallet/breez/walletService';
import { getMnemonicPasskey } from '$lib/wallet/mnemonicBiometrics';
import { createBitcoinWallet } from '$lib/wallet/bitcoin/bitcoinWallet';
import { 
	getAssetMetadata, 
	getCurrentNetwork, 
	getAssetId, 
	type AssetMetadata as IAssetMetadata
} from '$lib/constants/assets';
import { goto } from '$app/navigation';

// Enhanced asset with balance information
export interface EnhancedAsset extends IAssetMetadata {
	balance: number;
	usdValue: number;
	formattedBalance: string;
	network: 'Liquid' | 'Bitcoin';
}

// Wallet state interface
export interface WalletState {
	// Connection status
	isConnecting: boolean;
	isConnected: boolean;
	errorMessage: string | null;
	
	// Wallet info
	walletInfo: GetInfoResponse | null;
	
	// Assets and balances
	assets: EnhancedAsset[];
	selectedAsset: string;
	totalUsdValue: number;
	totalSatsBalance: number;
	totalUsdtBalance: number;
	
	// Bitcoin wallet balance
	bitcoinBalance: WalletBalance;
	
	// Rates and limits
	fiatRates: Rate[];
	lightningLimits: any;
	onchainLimits: any;
	
	// Transactions and payments
	pendingPayments: Payment[];
	recentTransactions: Payment[];
	paymentEvents: SdkEvent[];
	
	// UI state
	activeTab: 'balance' | 'receive' | 'send' | 'swaps' | 'transactions';
	
	// Send form state
	sendForm: {
		amount: string;
		recipient: string;
		description: string;
		feeRate: 'slow' | 'medium' | 'fast';
		useMainUnit: boolean;
		fiatCurrency: string;
		preparedTransaction: PrepareSendResponse | null;
		isLoading: boolean;
		estimatedFees: number;
		validationError: string | null;
	};
}

const initialState: WalletState = {
	// Connection status
	isConnecting: false,
	isConnected: false,
	errorMessage: null,
	
	// Wallet info
	walletInfo: null,
	
	// Assets and balances
	assets: [],
	selectedAsset: 'L-BTC',
	totalUsdValue: 0,
	totalSatsBalance: 0,
	totalUsdtBalance: 0,
	
	// Bitcoin wallet balance
	bitcoinBalance: { confirmed: 0, unconfirmed: 0, total: 0 },
	
	// Rates and limits
	fiatRates: [],
	lightningLimits: null,
	onchainLimits: null,
	
	// Transactions and payments
	pendingPayments: [],
	recentTransactions: [],
	paymentEvents: [],
	
	// UI state
	activeTab: 'balance',
	
	// Send form state
	sendForm: {
		amount: '',
		recipient: '',
		description: '',
		feeRate: 'medium',
		useMainUnit: false,
		fiatCurrency: 'USD',
		preparedTransaction: null,
		isLoading: false,
		estimatedFees: 0,
		validationError: null
	}
};

const createWalletStore = () => {
	const { subscribe, set, update } = writable<WalletState>(initialState);
	
	// Bitcoin wallet instance
	const bitcoinWallet = createBitcoinWallet();
	const currentNetwork = getCurrentNetwork();
	
	// Auto-refresh intervals
	let balanceRefreshInterval: NodeJS.Timeout | null = null;
	let ratesRefreshInterval: NodeJS.Timeout | null = null;
	
	// Initialize wallet connection
	const initialize = async () => {
		try {
			update(state => ({ ...state, isConnecting: true, errorMessage: null }));
			
			// Check if already connected
			if (get(isConnectedStore)) {
				update(state => ({ ...state, isConnected: true, isConnecting: false }));
				await loadWalletData();
				return;
			}
			
			// Get mnemonic and connect
			const mnemonic = await getMnemonicPasskey();
			if (!mnemonic) {
				throw new Error('No mnemonic found');
			}
			
			await connectToBreez(mnemonic);
			
			// Load initial data
			await loadWalletData();
			
			// Set up periodic refresh
			setupPeriodicRefresh();
			
			update(state => ({ 
				...state, 
				isConnected: true, 
				isConnecting: false,
				errorMessage: null 
			}));
			
		} catch (error) {
			console.error('Failed to initialize wallet:', error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
			update(state => ({ 
				...state, 
				isConnecting: false, 
				isConnected: false,
				errorMessage 
			}));
            goto('/dashboard/wallet/error?type=no-mnemonic');
			throw error;
		}
	};
	
	// Load all wallet data
	const loadWalletData = async () => {
		try {
			await Promise.all([
				loadWalletInfo(),
				loadAssets(),
				loadFiatRates(),
				loadLimits(),
				loadTransactions()
			]);
		} catch (error) {
			console.error('Failed to load wallet data:', error);
		}
	};
	
	// Load wallet info
	const loadWalletInfo = async () => {
		try {
			const walletInfo = await getWalletInfo();
			update(state => ({ ...state, walletInfo }));
		} catch (error) {
			console.error('Failed to load wallet info:', error);
		}
	};
	
	// Helper function to safely get Bitcoin balance
	const getBitcoinBalanceSafe = async () => {
		try {
			return bitcoinWallet.getBalance();
		} catch (error) {
			console.warn('Could not load Bitcoin balance:', error);
			return { confirmed: 0, unconfirmed: 0, total: 0 };
		}
	};

	// Helper function to format balance without trailing zeros
	const formatBalance = (value: number, precision: number): string => {
		return value.toFixed(precision).replace(/\.?0+$/, '');
	};

	// Helper function to create enhanced asset
	const createEnhancedAsset = (
		metadata: IAssetMetadata, 
		balance: number, 
		usdValue: number, 
		network: 'Liquid' | 'Bitcoin'
	): EnhancedAsset => {
		const balanceInUnit = balance / Math.pow(10, metadata.precision);
		return {
			...metadata,
			balance,
			usdValue,
			formattedBalance: formatBalance(balanceInUnit, metadata.precision),
			network
		};
	};

	// Helper function to create Bitcoin asset
	const createBitcoinAsset = (bitcoinBalance: WalletBalance, btcUsdRate: number): EnhancedAsset => {
		const balanceInBtc = bitcoinBalance.total / 100_000_000;
		return {
			assetId: 'bitcoin',
			name: 'Bitcoin',
			ticker: 'BTC',
			precision: 8,
			icon: '₿',
			balance: bitcoinBalance.total,
			usdValue: balanceInBtc * btcUsdRate,
			formattedBalance: formatBalance(balanceInBtc, 8),
			network: 'Bitcoin'
		};
	};

	// Helper function to add other liquid assets
	const addOtherLiquidAssets = (liquidAssets: any[], processedAssets: EnhancedAsset[]) => {
		for (const asset of liquidAssets) {
			if (asset.balance > 0 && asset.assetId !== getAssetId('LBTC') && asset.assetId !== getAssetId('USDT')) {
				const metadata = getAssetMetadata(currentNetwork, asset.assetId);
				if (metadata) {
					const enhancedAsset = createEnhancedAsset(metadata, asset.balance, 0, 'Liquid');
					processedAssets.push(enhancedAsset);
				} else {
					// Handle unknown assets
					const balanceInUnit = asset.balance / 100_000_000;
					processedAssets.push({
						assetId: asset.assetId,
						name: 'Unknown Asset',
						ticker: asset.assetId.substring(0, 8) + '...',
						precision: 8,
						icon: '?',
						balance: asset.balance,
						usdValue: 0,
						formattedBalance: formatBalance(balanceInUnit, 8),
						network: 'Liquid'
					});
				}
			}
		}
	};

	// Helper function to calculate totals
	const calculateTotals = (assets: EnhancedAsset[]) => {
		return {
			totalUsdValue: assets.reduce((total, asset) => total + asset.usdValue, 0),
			totalSatsBalance: assets
				.filter(asset => ['BTC', 'L-BTC'].includes(asset.ticker))
				.reduce((total, asset) => total + asset.balance, 0),
			totalUsdtBalance: assets
				.filter(asset => ['USDT', 'USDt'].includes(asset.ticker))
				.reduce((total, asset) => total + (asset.balance / Math.pow(10, asset.precision)), 0)
		};
	};

	// Helper function to create fallback assets when API calls fail
	const createFallbackAssets = (): EnhancedAsset[] => {
		const fallbackAssets: EnhancedAsset[] = [];
		
		// Add L-BTC fallback
		const lbtcMetadata = getAssetMetadata(currentNetwork, getAssetId('LBTC'));
		if (lbtcMetadata) {
			fallbackAssets.push(createEnhancedAsset(lbtcMetadata, 0, 0, 'Liquid'));
		}
		
		// Add USDt fallback
		const usdtMetadata = getAssetMetadata(currentNetwork, getAssetId('USDT'));
		if (usdtMetadata) {
			fallbackAssets.push(createEnhancedAsset(usdtMetadata, 0, 0, 'Liquid'));
		}
		
		// Add Bitcoin fallback
		fallbackAssets.push({
			assetId: 'bitcoin',
			name: 'Bitcoin',
			ticker: 'BTC',
			precision: 8,
			icon: '₿',
			balance: 0,
			usdValue: 0,
			formattedBalance: '0',
			network: 'Bitcoin'
		});
		
		return fallbackAssets;
	};

	// Load and process assets with improved error handling and performance
	const loadAssets = async () => {
		try {
			// Parallel API calls for better performance
			const [fiatRatesResult, walletInfoResult, liquidAssetsResult, bitcoinBalanceResult] = 
				await Promise.allSettled([
					fetchFiatRates(),
					getWalletInfo(), 
					getAssetBalances(),
					getBitcoinBalanceSafe()
				]);

			// Extract results with fallbacks
			const fiatRates = fiatRatesResult.status === 'fulfilled' ? fiatRatesResult.value : [];
			const walletInfo = walletInfoResult.status === 'fulfilled' ? walletInfoResult.value : null;
			const liquidAssets = liquidAssetsResult.status === 'fulfilled' ? liquidAssetsResult.value : [];
			const bitcoinBalance = bitcoinBalanceResult.status === 'fulfilled' ? bitcoinBalanceResult.value : { confirmed: 0, unconfirmed: 0, total: 0 };

			// Exchange rates with fallbacks
			const btcUsdRate = fiatRates.find(rate => rate.coin === 'BTC')?.value || 0;
			const usdtRate = 1; // USDT is pegged to USD

			const processedAssets: EnhancedAsset[] = [];

			// Core assets configuration
			const coreAssets = [
				{
					type: 'LBTC' as const,
					getBalance: () => walletInfo?.walletInfo?.balanceSat || 0,
					getUsdValue: (balance: number) => (balance / 100_000_000) * btcUsdRate
				},
				{
					type: 'USDT' as const,
					getBalance: () => liquidAssets.find(a => a.assetId === getAssetId('USDT'))?.balance || 0,
					getUsdValue: (balance: number, precision: number) => (balance / Math.pow(10, precision)) * usdtRate
				}
			];

			// Process core Liquid assets
			for (const coreAsset of coreAssets) {
				const metadata = getAssetMetadata(currentNetwork, getAssetId(coreAsset.type));
				if (metadata) {
					const balance = coreAsset.getBalance();
					const usdValue = coreAsset.getUsdValue(balance, metadata.precision);
					const asset = createEnhancedAsset(metadata, balance, usdValue, 'Liquid');
					processedAssets.push(asset);
				}
			}

			// Add Bitcoin
			const bitcoinAsset = createBitcoinAsset(bitcoinBalance, btcUsdRate);
			processedAssets.push(bitcoinAsset);

			// Add other Liquid assets (non-core)
			addOtherLiquidAssets(liquidAssets, processedAssets);

			// Calculate totals
			const totals = calculateTotals(processedAssets);

			update(state => ({
				...state,
				assets: processedAssets,
				bitcoinBalance,
				...totals,
				errorMessage: null // Clear any previous errors
			}));

		} catch (error) {
			console.error('Failed to load assets:', error);
			// Don't leave the user with no assets - provide fallback
			const fallbackAssets = createFallbackAssets();
			const fallbackTotals = calculateTotals(fallbackAssets);
			
			update(state => ({
				...state,
				assets: fallbackAssets,
				bitcoinBalance: { confirmed: 0, unconfirmed: 0, total: 0 },
				...fallbackTotals,
				errorMessage: 'Some wallet data could not be loaded. Showing cached data.'
			}));
		}
	};
	
	// Load fiat rates
	const loadFiatRates = async () => {
		try {
			const rates = await fetchFiatRates();
			update(state => ({ ...state, fiatRates: rates }));
		} catch (error) {
			console.error('Failed to load fiat rates:', error);
		}
	};
	
	// Load limits
	const loadLimits = async () => {
		try {
			const { fetchLightningLimits, fetchOnchainLimits } = await import('$lib/wallet/breez/walletService');
			const [lightningLimits, onchainLimits] = await Promise.all([
				fetchLightningLimits(),
				fetchOnchainLimits()
			]);
			
			update(state => ({ 
				...state, 
				lightningLimits, 
				onchainLimits 
			}));
		} catch (error) {
			console.error('Failed to load limits:', error);
		}
	};
	
	// Load transactions
	const loadTransactions = async () => {
		try {
			const { getTransactions } = await import('$lib/wallet/breez/walletService');
			const recentTransactions = await getTransactions();
			const pendingPayments = await listPendingPayments();
			
			update(state => ({ 
				...state, 
				recentTransactions, 
				pendingPayments 
			}));
		} catch (error) {
			console.error('Failed to load transactions:', error);
		}
	};
	
	// Setup periodic refresh
	const setupPeriodicRefresh = () => {
		// Refresh balances every 30 seconds
		balanceRefreshInterval = setInterval(loadAssets, 30000);
		
		// Refresh rates every 5 minutes
		ratesRefreshInterval = setInterval(loadFiatRates, 300000);
	};
	
	// Cleanup intervals
	const cleanup = async () => {
		if (balanceRefreshInterval) {
			clearInterval(balanceRefreshInterval);
			balanceRefreshInterval = null;
		}
		if (ratesRefreshInterval) {
			clearInterval(ratesRefreshInterval);
			ratesRefreshInterval = null;
		}
	};
	
	// Disconnect wallet
	const disconnectWallet = async () => {
		try {
			cleanup();
			if (get(isConnectedStore)) {
				await disconnect();
			}
			update(state => ({ 
				...initialState, 
				isConnected: false 
			}));
		} catch (error) {
			console.error('Error during wallet cleanup:', error);
		}
	};
	
	// UI actions
	const setActiveTab = (tab: WalletState['activeTab']) => {
		update(state => ({ ...state, activeTab: tab }));
	};
	
	const setSelectedAsset = (assetId: string) => {
		update(state => ({ ...state, selectedAsset: assetId }));
	};
	
	// Send form actions
	const updateSendForm = (updates: Partial<WalletState['sendForm']>) => {
		update(state => ({
			...state,
			sendForm: { ...state.sendForm, ...updates }
		}));
	};
	
	const resetSendForm = () => {
		update(state => ({
			...state,
			sendForm: { ...initialState.sendForm }
		}));
	};
	
	// Get selected asset data
	const getSelectedAssetData = () => {
		const state = get({ subscribe });
		return state.assets.find(asset => asset.ticker === state.selectedAsset || asset.assetId === state.selectedAsset);
	};
	
	// Format currency values
	const formatSats = (sats: number): string => {
		return new Intl.NumberFormat('en-US', {
			minimumFractionDigits: 0,
			maximumFractionDigits: 0
		}).format(sats);
	};
	
	const formatUsd = (amount: number): string => {
		return new Intl.NumberFormat('en-US', {
			style: 'currency',
			currency: 'USD',
			minimumFractionDigits: 2,
			maximumFractionDigits: 2
		}).format(amount);
	};
	
	const formatNumber = (value: number): string => {
		return parseFloat(value.toFixed(8)).toString();
	};
	
	// Subscribe to external stores
	isConnectedStore.subscribe(connected => {
		update(state => ({ ...state, isConnected: connected }));
	});
	
	pendingPaymentsStore.subscribe(payments => {
		update(state => ({ ...state, pendingPayments: payments }));
	});
	
	paymentEventsStore.subscribe(events => {
		update(state => ({ ...state, paymentEvents: events }));
	});
	
	return {
		subscribe,
		set,
		update,
		
		// Actions
		initialize,
		disconnectWallet,
		loadAssets,
		loadFiatRates,
		loadTransactions,
		cleanup,
		
		// UI actions
		setActiveTab,
		setSelectedAsset,
		
		// Send form actions
		updateSendForm,
		resetSendForm,
		
		// Utilities
		getSelectedAssetData,
		formatSats,
		formatUsd,
		formatNumber,
		
		// Refresh methods
		refresh: loadWalletData,
		refreshAssets: loadAssets,
		refreshRates: loadFiatRates,
		refreshTransactions: loadTransactions
	};
};

export const walletStore = createWalletStore();

// Derived stores for convenient access
export const walletAssets = derived(walletStore, state => state.assets);
export const walletBalance = derived(walletStore, state => ({
	totalSats: state.totalSatsBalance,
	totalUsd: state.totalUsdValue,
	totalUsdt: state.totalUsdtBalance
}));
export const walletConnection = derived(walletStore, state => ({
	isConnecting: state.isConnecting,
	isConnected: state.isConnected,
	errorMessage: state.errorMessage
}));
export const selectedAsset = derived(walletStore, state => 
	state.assets.find(asset => asset.ticker === state.selectedAsset || asset.assetId === state.selectedAsset)
);
