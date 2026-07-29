/**
 * Test Data Factories
 * Centralized factories for generating consistent test data across all wallet tests
 */

import type { WalletAsset, Transaction } from '@bittasker/wallet-core';

/**
 * Factory for creating test wallet assets
 */
export const AssetFactory = {
	createRSKAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'rsk-rbtc',
		ticker: 'RBTC',
		name: 'Rootstock Bitcoin',
		precision: 18,
		icon: 'rbtc-icon',
		balance: 1, // 1 RBTC
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'RSK',
		...overrides
	}),

	createBSCBNBAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'bsc-bnb',
		ticker: 'BNB',
		name: 'Binance Coin',
		precision: 18,
		icon: 'bnb-icon',
		balance: 0.5, // 0.5 BNB
		formattedBalance: '0.50',
		usdValue: 150,
		network: 'BSC',
		...overrides
	}),

	createBSCUSDTAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'bsc-usdt',
		ticker: 'USDT',
		name: 'Tether USD',
		precision: 6,
		icon: 'usdt-icon',
		balance: 100, // 100 USDT
		formattedBalance: '100.00',
		usdValue: 100,
		network: 'BSC',
		...overrides
	}),

	createBitcoinAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'btc',
		ticker: 'BTC',
		name: 'Bitcoin',
		precision: 8,
		icon: 'btc-icon',
		balance: 1, // 1 BTC
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'Bitcoin',
		...overrides
	})
};

/**
 * Create a mock address entity for tests
 */
function createAddressEntity(address: string): Transaction['from'] {
	return {
		hash: address,
		is_contract: false,
		ens_domain_name: null,
		implementations: [],
		is_scam: false,
		is_verified: false,
		metadata: null,
		name: null,
		private_tags: [],
		proxy_type: null,
		public_tags: [],
		reputation: '',
		watchlist_names: []
	};
}

/**
 * Factory for creating test transactions
 */
export const TransactionFactory = {
	createSendTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createAddressEntity('0x1234567890123456789012345678901234567890'),
		to: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		value: '1000000000000000000', // 1 RBTC
		gas_used: '21000',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 12345678,
		timestamp: new Date().toISOString(),
		status: 'ok',
		nonce: 0,
		position: 0,
		confirmations: 10,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: ['transfer'],
		token_transfers: null,
		max_fee_per_gas: null,
		max_priority_fee_per_gas: null,
		base_fee_per_gas: null,
		priority_fee: null,
		transaction_burnt_fee: null,
		result: 'success',
		revert_reason: null,
		created_contract: null,
		is_pending_update: false,
		type: 0,
		has_error_in_internal_transactions: false,
		fee: { type: 'actual', value: '420000000000000' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	}),

	createReceiveTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		to: createAddressEntity('0x1234567890123456789012345678901234567890'),
		value: '500000000000000000', // 0.5 RBTC
		gas_used: '21000',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 12345679,
		timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
		status: 'ok',
		nonce: 0,
		position: 0,
		confirmations: 10,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: ['transfer'],
		token_transfers: null,
		max_fee_per_gas: null,
		max_priority_fee_per_gas: null,
		base_fee_per_gas: null,
		priority_fee: null,
		transaction_burnt_fee: null,
		result: 'success',
		revert_reason: null,
		created_contract: null,
		is_pending_update: false,
		type: 0,
		has_error_in_internal_transactions: false,
		fee: { type: 'actual', value: '420000000000000' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	}),

	createPendingTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createAddressEntity('0x1234567890123456789012345678901234567890'),
		to: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		value: '200000000000000000', // 0.2 RBTC
		gas_used: '0',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 0,
		timestamp: new Date().toISOString(),
		status: 'pending',
		nonce: 0,
		position: 0,
		confirmations: 0,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: ['transfer'],
		token_transfers: null,
		max_fee_per_gas: null,
		max_priority_fee_per_gas: null,
		base_fee_per_gas: null,
		priority_fee: null,
		transaction_burnt_fee: null,
		result: '',
		revert_reason: null,
		created_contract: null,
		is_pending_update: true,
		type: 0,
		has_error_in_internal_transactions: false,
		fee: { type: 'estimated', value: '0' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	})
};

/**
 * Factory for creating test addresses
 */
export const AddressFactory = {
	createRSKAddress: (): string => '0x1234567890123456789012345678901234567890',
	createBSCAddress: (): string => '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
	createBitcoinAddress: (): string => 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
	createLightningAddress: (): string => 'user@domain.com',
	createLiquidAddress: (): string => 'VJL1example123456789012345678901234567890'
};

/**
 * Minimal mock icon for ProcessedTransaction tests (TransactionHistory expects iconConfig.base)
 */
const MockIconComponent = () => 'svg';

/**
 * Factory for creating ProcessedTransaction-shaped objects (TransactionHistory component format)
 */
export const ProcessedTransactionFactory = {
	create: (
		overrides: Partial<{
			hash: string;
			displayType: 'send' | 'receive' | 'swap-claim' | 'contract-function';
			network: 'rsk' | 'bsc' | 'arb' | 'lightning';
			borderColor: 'warning' | 'success' | 'info' | 'neutral' | 'error';
		}> = {}
	) => ({
		hash: overrides.hash ?? '0x' + Math.random().toString(16).substring(2, 66),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		value: '100000000',
		timestamp: new Date().toISOString(),
		status: { label: 'Confirmed', icon: MockIconComponent, color: 'success' },
		network: (overrides.network ?? 'rsk') as 'rsk' | 'bsc' | 'arb' | 'lightning',
		type: 'send' as const,
		displayType: overrides.displayType ?? 'send',
		borderColor: (overrides.borderColor ?? 'warning') as
			| 'warning'
			| 'success'
			| 'info'
			| 'neutral'
			| 'error',
		iconConfig: { base: MockIconComponent, overlay: null },
		title: 'wallet.sent',
		networkIcon: '',
		networkDisplayName: 'Rootstock',
		explorerUrl: null,
		feeSats: 0,
		balanceAfter: 0
	})
};

/**
 * Factory for edge case test data
 */
export const EdgeCaseFactory = {
	zeroBalance: {
		balance: 0,
		formattedBalance: '0.00',
		usdValue: 0
	},

	verySmallBalance: {
		balance: 0.000000000000000001,
		formattedBalance: '0.000000000000000001',
		usdValue: 0.000000000065
	},

	veryLargeBalance: {
		balance: 1000, // 1000 RBTC
		formattedBalance: '1000.00',
		usdValue: 65000000
	},

	invalidAddress: '0x123', // Too short
	invalidHash: '0xabc' // Too short
};
