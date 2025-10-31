/**
 * Unified Wallet Store
 *
 * This store combines both Breez (Liquid) and RSK wallet functionality
 * into a single, centralized implementation without importing from the separate stores.
 */

import type {
	WalletState,
	NetworkType,
	Transaction,
	WalletAsset,
	GasEstimation
} from '$lib/types/wallet';
import { ethers } from 'ethers';
import { tokens } from '$lib/utils/wallet/tokens';
import { writable, derived, get } from 'svelte/store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import {
	RSK_NETWORKS,
	ERC20_ABI,
	getBSCPaymasterConfig,
	getUSDTToken,
	BSC_NETWORKS
} from '$lib/utils/wallet/networkConfig';
import { BSCPaymasterContract } from '$lib/utils/wallet/BSCPaymasterContract';
import { loadRSKTransactions, loadBSCTransactions, updateTransactionStatus } from '$lib/utils/wallet/transactionHistory';
import cryptoPriceService from '$lib/api/services/crypto-price.service';


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
	selectedAsset: 'rBTC'
};

// Create the wallet store
export const walletStore = writable(initialState);

// Internal state for event listeners
const eventListeners: (() => void)[] = [];

// Helper functions (simplified implementations)
async function loadAllData(): Promise<void> {
	try {
		await Promise.allSettled([loadAssets(), loadRbtcExchangeRate()]);
	} catch (error) {
		console.error('Failed to load wallet data:', error);
	}
}

/**
 * Setup event listeners for network providers
 * 
 * Performance Optimizations:
 * - Reuses existing contract instances instead of creating new ones
 * - Throttles balance refreshes to every 10 blocks (~20-30 seconds)
 * - Checks for Transfer events every 5 blocks using queryFilter (one-time queries)
 * - Respects provider.pause()/resume() for page visibility handling
 */
function setupNetworkEventListeners(
	network: 'rsk' | 'bsc',
	provider: ethers.JsonRpcProvider,
	wallet: ethers.Wallet,
	usdtContract?: ethers.Contract | null
): void {
	let blockCount = 0;
	let lastCheckedBlock = 0;

	// Block listener - ethers handles polling internally
	const blockListener = async (blockNumber: number) => {
		try {
			// Update block number in store
			walletStore.update((state) => ({
				...state,
				[network]: { ...state[network], blockNumber }
			}));

			blockCount++;

			// Refresh balance every 10 blocks (~20-30 seconds for most networks)
			if (blockCount % 10 === 0) {
				const balanceChanged = await refreshNetworkBalance(network, provider, wallet, usdtContract);
				// Only reload assets if balance actually changed
				if (balanceChanged) {
					await loadAssets();
				}
			}

			// For ERC20 tokens, check for Transfer events every 5 blocks using queryFilter
			// This avoids persistent RPC filters that expire and cause "filter not found" errors
			if (usdtContract && blockNumber % 5 === 0 && blockNumber > lastCheckedBlock) {
				try {
					const fromBlock = Math.max(lastCheckedBlock > 0 ? lastCheckedBlock : blockNumber - 5, blockNumber - 5);
					const toBlock = blockNumber;

					// Create filters for incoming and outgoing transfers
					const incomingFilter = usdtContract.filters.Transfer(null, wallet.address);
					const outgoingFilter = usdtContract.filters.Transfer(wallet.address, null);

					// Query for events (one-time query, no persistent filter)
					const [incomingEvents, outgoingEvents] = await Promise.all([
						usdtContract.queryFilter(incomingFilter, fromBlock, toBlock),
						usdtContract.queryFilter(outgoingFilter, fromBlock, toBlock)
					]);

					// If any transfers detected, refresh balance and transactions
					if (incomingEvents.length > 0 || outgoingEvents.length > 0) {
						console.log(`[${network}] Transfers detected in blocks ${fromBlock}-${toBlock}, refreshing...`);
						const balanceChanged = await refreshNetworkBalance(network, provider, wallet, usdtContract);
						if (balanceChanged) {
							await loadAssets();
						}
						await loadTransactions();
					}

					lastCheckedBlock = blockNumber;
				} catch (error) {
					// Silently handle query errors - they're not critical
					console.debug(`[${network}] Transfer check failed:`, error);
				}
			}
		} catch (error) {
			console.error(`[${network}] Block listener error:`, error);
		}
	};

	// Subscribe to block events
	provider.on('block', blockListener);
	eventListeners.push(() => provider.off('block', blockListener));
}

/**
 * Refresh balance for a specific network
 * Uses existing contract instances to avoid creating new ones on each refresh
 * Only updates state if balance changed to minimize unnecessary RPC calls
 */
