/**
 * Unified Wallet Store
 *
 * This store combines both Breez (Liquid) and RSK wallet functionality
 * into a single, centralized implementation without importing from the separate stores.
 */

import type { Payment } from '@breeztech/breez-sdk-liquid/web';
import type {
	CombinedWalletState,
	NetworkType,
	Transaction,
	WalletAsset,
	BSCUnit,
	TokenBalance,
	GasEstimation
} from '$lib/types/wallet';
import { writable, derived, get } from 'svelte/store';
import { ethers } from 'ethers';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import {
	RSK_NETWORKS,
	ERC20_ABI,
	getBSCPaymasterConfig,
	getUSDTToken,
	BSC_NETWORKS
} from '$lib/utils/wallet/networkConfig';
import {
	getAssetMetadata,
	getCurrentNetwork,
	getAssetId,
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
// Import BSC Paymaster Contract
import { BSCPaymasterContract } from '$lib/utils/wallet/BSCPaymasterContract';
// Import utility functions
import { tokens } from '$lib/utils/wallet/tokens';
import { loadRSKTransactions, loadBSCTransactions, updateTransactionStatus } from '$lib/utils/wallet/transactionHistory';
import { updateBSCBalances } from '$lib/utils/wallet/balanceManager';


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
	fiatRates: [],
	totalBalances: {
		usd: 0,
		sats: 0,
		rbtc: 0,
		usdt: 0,
		bnb: 0
	},

	rbtcToBtcRate: 1.0, // Default 1:1 when no rate available
	rbtcRateError: false,

	activeNetwork: 'rsk',
	activeTab: 'balance',
	selectedAsset: 'L-BTC'
};

// Create the wallet store
export const walletStore = writable(initialState);

// Internal state for event listeners
const eventListeners: (() => void)[] = [];
const bscEventListeners: (() => void)[] = [];
const refreshIntervals: NodeJS.Timeout[] = [];

// Helper functions (simplified implementations)
async function loadAllData(): Promise<void> {
	try {
		await Promise.allSettled([loadAssets(), loadFiatRates(), loadRbtcExchangeRate()]);
	} catch (error) {
		console.error('Failed to load wallet data:', error);
	}
}

function setupRSKEventListeners(provider: ethers.JsonRpcProvider): void {
	// Listen for new blocks
	const blockListener = (blockNumber: number) => {
		walletStore.update((state) => ({
			...state,
			rsk: { ...state.rsk, blockNumber }
		}));
	}; 
	provider.on('block', blockListener);
    eventListeners.push(() => provider.off('block', blockListener));
	// Poll for block number updates every 15 seconds (instead of using filters)
	/* const blockInterval = setInterval(async () => {
		try {
			const blockNumber = await provider.getBlockNumber();
			walletStore.update((state) => ({
				...state,
				rsk: { ...state.rsk, blockNumber }
			}));
		} catch (error) {
			console.error('Failed to fetch RSK block number:', error);
		}
	}, 15000);

	eventListeners.push(() => clearInterval(blockInterval));

	// Poll for balance updates every 30 seconds
	const balanceInterval = setInterval(async () => {
		try {
			const state = get(walletStore);
			if (state.rsk.wallet && state.rsk.provider) {
				const balance = await state.rsk.provider.getBalance(state.rsk.wallet.address);
				const formattedBalance = ethers.formatEther(balance);
				walletStore.update((s) => ({
					...s,
					rsk: {
						...s.rsk,
						balance: balance.toString(),
						formattedBalance: parseFloat(formattedBalance).toFixed(6)
					}
				}));
			}
		} catch (error) {
			console.error('Failed to update RSK balance:', error);
		}
	}, 30000);

	eventListeners.push(() => clearInterval(balanceInterval));

	// Poll for transaction updates every 20 seconds
	const txInterval = setInterval(async () => {
		try {
			await loadRSKTransactions();
		} catch (error) {
			console.error('Failed to poll RSK transactions:', error);
		}
	}, 20000);

	eventListeners.push(() => clearInterval(txInterval)); */
}

/**
 * Initialize Liquid, RSK, and BSC wallets
 */
