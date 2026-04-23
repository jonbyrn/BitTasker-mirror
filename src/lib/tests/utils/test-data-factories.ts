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
	} as unknown as WalletAsset),

	createBSCBNBAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'bnb',
		ticker: 'BNB',
		name: 'Binance Coin',
		precision: 18,
		icon: '',
		balance: 500000000000000000,
		formattedBalance: '0.50',
		usdValue: 150,
		network: 'BSC',
		...overrides
	} as unknown as WalletAsset),

	createBSCUSDTAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'usdt',
		ticker: 'USDT',
		name: 'Tether USD',
		precision: 6,
		icon: '',
		balance: 100000000,
		formattedBalance: '100.00',
		usdValue: 100,
		network: 'BSC',
		...overrides
	} as unknown as WalletAsset),

	createBitcoinAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'btc',
		ticker: 'BTC',
		name: 'Bitcoin',
		precision: 8,
		icon: '',
		balance: 100000000,
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'Bitcoin',
		...overrides
	} as unknown as WalletAsset)
};

/**
 * Factory for creating test transactions
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

export const TransactionFactory = {
	createSendTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
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
	} as unknown as Transaction),

	createReceiveTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createMockAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		to: createMockAddressEntity('0x1234567890123456789012345678901234567890'),
		value: '500000000000000000',
		gas_used: '21000',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 12345679,
		block_hash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: String(Date.now() - 3600000),
		status: 'confirmed',
		nonce: 1,
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
	} as unknown as Transaction),

	createPendingTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createMockAddressEntity('0x1234567890123456789012345678901234567890'),
		to: createMockAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		value: '200000000000000000',
		gas_used: '0',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 0,
		block_hash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: String(Date.now()),
		status: 'pending',
		nonce: 2,
		position: 0,
		confirmations: 0,
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
		is_pending_update: true,
		type: 2,
		has_error_in_internal_transactions: false,
		fee: { type: 'EIP1559', value: '0' },
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: null,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	} as unknown as Transaction)
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
			network: 'rsk' | 'bsc' | 'lightning';
			borderColor: 'warning' | 'success' | 'info';
		}> = {}
	) => ({
		hash: overrides.hash ?? '0x' + Math.random().toString(16).substring(2, 66),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		value: '100000000',
		timestamp: Date.now(),
		status: { label: 'Confirmed', icon: MockIconComponent, color: 'success' },
		network: (overrides.network ?? 'rsk') as 'rsk' | 'bsc' | 'lightning',
		type: 'send' as const,
		displayType: overrides.displayType ?? 'send',
		borderColor: (overrides.borderColor ?? 'warning') as 'warning' | 'success' | 'info',
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
		balance: '0',
		formattedBalance: '0.00',
		usdValue: 0
	},

	verySmallBalance: {
		balance: '1',
		formattedBalance: '0.000000000000000001',
		usdValue: 0.000000000065
	},

	veryLargeBalance: {
		balance: '1000000000000000000000', // 1000 RBTC
		formattedBalance: '1000.00',
		usdValue: 65000000
	},

	invalidAddress: '0x123', // Too short
	invalidHash: '0xabc' // Too short
};