async function refreshNetworkBalance(
	network: 'rsk' | 'bsc',
	provider: ethers.JsonRpcProvider,
	wallet: ethers.Wallet,
	usdtContract?: ethers.Contract | null
): Promise<boolean> {
	try {
		let balanceChanged = false;
		const state = get(walletStore);

		if (network === 'rsk') {
			const balance = await provider.getBalance(wallet.address);
			const balanceStr = balance.toString();

			// Only update if balance actually changed
			if (state.rsk.balance !== balanceStr) {
				const formattedBalance = ethers.formatEther(balance);
				walletStore.update((state) => ({
					...state,
					rsk: {
						...state.rsk,
						balance: balanceStr,
						formattedBalance: parseFloat(formattedBalance).toFixed(6)
					}
				}));
				balanceChanged = true;
			}
		} else if (network === 'bsc') {
			// Get BNB balance
			const bnbBalance = await provider.getBalance(wallet.address);
			const bnbBalanceStr = bnbBalance.toString();

			// Get USDT balance using existing contract
			let usdtBalance = BigInt(0);
			let usdtBalanceStr = '0';

			if (usdtContract) {
				try {
					usdtBalance = await usdtContract.balanceOf(wallet.address);
					usdtBalanceStr = usdtBalance.toString();
				} catch (error) {
					console.debug(`[${network}] Failed to fetch USDT balance:`, error);
				}
			}

			// Only update if balance actually changed
			if (state.bsc.bnbBalance !== bnbBalanceStr || state.bsc.usdtBalance !== usdtBalanceStr) {
				const formattedBnb = ethers.formatEther(bnbBalance);
				const decimals = usdtContract ? await usdtContract.decimals() : 18;
				const formattedUsdt = parseFloat(ethers.formatUnits(usdtBalance, decimals)).toFixed(6);

				walletStore.update((state) => ({
					...state,
					bsc: {
						...state.bsc,
						bnbBalance: bnbBalanceStr,
						formattedBnbBalance: parseFloat(formattedBnb).toFixed(6),
						usdtBalance: usdtBalanceStr,
						formattedUsdtBalance: formattedUsdt
					}
				}));
				balanceChanged = true;
			}
		}

		return balanceChanged;
	} catch (error) {
		console.error(`[${network}] Failed to refresh balance:`, error);
		return false;
	}
}

/**
 * Setup page visibility handling for pausing/resuming providers
 * Pauses ethers providers when the app is in the background to save resources
 */
function setupPageVisibilityHandling(): void {
	if (typeof document === 'undefined') return; // Skip on SSR

	let debounceTimeout: NodeJS.Timeout | null = null;

	const handleVisibilityChange = () => {
		// Debounce to avoid rapid pause/resume on quick tab switches
		if (debounceTimeout) clearTimeout(debounceTimeout);

		debounceTimeout = setTimeout(() => {
			const state = get(walletStore);

			if (document.hidden) {
				// console.log('[Wallet] Page hidden - pausing providers');
				// Pause all providers (true = drop events while paused)
				state.rsk.provider?.pause(true);
				state.bsc.provider?.pause(true);
			} else {
				// console.log('[Wallet] Page visible - resuming providers');
				// Resume providers
				state.rsk.provider?.resume();
				state.bsc.provider?.resume();

				// Immediately refresh data after resume
				Promise.allSettled([
					loadAssets(),
					loadTransactions()
				]).catch(error => {
					console.error('[Wallet] Failed to refresh after resume:', error);
				});
			}
		}, 300); // 300ms debounce
	};

	document.addEventListener('visibilitychange', handleVisibilityChange);

	// Store cleanup function
	eventListeners.push(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		document.removeEventListener('visibilitychange', handleVisibilityChange);
	});
}