export async function initializeWallet(): Promise<void> {
	walletStore.update((state) => ({
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

		// Initialize all wallets concurrently
		const results = await Promise.allSettled([
			initializeLiquidWallet(mnemonic),
			initializeRSKWallet(mnemonic),
			initializeBSCWallet(mnemonic)
		]);

		// Check results and update state
		const liquidResult = results[0];
		const rskResult = results[1];
		const bscResult = results[2];

		const liquidConnected = liquidResult.status === 'fulfilled';
		const rskConnected = rskResult.status === 'fulfilled';
		const bscConnected = bscResult.status === 'fulfilled';
		const hasAnyConnection = liquidConnected || rskConnected || bscConnected;

		// Collect errors
		const errors: string[] = [];
		if (liquidResult.status === 'rejected') {
			errors.push(`Liquid: ${liquidResult.reason?.message || 'Unknown error'}`);
		}
		if (rskResult.status === 'rejected') {
			errors.push(`RSK: ${rskResult.reason?.message || 'Unknown error'}`);
		}
		if (bscResult.status === 'rejected') {
			errors.push(`BSC: ${bscResult.reason?.message || 'Unknown error'}`);
		}

		walletStore.update((state) => ({
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
		walletStore.update((state) => ({
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
		walletStore.update((state) => ({
			...state,
			liquid: { ...state.liquid, connecting: true, error: null }
		}));

		// Check if already connected
		if (get(isConnectedStore)) {
			walletStore.update((state) => ({
				...state,
				liquid: { ...state.liquid, connected: true, connecting: false }
			}));
			return;
		}

		// Connect to Breez
		await connectToBreez(mnemonic);

		// Get wallet info
		const walletInfo = await getWalletInfo();

		walletStore.update((state) => ({
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
		walletStore.update((state) => ({
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

		walletStore.update((state) => ({
			...state,
			rsk: { ...state.rsk, connecting: true, error: null }
		}));

		// Get network config
		const network: NetworkType = import.meta.env.VITE_RSK_NETWORK || 'testnet';
		const networkConfig = RSK_NETWORKS[network];
<<<<<<< HEAD

=======
		
>>>>>>> 1b5a2191 (Refactor profile components for improved layout and responsiveness)
		// Create provider
		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

		// Create wallet from mnemonic with RSK derivation path
		const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/137'/0'/0/0");
		const wallet = new ethers.Wallet(hdNode.privateKey, provider);

		// Test RPC connection first
		try {
			await provider.getBlockNumber();
		} catch (rpcError) {
			throw new Error(
				`RPC connection failed: ${rpcError instanceof Error ? rpcError.message : 'Unknown error'}`
			);
		}

		// Get initial balance and block number
		const balance = await provider.getBalance(wallet.address);
		const blockNumber = await provider.getBlockNumber();
		const formattedBalance = ethers.formatEther(balance);

		walletStore.update((state) => ({
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
		setupRSKEventListeners(provider);
	} catch (error) {
		console.error('RSK wallet initialization failed:', error);
		walletStore.update((state) => ({
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
 * Initialize BSC USDT wallet
 */
async function initializeBSCWallet(mnemonic?: string): Promise<void> {
	try {
		if (!mnemonic) {
			mnemonic = await getMnemonic();

			if (!mnemonic) {
				throw new Error('No mnemonic found. Please set up your wallet first.');
			}
		}

		walletStore.update((state) => ({
			...state,
			bsc: { ...state.bsc, connecting: true, error: null }
		}));

		// Get network from config
		const network: NetworkType = import.meta.env.VITE_BSC_NETWORK || 'testnet';

		// Initialize provider
		const networkConfig = BSC_NETWORKS[network]

		// Create provider
		const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl);

		// Create wallet from mnemonic with BSC derivation path: m/44'/60'/0'/0/0 (Ethereum standard)
		const hdNode = ethers.HDNodeWallet.fromPhrase(mnemonic, undefined, "m/44'/60'/0'/0/0");
		const wallet = new ethers.Wallet(hdNode.privateKey, provider);

		try {
			await provider.getBlockNumber();
		} catch (BscError) {
			throw new Error(`BSC provider connection failed: ${BscError instanceof Error ? BscError.message : 'Unknown error'}`)
		}

		const blockNumber = await provider.getBlockNumber();

		// Initialize USDT contract
		const usdtToken = getUSDTToken(network);
		let usdtContract: ethers.Contract | null = null;
		if (usdtToken) {
			usdtContract = new ethers.Contract(usdtToken.address, ERC20_ABI, wallet);
		}

		// Initialize paymaster contract if available
		const paymasterConfig = getBSCPaymasterConfig(network);
		let paymasterContract: BSCPaymasterContract | null = null;
		if (paymasterConfig.address && paymasterConfig.address !== '0x0000000000000000000000000000000000000000') {
			paymasterContract = new BSCPaymasterContract(
				paymasterConfig.address,
				provider,
				wallet,
				paymasterConfig
			);
			await checkBSCPaymasterConnection(paymasterContract);
		}

		// Get initial data
		await updateBSCBalances();
		await tokens.loadTokenBalances('bsc');
		await loadBSCTransactions();

		walletStore.update((state) => ({
			...state,
			bsc: {
				...state.bsc,
				connected: true,
				connecting: false,
				error: null,
				address: wallet.address,
				provider,
				wallet,
				usdtContract,
				paymasterContract,
				paymasterAddress: paymasterContract ? paymasterConfig.address : null,
				blockNumber,
			}
		}));

		// Set up event listeners
		setupBSCEventListeners(provider);
	} catch (error) {
		console.error('BSC wallet initialization failed:', error);
		walletStore.update((state) => ({
			...state,
			bsc: {
				...state.bsc,
				connecting: false,
				error: error instanceof Error ? error.message : 'Failed to initialize BSC wallet'
			}
		}));
		throw error;
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
 * BSC Helper Functions
 */

// Check BSC paymaster connection and capabilities
async function checkBSCPaymasterConnection(paymasterContract: BSCPaymasterContract): Promise<void> {
	if (!paymasterContract) return;

	try {
		const status = await paymasterContract.getStatus();

		walletStore.update((state) => ({
			...state,
			bsc: {
				...state.bsc,
				paymasterConnected: status.hasDeposit,
				canPayFeesInUsdt: status.canPayInUsdt
			}
		}));

	} catch (error) {
		console.error('Failed to check BSC paymaster connection:', error);
		walletStore.update((state) => ({
			...state,
			bsc: {
				...state.bsc,
				paymasterConnected: false,
				canPayFeesInUsdt: false
			}
		}));
	}
}

// Set up BSC event listeners using polling instead of filters
function setupBSCEventListeners(
	provider: ethers.JsonRpcProvider,
): void {
	// Poll for block number updates every 15 seconds
	const blockInterval = setInterval(async () => {
		try {
			const blockNumber = await provider.getBlockNumber();
			walletStore.update((state) => ({
				...state,
				bsc: {
					...state.bsc,
					blockNumber
				}
			}));
		} catch (error) {
			console.error('Failed to fetch BSC block number:', error);
		}
	}, 30000);

	bscEventListeners.push(() => clearInterval(blockInterval));

	// Set up periodic balance updates every 30 seconds
	const balanceInterval = setInterval(() => {
		updateBSCBalances();
		tokens.loadTokenBalances('bsc');
	}, 30000);

	bscEventListeners.push(() => clearInterval(balanceInterval));

	// Poll for transaction updates every 60 seconds
	const txInterval = setInterval(async () => {
		try {
			await loadBSCTransactions();
		} catch (error) {
			console.error('Failed to poll BSC transactions:', error);
		}
	}, 60000);

	bscEventListeners.push(() => clearInterval(txInterval));
}

// BSC transaction status updates are now handled by transactionHistory utility

/**
 * Load transactions from both networks
 */
export async function loadTransactions(): Promise<void> {
	try {
		const allTransactions: (Payment | Transaction)[] = [];

		// Load transactions from all networks in parallel
		const [liquidTxs, rskTxs, bscTxs] = await Promise.allSettled([
			loadLiquidTransactions(),
			loadRSKTransactions(),
			loadBSCTransactions()
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

		// Process BSC transactions
		if (bscTxs.status === 'fulfilled' && bscTxs.value.length > 0) {
			allTransactions.push(...bscTxs.value);
		} else if (bscTxs.status === 'rejected') {
			console.warn('Failed to load BSC transactions:', bscTxs.reason);
		}

		// Sort by timestamp (newest first)
		const sortedTransactions = allTransactions.sort((a, b) => {
			// For Payment objects, timestamp is in seconds, for Transaction and BSCTransaction it's in milliseconds
			const aTime = 'paymentType' in a ? a.timestamp * 1000 : a.timestamp;
			const bTime = 'paymentType' in b ? b.timestamp * 1000 : b.timestamp;
			return bTime - aTime;
		});

		walletStore.update((state) => ({ ...state, transactions: sortedTransactions }));
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

				// USDT asset
				const usdtAssetId = getAssetId('USDT');
				const usdtMetadata = getAssetMetadata(currentNetwork, usdtAssetId);
				if (usdtMetadata) {
					const usdtBalance =
						info?.walletInfo?.assetBalances?.find((ab) => ab.assetId === usdtAssetId)?.balanceSat ||
						0;
					const balanceInUsdt = usdtBalance / Math.pow(10, usdtMetadata.precision);
					assets.push({
						...usdtMetadata,
						balance: usdtBalance,
						usdValue: balanceInUsdt * (fiatRates.find((rate) => rate.coin === 'USD')?.value || 1),
						formattedBalance: balanceInUsdt.toFixed(2),
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
				const btcPrice = state.fiatRates.find((rate) => rate.coin === 'BTC')?.value || 0;

				assets.push({
					assetId: 'rbtc',
					name: 'Rootstock Bitcoin',
					ticker: 'rBTC',
					precision: 18,
					icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
					balance: rbtcValue,
					usdValue: rbtcValue * btcPrice,
					formattedBalance: rbtcValue.toFixed(6),
					network: 'RSK'
				});
			} catch (error) {
				console.error('Failed to load RSK assets:', error);
			}
		}

		// Load BSC assets if connected
		if (state.bsc.connected) {
			try {
				const usdPrice = state.fiatRates.find((rate) => rate.coin === 'USD')?.value || 1;

				// USDT asset on BSC
				const usdtBalance = parseFloat(state.bsc.formattedUsdtBalance);
				assets.push({
					assetId: 'usdt-bsc',
					name: 'Tether USD (BSC)',
					ticker: 'USDT',
					precision: 18,
					icon: '/currency-symbols/USDt.svg',
					balance: usdtBalance,
					usdValue: usdtBalance * usdPrice,
					formattedBalance: usdtBalance.toFixed(2),
					network: 'BSC'
				});
			} catch (error) {
				console.error('Failed to load BSC assets:', error);
			}
		}

		const totalBalances = {
			usd: assets.reduce((sum, asset) => sum + asset.usdValue, 0),
			sats: assets.filter(a => a.ticker === 'L-BTC').reduce((sum, asset) => sum + asset.balance, 0),
			rbtc: assets.filter(a => a.network === 'RSK').reduce((sum, asset) => sum + asset.balance, 0),
			usdt: assets.filter(a => a.network === 'BSC' && a.ticker === 'USDT').reduce((sum, asset) => sum + asset.balance, 0),
			bnb: 0 // BNB removed from balance calculations
		};

		walletStore.update((state) => ({ ...state, assets, totalBalances }));
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
		walletStore.update((state) => ({ ...state, fiatRates: rates }));
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
		walletStore.update((state) => ({
			...state,
			rbtcToBtcRate: rate,
			rbtcRateError: false
		}));
	} catch (error) {
		console.error('Failed to load rBTC exchange rate:', error);
		// Set error flag so UI can handle appropriately
		walletStore.update((state) => ({
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
		const pendingTx: Transaction = {
			hash: tx.hash,
			from: state.rsk.wallet.address,
			to,
			value: ethers.parseEther(amount).toString(),
			gasUsed: '0',
			gasPrice: tx.gasPrice?.toString() || '0',
			blockNumber: 0,
			timestamp: Date.now(),
			status: 'pending',
			type: 'send',
			network: 'rsk'
		};

		// Add pending transaction to the combined transactions
		walletStore.update((storeState) => ({
			...storeState,
			transactions: [pendingTx, ...storeState.transactions]
		}));

		// Wait for confirmation
		const receipt = await tx.wait();

		// Update transaction status
		updateTransactionStatus('rsk', tx.hash, receipt);

		// Refresh assets and transactions
		await loadAssets();
		await loadTransactions();

		return tx.hash;
	} catch (error) {
		throw new Error(
			`Transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}


/**
 * UI State Management
 */
export function setActiveNetwork(network: 'liquid' | 'rsk' | 'bsc'): void {
	walletStore.update((state) => ({ ...state, activeNetwork: network }));
}

export function setActiveTab(tab: 'balance' | 'send' | 'receive' | 'transactions'): void {
	walletStore.update((state) => ({ ...state, activeTab: tab }));
}

export function setSelectedAsset(asset: string): void {
	walletStore.update((state) => ({ ...state, selectedAsset: asset }));
}

/**
 * Network switching functions
 * To switch networks, update the env variable and reinitialize the wallet
 */
export async function reinitializeBSCWallet(): Promise<void> {
	try {
		const mnemonic = await getMnemonic();
		if (!mnemonic) {
			throw new Error('No mnemonic found. Please set up your wallet first.');
		}

		walletStore.update((state) => ({
			...state,
			bsc: { ...state.bsc, connecting: true, error: null }
		}));

		// Cleanup existing BSC connections
		cleanupBSC();

		// Reinitialize with current env network
		await initializeBSCWallet(mnemonic);

		// Refresh assets and transactions
		await loadAssets();
		await loadTransactions();
	} catch (error) {
		console.error('Failed to reinitialize BSC wallet:', error);
		walletStore.update((state) => ({
			...state,
			bsc: {
				...state.bsc,
				connecting: false,
				error: error instanceof Error ? error.message : 'Failed to reinitialize BSC wallet'
			}
		}));
		throw error;
	}
}

/**
 * Send BSC USDT transaction
 */
export async function sendBSCUSDT(
	to: string,
	amount: string,
	payFeesInUsdt: boolean = false
): Promise<string> {
	const state = get(walletStore);
	if (!state.bsc.connected || !state.bsc.wallet || !state.bsc.usdtContract) {
		throw new Error('BSC wallet or USDT contract not initialized');
	}

	const wallet = state.bsc.wallet;
	const usdtContract = state.bsc.usdtContract;
	const provider = state.bsc.provider;
	const paymasterContract = state.bsc.paymasterContract;

	try {
		// Ensure amount is a string
		const amountStr = String(amount);
		// Get USDT decimals
		const decimals = await usdtContract.decimals();
		const parsedAmount = ethers.parseUnits(amountStr, decimals);

		let tx: ethers.ContractTransactionResponse;

		if (payFeesInUsdt && paymasterContract && state.bsc.canPayFeesInUsdt) {
			// Use EIP-7702 paymaster to pay fees in USDT
			// Estimate gas cost first
			const gasEstimate = await usdtContract.transfer.estimateGas(to, parsedAmount);
			const gasPrice = await provider!.getFeeData();
			const gasCost = gasEstimate * (gasPrice.gasPrice || BigInt(0));

			// Convert gas cost to USDT
			const usdtCost = await paymasterContract.convertUsdtToBnb(gasCost);

			// Pay for transaction with USDT
			const contractInterface = usdtContract.interface;
			const transactionData = contractInterface.encodeFunctionData('transfer', [to, parsedAmount]);
			return await paymasterContract.payForTransactionWithUsdt(transactionData, usdtCost);
		} else {
			// Standard USDT transfer
			tx = await usdtContract.transfer(to, parsedAmount);
		}

		// Add to combined pending transactions
		const pendingTx: Transaction = {
			hash: tx.hash,
			from: wallet.address,
			to,
			value: parsedAmount.toString(),
			gasUsed: '0',
			gasPrice: tx.gasPrice?.toString() || '0',
			blockNumber: 0,
			timestamp: Date.now(),
			status: 'pending',
			type: 'send',
			network: 'bsc',
			tokenSymbol: 'USDT'
		};

		walletStore.update((state) => ({
			...state,
			transactions: [pendingTx, ...state.transactions]
		}));

		// Wait for confirmation
		const receipt = await tx.wait();

		// Update transaction status
		updateTransactionStatus('bsc', tx.hash, receipt);

		// Refresh assets and transactions
		await loadAssets();
		await loadTransactions();

		return tx.hash;

	} catch (error) {
		throw new Error(
			`BSC USDT transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Send BSC BNB transaction
 */
export async function sendBSCBNB(to: string, amount: string): Promise<string> {
	const state = get(walletStore);
	if (!state.bsc.connected || !state.bsc.wallet) {
		throw new Error('BSC wallet not initialized');
	}

	const wallet = state.bsc.wallet;

	try {
		// Ensure amount is a string
		const amountStr = String(amount);
		const tx = await wallet.sendTransaction({
			to,
			value: ethers.parseEther(amountStr)
		});

		// Add to combined pending transactions
		const pendingTx: Transaction = {
			hash: tx.hash,
			from: wallet.address,
			to,
			value: ethers.parseEther(amountStr).toString(),
			gasUsed: '0',
			gasPrice: tx.gasPrice?.toString() || '0',
			blockNumber: 0,
			timestamp: Date.now(),
			status: 'pending',
			type: 'send',
			network: 'bsc'
		};

		walletStore.update((state) => ({
			...state,
			transactions: [pendingTx, ...state.transactions]
		}));

		// Wait for confirmation
		const receipt = await tx.wait();

		// Update transaction status
		updateTransactionStatus('bsc', tx.hash, receipt);

		// Refresh assets and transactions
		await loadAssets();
		await loadTransactions();

		return tx.hash;

	} catch (error) {
		throw new Error(
			`BSC BNB transaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

/**
 * Estimate BSC USDT gas
 */
export async function estimateBSCUSDTGas(
	to: string,
	amount: string,
	payFeesInUsdt: boolean = false
): Promise<GasEstimation> {
	const state = get(walletStore);
	if (!state.bsc.connected || !state.bsc.wallet || !state.bsc.usdtContract || !state.bsc.provider) {
		throw new Error('BSC wallet or contracts not initialized');
	}

	const usdtContract = state.bsc.usdtContract;
	const provider = state.bsc.provider;
	const paymasterContract = state.bsc.paymasterContract;

	try {
		// Ensure amount is a string
		const amountStr = String(amount);
		const decimals = await usdtContract.decimals();
		const parsedAmount = ethers.parseUnits(amountStr, decimals);

		const gasPrice = await provider.getFeeData();
		const gasLimit = await usdtContract.transfer.estimateGas(to, parsedAmount);

		const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

		const result: GasEstimation = {
			gasLimit: gasLimit.toString(),
			gasPrice: gasPrice.gasPrice?.toString() || '0',
			totalCost: totalCost.toString(),
			totalCostFormatted: ethers.formatEther(totalCost)
		};

		// If paying fees in USDT, calculate USDT cost
		if (payFeesInUsdt && paymasterContract && state.bsc.canPayFeesInUsdt) {
			const usdtCost = await paymasterContract.estimateUsdtCost(gasLimit, gasPrice.gasPrice || BigInt(0));
			result.usdtCost = ethers.formatUnits(usdtCost, 18);
		}

		return result;

	} catch (error) {
		throw new Error(`BSC USDT gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * Estimate BSC BNB gas
 */
export async function estimateBSCBNBGas(to: string, amount: string): Promise<GasEstimation> {
	const state = get(walletStore);
	if (!state.bsc.connected || !state.bsc.wallet || !state.bsc.provider) {
		throw new Error('BSC wallet not initialized');
	}

	const wallet = state.bsc.wallet;
	const provider = state.bsc.provider;

	try {
		// Ensure amount is a string
		const amountStr = String(amount);
		const gasPrice = await provider.getFeeData();
		const gasLimit = await wallet.estimateGas({
			to,
			value: ethers.parseEther(amountStr)
		});

		const totalCost = gasLimit * (gasPrice.gasPrice || BigInt(0));

		return {
			gasLimit: gasLimit.toString(),
			gasPrice: gasPrice.gasPrice?.toString() || '0',
			totalCost: totalCost.toString(),
			totalCostFormatted: ethers.formatEther(totalCost)
		};

	} catch (error) {
		throw new Error(`BSC BNB gas estimation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

/**
 * BSC Paymaster management functions
 */
export async function depositToBSCPaymaster(amount: string): Promise<string> {
	const state = get(walletStore);
	if (!state.bsc.paymasterContract) {
		throw new Error('BSC paymaster not initialized');
	}

	try {
		const amountWei = ethers.parseEther(amount);
		return await state.bsc.paymasterContract.deposit(amountWei);
	} catch (error) {
		throw new Error(`Failed to deposit to BSC paymaster: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

export async function withdrawFromBSCPaymaster(amount: string): Promise<string> {
	const state = get(walletStore);
	if (!state.bsc.paymasterContract) {
		throw new Error('BSC paymaster not initialized');
	}

	try {
		const amountWei = ethers.parseEther(amount);
		return await state.bsc.paymasterContract.withdraw(amountWei);
	} catch (error) {
		throw new Error(`Failed to withdraw from BSC paymaster: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

export async function getBSCPaymasterStatus(): Promise<{
	hasDeposit: boolean;
	depositAmount: string;
	canPayInUsdt: boolean;
	usdtPrice: string;
	minDeposit: string;
}> {
	const state = get(walletStore);
	if (!state.bsc.paymasterContract) {
		return {
			hasDeposit: false,
			depositAmount: '0',
			canPayInUsdt: false,
			usdtPrice: '0',
			minDeposit: '0'
		};
	}

	try {
		const status = await state.bsc.paymasterContract.getStatus();
		return {
			hasDeposit: status.hasDeposit,
			depositAmount: ethers.formatEther(status.depositAmount),
			canPayInUsdt: status.canPayInUsdt,
			usdtPrice: ethers.formatEther(status.usdtPrice),
			minDeposit: ethers.formatEther(status.minDeposit)
		};
	} catch (error) {
		console.error('Failed to get BSC paymaster status:', error);
		return {
			hasDeposit: false,
			depositAmount: '0',
			canPayInUsdt: false,
			usdtPrice: '0',
			minDeposit: '0'
		};
	}
}

/**
 * BSC Cleanup function
 */
function cleanupBSC(): void {
	// Remove all BSC event listeners
	bscEventListeners.forEach(cleanup => cleanup());
	bscEventListeners.splice(0, bscEventListeners.length);

	// Reset BSC state
	walletStore.update((state) => ({
		...state,
		bsc: {
			...initialState.bsc
		}
	}));
}

/**
 * Cleanup
 */
export async function cleanup(): Promise<void> {
	refreshIntervals.forEach((interval) => clearInterval(interval));
	eventListeners.forEach((cleanup) => cleanup());
	cleanupBSC();
	await disconnect();
	walletStore.set(initialState);
}

// Derived stores for easy access
export const liquidConnection = derived(walletStore, ($store) => $store.liquid);
export const rskConnection = derived(walletStore, ($store) => $store.rsk);
export const bscConnection = derived(walletStore, ($store) => $store.bsc);
export const combinedWalletState = derived(walletStore, ($store) => $store);
export const allAssets = derived(walletStore, ($store) => $store.assets);
export const totalBalances = derived(walletStore, ($store) => $store.totalBalances);
export const rbtcToBtcRate = derived(walletStore, ($store) => $store.rbtcToBtcRate);

/**
 * Utility functions
 */
export function formatSats(sats: number): string {
	return new Intl.NumberFormat('en-US').format(sats);
}

export function formatUsd(amount: number): string {
	return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatAddress(
	address: string | null,
	startChars: number = 6,
	endChars: number = 4
): string {
	if (!address) return '';
	if (address.length <= startChars + endChars) return address;
	return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
}


export function getWallet(network: 'rsk' | 'bsc'): ethers.Wallet | null {
	const state = get(walletStore);
	return state[network].wallet;
}

export function getProvider(network: 'rsk' | 'bsc'): ethers.JsonRpcProvider | null {
	const state = get(walletStore);
	return state[network].provider;
}

/**
 * Get RSK address
 */
export const rskAddress = derived(walletStore, ($store) => $store.rsk.address);

// Main wallet manager
export const walletManager = {
	// Core wallet functions
	initialize: initializeWallet,
	initializeRSKWallet,
	initializeBSCWallet,
	cleanup,

	// Asset and balance management
	loadAssets,
	loadFiatRates,
	loadRbtcExchangeRate,
	loadTransactions,
	retryRbtcExchangeRate: () => loadRbtcExchangeRate(),

	// Transaction functions
	sendRBTC,
	sendBSCUSDT,
	sendBSCBNB,
	estimateBSCUSDTGas,
	estimateBSCBNBGas,

	// Network management
	reinitializeBSCWallet,
	setActiveNetwork,
	setActiveTab,

	// Utility functions
	formatSats,
	formatUsd,
	formatAddress,

	// Wallet access
	getWallet,
	getProvider,

	// BSC Paymaster functions
	depositToBSCPaymaster,
	withdrawFromBSCPaymaster,
	getBSCPaymasterStatus,

	// Token functions (from utility)
	tokens
};
