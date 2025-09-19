import type {
	GetInfoResponse,
	Rate,
	Payment,
	SdkEvent,
	PrepareSendResponse
} from '@breeztech/breez-sdk-liquid/web';
import { writable, derived } from 'svelte/store';
import {
	connectToBreez,
	disconnect,
	getWalletInfo,
	getAssetBalances,
	fetchFiatRates,
	fetchLightningLimits,
	fetchOnchainLimits,
	isConnectedStore,
	getTransactions,
	paymentEventsStore,
	pendingPaymentsStore
} from '$lib/wallet/breez/walletService';
import { decryptWalletMnemonicWithBiometrics } from '$lib/utils/helpers/auth';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import {
	getAssetMetadata,
	getCurrentNetwork,
	getAssetId,
	type AssetMetadata as IAssetMetadata
} from '$lib/constants/assets';
import { checkBiometricAvailability, getBiometricData } from '$lib/utils/helpers/biometrics';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';

// Enhanced asset with balance information
export interface EnhancedAsset extends IAssetMetadata {
	balance: number;
	usdValue: number;
	formattedBalance: string;
	network: 'Liquid' | 'Bitcoin';
}

// Core wallet state using traditional stores
export const walletConnection = writable({
	isConnecting: false,
	isConnected: false,
	errorMessage: null as string | null
});

export const walletInfo = writable<GetInfoResponse | null>(null);

export const walletAssets = writable({
	assets: [] as EnhancedAsset[],
	selectedAsset: 'L-BTC',
	totalUsdValue: 0,
	totalSatsBalance: 0,
	totalUsdtBalance: 0
});

export const bitcoinBalance = writable<WalletBalance>({
	confirmed: 0,
	unconfirmed: 0,
	total: 0
});

export const walletRates = writable({
	fiatRates: [] as Rate[],
	lightningLimits: null as any,
	onchainLimits: null as any
});

export const walletTransactions = writable({
	pendingPayments: [] as Payment[],
	recentTransactions: [] as Payment[],
	paymentEvents: [] as SdkEvent[]
});

export const walletUI = writable({
	activeTab: 'balance' as 'balance' | 'receive' | 'send' | 'swaps' | 'transactions'
});

export const sendForm = writable({
	amount: '',
	recipient: '',
	description: '',
	feeRate: 'medium' as 'slow' | 'medium' | 'fast',
	useMainUnit: false,
	fiatCurrency: 'USD',
	preparedTransaction: null as PrepareSendResponse | null,
	isLoading: false,
	estimatedFees: 0,
	validationError: null as string | null
});

export interface WalletBalance {
	confirmed: number;
	unconfirmed: number;
	total: number;
}

const currentNetwork = getCurrentNetwork();

// Auto-refresh intervals
let balanceRefreshInterval: NodeJS.Timeout | null = null;
let ratesRefreshInterval: NodeJS.Timeout | null = null;

// Helper functions
function formatBalance(value: number, precision: number): string {
	return value.toFixed(precision).replace(/\.?0+$/, '');
}

function createEnhancedAsset(
	metadata: IAssetMetadata,
	balance: number,
	usdValue: number,
	network: 'Liquid' | 'Bitcoin'
): EnhancedAsset {
	const balanceInUnit = balance / Math.pow(10, metadata.precision);
	return {
		...metadata,
		balance,
		usdValue,
		formattedBalance: formatBalance(balanceInUnit, metadata.precision),
		network
	};
}

function createBitcoinAsset(bitcoinBalance: WalletBalance, btcUsdRate: number): EnhancedAsset {
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
}

function calculateTotals(assets: EnhancedAsset[]) {
	return {
		totalUsdValue: assets.reduce((total, asset) => total + asset.usdValue, 0),
		totalSatsBalance: assets
			.filter((asset) => ['BTC', 'L-BTC'].includes(asset.ticker))
			.reduce((total, asset) => total + asset.balance, 0),
		totalUsdtBalance: assets
			.filter((asset) => ['USDT', 'USDt'].includes(asset.ticker))
			.reduce((total, asset) => total + asset.balance / Math.pow(10, asset.precision), 0)
	};
}

// Initialize wallet connection
async function initialize(): Promise<void> {
	try {
		walletConnection.update((state) => ({
			...state,
			isConnecting: true,
			errorMessage: null
		}));

		// Check if already connected
		if (get(isConnectedStore)) {
			walletConnection.update((state) => ({
				...state,
				isConnected: true,
				isConnecting: false
			}));
			await loadWalletData();
			return;
		}

		const mnemonic = await getMnemonic();

		await connectToBreez(mnemonic);

		// Load initial data
		await loadWalletData();

		// Set up periodic refresh
		setupPeriodicRefresh();

		walletConnection.update((state) => ({
			...state,
			isConnected: true,
			isConnecting: false,
			errorMessage: null
		}));
	} catch (error) {
		console.error('Failed to initialize wallet:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		walletConnection.update((state) => ({
			...state,
			isConnecting: false,
			isConnected: false,
			errorMessage
		}));
		throw error;
	}
}

