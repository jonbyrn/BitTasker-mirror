/**
 * Test Data Factories
 * Centralized factories for generating consistent test data across all wallet tests
 */

import type { Transaction, WalletAsset } from '@bittasker/wallet-core';

type AddressEntity = Transaction['from'];

function createAddressEntity(hash: string): AddressEntity {
	return {
		ens_domain_name: null,
		hash,
		implementations: [],
		is_contract: false,
		is_scam: false,
		is_verified: false,
		metadata: null,
		name: null,
		private_tags: [],
		proxy_type: null,
		public_tags: [],
		reputation: 'neutral',
		watchlist_names: []
	};
}

function createBaseTransaction(overrides: Partial<Transaction> = {}): Transaction {
	return {
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: createAddressEntity('0x1234567890123456789012345678901234567890'),
		to: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
		value: '1000000000000000000',
		gas_used: '21000',
		gas_price: '20000000000',
		gas_limit: '21000',
		block_number: 12345678,
		timestamp: new Date().toISOString(),
		status: 'ok',
		nonce: 1,
		position: 0,
		confirmations: 12,
		raw_input: '0x',
		method: null,
		decoded_input: null,
		transaction_types: [],
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
		type: 2,
		has_error_in_internal_transactions: false,
		fee: {
			type: 'actual',
			value: '420000000000000'
		},
		exchange_rate: null,
		historic_exchange_rate: null,
		confirmation_duration: null,
		token_transfers_overflow: false,
		transaction_tag: null,
		authorization_list: [],
		actions: [],
		...overrides
	};
}

/**
 * Factory for creating test wallet assets
 */
export const AssetFactory = {
	createRSKAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'rbtc',
		ticker: 'RBTC',
		name: 'Rootstock Bitcoin',
		precision: 18,
		icon: '/images/chains/Bitcoin-Rootstock-logo.webp',
		balance: 1,
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'RSK',
		...overrides
	}),

	createBSCBNBAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'bnb',
		ticker: 'BNB',
		name: 'Binance Coin',
		precision: 18,
		icon: '/images/chains/Binance-Coin.svg',
		balance: 0.5,
		formattedBalance: '0.50',
		usdValue: 150,
		network: 'BSC',
		...overrides
	}),

	createBSCUSDTAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		assetId: 'usdt',
		ticker: 'USDT',
		name: 'Tether USD',
		precision: 6,
		icon: '/images/chains/USDT-BSC.svg',
		balance: 100,
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
		icon: '/images/chains/Bitcoin.svg',
		balance: 1,
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'Bitcoin',
		...overrides
	})
};

/**
 * Factory for creating test transactions
 */
export const TransactionFactory = {
	createSendTransaction: (overrides: Partial<Transaction> = {}): Transaction =>
		createBaseTransaction({
			from: createAddressEntity('0x1234567890123456789012345678901234567890'),
			to: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
			...overrides
		}),

	createReceiveTransaction: (overrides: Partial<Transaction> = {}): Transaction =>
		createBaseTransaction({
			from: createAddressEntity('0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'),
			to: createAddressEntity('0x1234567890123456789012345678901234567890'),
			value: '500000000000000000',
			block_number: 12345679,
			...overrides
		}),

	createPendingTransaction: (overrides: Partial<Transaction> = {}): Transaction =>
		createBaseTransaction({
			status: 'pending',
			confirmations: 0,
			is_pending_update: true,
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
