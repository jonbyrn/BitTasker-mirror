import type { WalletState, WalletAsset, Transaction } from '@bittasker/wallet-core';
import { writable, get } from 'svelte/store';
import type { Writable } from 'svelte/store';

/**
 * Wallet Test Helpers
 * Factory functions and utilities for creating mock wallet data in tests
 */

/**
 * Create a mock wallet store with optional overrides
 */
export function createMockWalletStore(
	overrides: Partial<WalletState> = {}
): Writable<WalletState> {
	const defaultState: WalletState = {
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
		selectedAsset: 'rBTC',
		...overrides
	} as WalletState;

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
const createMockAddressEntity = (address: string) => ({
	ens_domain_name: null,
	hash: address,
	implementations: [],
	is_contract: false,
	is_scam: false,
	is_verified: true,
	metadata: null,
	name: null,
	private_tags: [],
	proxy_type: null,
	public_tags: [],
	reputation: '',
	watchlist_names: []
});

export function generateMockTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createMockAddressEntity('0x1234567890123456789012345678901234567890'),
		to: createMockAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		value: '1000000000000000000',
		gas_used: '21000',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 12345678,
		block_hash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: String(Date.now()),
		status: 'confirmed',
		nonce: 0,
		position: 0,
		confirmations: 1,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: ['EIP1559'],
		token_transfers: null,
		max_fee_per_gas: '20000000000',
		max_priority_fee_per_gas: '2000000000',
		base_fee_per_gas: '10000000000',
		priority_fee: '2000000000',
		transaction_burnt_fee: null,
		result: '0x1',
		revert_reason: null,
		created_contract: null,
		is_pending_update: false,
		type: 2,
		has_error_in_internal_transactions: false,
		fee: { type: 'EIP1559', value: '420000000000000' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	} as unknown as Transaction;
}

/**
 * Generate mock asset data
 */
export function generateMockAsset(overrides: Partial<WalletAsset> = {}): WalletAsset {
	return {
		assetId: 'rbtc',
		ticker: 'RBTC',
		name: 'Rootstock Bitcoin',
		precision: 18,
		icon: '',
		balance: 1000000000000000000,
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'RSK',
		...overrides
	} as unknown as WalletAsset;
}

/**
 * Generate mock address for different networks
 */
export function generateMockAddress(network: string = 'rootstock-bitcoin'): string {
	const addresses: Record<string, string> = {
		'rootstock-bitcoin': '0x1234567890123456789012345678901234567890',
		'usdt-bsc': '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		'lightning-bitcoin': 'lnbc1p0example1234567890abcdef',
		'liquid-bitcoin': 'VJL1example123456789012345678901234567890',
		'bitcoin': 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh'
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