// Load all wallet data
async function loadWalletData(): Promise<void> {
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
}

// Load wallet info
async function loadWalletInfo(): Promise<void> {
	try {
		const info = await getWalletInfo();
		walletInfo.set(info);
	} catch (error) {
		console.error('Failed to load wallet info:', error);
	}
}

// Load and process assets
export async function loadAssets(): Promise<void> {
	try {
		// Parallel API calls for better performance
		const [fiatRatesResult, walletInfoResult, liquidAssetsResult] = await Promise.allSettled([
			fetchFiatRates(),
			getWalletInfo(),
			getAssetBalances()
		]);

		// Extract results with fallbacks
		const fiatRates = fiatRatesResult.status === 'fulfilled' ? fiatRatesResult.value : [];
		const info = walletInfoResult.status === 'fulfilled' ? walletInfoResult.value : null;
		const liquidAssets = liquidAssetsResult.status === 'fulfilled' ? liquidAssetsResult.value : [];

		// Bitcoin balance is now handled entirely by Breez SDK - set to zero for compatibility
		const btcBalance = { confirmed: 0, unconfirmed: 0, total: 0 };
		bitcoinBalance.set(btcBalance);

		// Exchange rates with fallbacks
		const btcUsdRate = fiatRates.find((rate) => rate.coin === 'BTC')?.value || 0;
		const usdtRate = 1; // USDT is pegged to USD

		const processedAssets: EnhancedAsset[] = [];

		// Core assets configuration
		const coreAssets = [
			{
				type: 'LBTC' as const,
				getBalance: () => info?.walletInfo?.balanceSat || 0,
				getUsdValue: (balance: number) => (balance / 100_000_000) * btcUsdRate
			},
			{
				type: 'USDT' as const,
				getBalance: () => liquidAssets.find((a) => a.assetId === getAssetId('USDT'))?.balance || 0,
				getUsdValue: (balance: number, precision: number) =>
					(balance / Math.pow(10, precision)) * usdtRate
			}
		];

		// Process core Liquid assets - always add them even with zero balance
		for (const coreAsset of coreAssets) {
			const metadata = getAssetMetadata(currentNetwork, getAssetId(coreAsset.type));
			if (metadata) {
				const balance = coreAsset.getBalance();
				const usdValue = coreAsset.getUsdValue(balance, metadata.precision);
				const asset = createEnhancedAsset(metadata, balance, usdValue, 'Liquid');
				processedAssets.push(asset);
			} else {
				console.warn(`No metadata found for core asset: ${coreAsset.type}`);
			}
		}

		// Add Bitcoin - always add it even with zero balance
		const bitcoinAsset = createBitcoinAsset(btcBalance, btcUsdRate);
		processedAssets.push(bitcoinAsset);

		// Add other Liquid assets (non-core)
		for (const asset of liquidAssets) {
			if (
				asset.balance > 0 &&
				asset.assetId !== getAssetId('LBTC') &&
				asset.assetId !== getAssetId('USDT')
			) {
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

		// Calculate totals and update state
		const totals = calculateTotals(processedAssets);

		walletAssets.update((state) => ({
			...state,
			assets: processedAssets,
			...totals
		}));
		walletConnection.update((state) => ({ ...state, errorMessage: null }));
	} catch (error) {
		console.error('Failed to load assets:', error);
		walletConnection.update((state) => ({
			...state,
			errorMessage: 'Some wallet data could not be loaded. Showing cached data.'
		}));
	}
}

// Load fiat rates
async function loadFiatRates(): Promise<void> {
	try {
		const rates = await fetchFiatRates();
		walletRates.update((state) => ({ ...state, fiatRates: rates }));
	} catch (error) {
		console.error('Failed to load fiat rates:', error);
	}
}

// Load limits
async function loadLimits(): Promise<void> {
	try {
		const [lightningLimits, onchainLimits] = await Promise.all([
			fetchLightningLimits(),
			fetchOnchainLimits()
		]);

		walletRates.update((state) => ({
			...state,
			lightningLimits,
			onchainLimits
		}));
	} catch (error) {
		console.error('Failed to load limits:', error);
	}
}

// Load transactions
async function loadTransactions(): Promise<void> {
	try {
		const recentTransactions = await getTransactions();
		walletTransactions.update((state) => ({
			...state,
			recentTransactions
		}));
	} catch (error) {
		console.error('Failed to load transactions:', error);
	}
}

// Setup periodic refresh
function setupPeriodicRefresh(): void {
	// Refresh balances every 30 seconds
	balanceRefreshInterval = setInterval(loadAssets, 30000);

	// Refresh rates every 5 minutes
	ratesRefreshInterval = setInterval(loadFiatRates, 300000);
}

// Cleanup intervals
export async function cleanup(): Promise<void> {
	if (balanceRefreshInterval) {
		clearInterval(balanceRefreshInterval);
		balanceRefreshInterval = null;
	}
	if (ratesRefreshInterval) {
		clearInterval(ratesRefreshInterval);
		ratesRefreshInterval = null;
	}
}

// Disconnect wallet
export async function disconnectWallet(): Promise<void> {
	try {
		await cleanup();
		await disconnect();

		// Reset all stores to initial state
		walletConnection.set({
			isConnecting: false,
			isConnected: false,
			errorMessage: null
		});

		walletInfo.set(null);

		walletAssets.set({
			assets: [],
			selectedAsset: 'L-BTC',
			totalUsdValue: 0,
			totalSatsBalance: 0,
			totalUsdtBalance: 0
		});

		bitcoinBalance.set({ confirmed: 0, unconfirmed: 0, total: 0 });

		walletRates.set({
			fiatRates: [],
			lightningLimits: null,
			onchainLimits: null
		});

		walletTransactions.set({
			pendingPayments: [],
			recentTransactions: [],
			paymentEvents: []
		});

		walletUI.set({
			activeTab: 'balance'
		});

		sendForm.set({
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
		});
	} catch (error) {
		console.error('Error during wallet cleanup:', error);
	}
}

// UI actions
export function setActiveTab(tab: 'balance' | 'receive' | 'send' | 'swaps' | 'transactions'): void {
	walletUI.update((state) => ({ ...state, activeTab: tab }));
}

export function setSelectedAsset(assetId: string): void {
	walletAssets.update((state) => ({ ...state, selectedAsset: assetId }));
}

// Send form actions
export function updateSendForm(
	updates: Partial<{
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
	}>
): void {
	sendForm.update((state) => ({ ...state, ...updates }));
}

export function resetSendForm(): void {
	sendForm.set({
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
	});
}

// Get selected asset data
export function getSelectedAssetData(): EnhancedAsset | undefined {
	const assets = get(walletAssets);
	return assets.assets.find(
		(asset) => asset.ticker === assets.selectedAsset || asset.assetId === assets.selectedAsset
	);
}

// Format currency values
export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 0
	}).format(sats);
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', {
		style: 'currency',
		currency: 'USD',
		minimumFractionDigits: 2,
		maximumFractionDigits: 2
	}).format(amount);
}

