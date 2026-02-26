import type { WalletState, WalletAsset, Transaction, NetworkType } from '@bittasker/wallet-core';
import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';

/**
 * Wallet Test Helpers
 * Factory functions and utilities for creating mock wallet data in tests
 */

/**
 * Create a mock wallet store with optional overrides
 */
export function createMockWalletStore(overrides: Partial<WalletState> = {}): Writable<WalletState> {
	const defaultState: WalletState = {
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
		selectedAsset: 'rBTC',
		...overrides
	};

	return writable(defaultState);
}

/**
 * Create a mock wallet manager
 * This is a simplified mock that can be extended as needed
 */
export function createMockWalletManager(overrides: any = {}) {
	return {
		rskWallet: {
			getAddress: () => '0x1234567890123456789012345678901234567890',
			getBalance: async () => ({
				balance: BigInt('1000000000000000000'), // 1 RBTC
				formatted: '1.00'
			}),
			getWallet: () => null,
			getProvider: () => null,
			disconnect: () => {}
		},
		bscWallet: {
			getAddress: () => '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
			getBalances: async () => ({
				bnb: {
					balance: BigInt('500000000000000000'), // 0.5 BNB
					formatted: '0.50'
				},
				usdt: {
					balance: BigInt('100000000'), // 100 USDT
					formatted: '100.00'
				}
			}),
			getWallet: () => null,
			getProvider: () => null,
			disconnect: () => {}
		},
		initialize: async () => {},
		getSubmarineSwapPairs: async () => ({}),
		getChainSwapPairs: async () => ({}),
		estimateRBTCGas: async () => ({
			gasLimit: '21000',
			gasPrice: '20000000000',
			totalCost: '420000000000000',
			totalCostFormatted: '0.00042'
		}),
		sendRBTC: async () => '0xtxhash123',
		sendBSCUSDT: async () => '0xtxhash456',
		sendBSCBNB: async () => '0xtxhash789',
		...overrides
	};
}

/**
 * Generate mock transaction data
 */
export function generateMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		value: '1000000000000000000', // 1 RBTC in wei
		blockNumber: 12345678,
		blockHash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: Date.now(),
		network: 'rootstock-bitcoin',
		type: 'send',
		status: 'confirmed',
		...overrides
	};
}

/**
 * Generate mock asset data
 */
export function generateMockAsset(overrides: Partial<WalletAsset> = {}): WalletAsset {
	return {
		symbol: 'RBTC',
		name: 'Rootstock Bitcoin',
		balance: '1000000000000000000', // 1 RBTC in wei
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'rootstock-bitcoin',
		decimals: 18,
		...overrides
	};
}

/**
 * Generate mock address for different networks
 */
export function generateMockAddress(network: NetworkType = 'rootstock-bitcoin'): string {
	const addresses: Record<NetworkType, string> = {
		'rootstock-bitcoin': '0x1234567890123456789012345678901234567890',
		'usdt-bsc': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		'lightning-bitcoin': 'lnbc1p0example1234567890abcdef',
		'liquid-bitcoin': 'VJL1example123456789012345678901234567890',
		bitcoin: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
	};
	return addresses[network] || addresses['rootstock-bitcoin'];
}

/**
 * Wait for wallet store update
 * Useful for testing async wallet operations
 */
export async function waitForWalletUpdate(
	store: Writable<WalletState>,
	predicate: (state: WalletState) => boolean,
	timeout: number = 5000
): Promise<WalletState> {
	const startTime = Date.now();

	return new Promise((resolve, reject) => {
		const check = () => {
			const state = get(store);
			if (predicate(state)) {
				resolve(state);
			} else if (Date.now() - startTime > timeout) {
				reject(new Error('Timeout waiting for wallet update'));
			} else {
				setTimeout(check, 100);
			}
		};
		check();
	});
}

/**
 * Create mock Lightning invoice
 */
export function createMockLightningInvoice(amountSats?: number, memo?: string): string {
	// Simplified mock - real invoices require proper BOLT11 encoding
	const amount = amountSats ? amountSats.toString() : '';
	const description = memo || '';
	return `lnbc${amount}p1mockinvoice${description}`;
}

/**
 * Create mock parsed address data
 */
export function createMockParsedAddress(overrides: any = {}) {
	return {
		isValid: true,
		address: '0x1234567890123456789012345678901234567890',
		network: 'rootstock-bitcoin' as const,
		amount: null,
		memo: null,
		...overrides
	};
}