/**
 * Initialize RSK and BSC wallets
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
			initializeRSKWallet(mnemonic),
			initializeBSCWallet(mnemonic)
		]);

		// Check results and update state
		const rskResult = results[0];
		const bscResult = results[1];

		const rskConnected = rskResult.status === 'fulfilled';
		const bscConnected = bscResult.status === 'fulfilled';
		const hasAnyConnection = rskConnected || bscConnected;

		// Collect errors
		const errors: string[] = [];
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

			// Setup page visibility handling to pause polling when app is backgrounded
			setupPageVisibilityHandling();
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

		// Set up event listeners using ethers' built-in polling
		setupNetworkEventListeners('rsk', provider, wallet);
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
		const network: Extract<NetworkType, 'mainnet' | 'testnet'> = import.meta.env.VITE_BSC_NETWORK || 'testnet';

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

		// Get initial balances using existing contract
		const bnbBalance = await provider.getBalance(wallet.address);
		const formattedBnb = ethers.formatEther(bnbBalance);

		let usdtBalance = BigInt(0);
		let formattedUsdt = '0.00';
		if (usdtContract) {
			const balance = await usdtContract.balanceOf(wallet.address);
			const decimals = await usdtContract.decimals();
			formattedUsdt = parseFloat(ethers.formatUnits(balance, decimals)).toFixed(6);
			usdtBalance = balance;
		}

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
				bnbBalance: bnbBalance.toString(),
				formattedBnbBalance: parseFloat(formattedBnb).toFixed(6),
				usdtBalance: usdtBalance.toString(),
				formattedUsdtBalance: formattedUsdt
			}
		}));

		// Set up event listeners using ethers' built-in polling
		setupNetworkEventListeners('bsc', provider, wallet, usdtContract);
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

/**
 * Load transactions from both networks (RSK includes swap transactions)
 */
export async function loadTransactions(): Promise<void> {
	try {
		const allTransactions: Transaction[] = [];

		// Load transactions from all networks in parallel
		// Note: RSK transactions now include swap transactions automatically
		const [rskTxs, bscTxs] = await Promise.allSettled([
			loadRSKTransactions(),
			loadBSCTransactions()
		]);

		// Process RSK transactions (includes regular + swap transactions)
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

		// Remove duplicate transactions by hash
		const uniqueTransactions = allTransactions.filter((tx, index, self) =>
			index === self.findIndex(t => t.hash === tx.hash)
		);

		// Sort by timestamp (newest first)
		const sortedTransactions = uniqueTransactions.sort((a, b) => {
			return b.timestamp - a.timestamp;
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

		// Load RSK assets if connected (use cached balance from state)
		if (state.rsk.connected && state.rsk.balance) {
			try {
				const rbtcValue = parseFloat(ethers.formatEther(state.rsk.balance));
				// Get BTC price for USD calculation
				const btcPrice = await cryptoPriceService.getCurrentPrice('BTC');

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
				// USDT asset on BSC
				const usdtBalance = parseFloat(state.bsc.formattedUsdtBalance);
				assets.push({
					assetId: 'usdt-bsc',
					name: 'Tether USD (BSC)',
					ticker: 'USDT',
					precision: 18,
					icon: '/currency-symbols/USDt.svg',
					balance: usdtBalance,
					usdValue: usdtBalance, // USDT is 1:1 with USD
					formattedBalance: usdtBalance.toFixed(2),
					network: 'BSC'
				});
			} catch (error) {
				console.error('Failed to load BSC assets:', error);
			}
		}

		const totalBalances = {
			usd: assets.reduce((sum, asset) => sum + asset.usdValue, 0),
			sats: 0,
			rbtc: assets
				.filter((a) => a.network === 'RSK')
				.reduce((sum, asset) => sum + asset.balance, 0),
			usdt: assets
				.filter((a) => a.network === 'BSC' && a.ticker === 'USDT')
				.reduce((sum, asset) => sum + asset.balance, 0),
			bnb: assets
				.filter((a) => a.network === 'BSC' && a.ticker === 'BNB')
				.reduce((sum, asset) => sum + asset.balance, 0)
		};

		walletStore.update((state) => ({ ...state, assets, totalBalances }));
	} catch (error) {
		console.error('Failed to load assets:', error);
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

export function setActiveTab(tab: 'balance' | 'send' | 'receive' | 'transactions' | 'buy-sell' | 'swap'): void {
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

		// Cleanup existing BSC event listeners
		const state = get(walletStore);
		if (state.bsc.provider) {
			// Remove all event listeners for this provider
			state.bsc.provider.removeAllListeners();
		}

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
 * Cleanup all wallet connections and event listeners
 */
export async function cleanup(): Promise<void> {
	// Remove all event listeners (includes RSK, BSC, and page visibility)
	eventListeners.forEach((cleanup) => cleanup());
	eventListeners.length = 0; // Clear the array

	// Reset store to initial state
	walletStore.set(initialState);
}

// Derived stores for easy access
export const rskConnection = derived(walletStore, ($store) => $store.rsk);
export const bscConnection = derived(walletStore, ($store) => $store.bsc);
export const allAssets = derived(walletStore, ($store) => $store.assets);
export const totalBalances = derived(walletStore, ($store) => $store.totalBalances);
export const rbtcToBtcRate = derived(walletStore, ($store) => $store.rbtcToBtcRate);
export const transactions = derived(walletStore, ($store) => $store.transactions);

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