export function formatNumber(value: number): string {
	return parseFloat(value.toFixed(8)).toString();
}

export function formatNumberWithTwoDecimals(number: number): string {
	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	}).format(number);
}

// Subscribe to external stores and sync with our wallet stores
export function syncExternalStores(): void {
	// Subscribe to payment events
	paymentEventsStore.subscribe((events) => {
		walletTransactions.update((state) => ({ ...state, paymentEvents: events }));
	});

	// Subscribe to pending payments
	pendingPaymentsStore.subscribe((payments) => {
		walletTransactions.update((state) => ({ ...state, pendingPayments: payments }));
	});

	// Subscribe to connection status
	isConnectedStore.subscribe((connected) => {
		walletConnection.update((state) => ({ ...state, isConnected: connected }));
	});
}

// Derived values for easy access using traditional derived stores
export const selectedAsset = derived(walletAssets, ($walletAssets) =>
	$walletAssets.assets.find(
		(asset) =>
			asset.ticker === $walletAssets.selectedAsset || asset.assetId === $walletAssets.selectedAsset
	)
);

export const walletBalance = derived(walletAssets, ($walletAssets) => ({
	totalSats: $walletAssets.totalSatsBalance,
	totalUsd: $walletAssets.totalUsdValue,
	totalUsdt: $walletAssets.totalUsdtBalance
}));

// Legacy exports for backward compatibility
export const walletStore = {
	initialize,
	disconnectWallet,
	loadAssets,
	loadFiatRates,
	loadTransactions: loadTransactions,
	cleanup,
	setActiveTab,
	setSelectedAsset,
	updateSendForm,
	resetSendForm,
	getSelectedAssetData,
	formatSats,
	formatUsd,
	formatNumber,
	refresh: loadWalletData,
	refreshAssets: loadAssets,
	refreshRates: loadFiatRates,
	refreshTransactions: loadTransactions
};
