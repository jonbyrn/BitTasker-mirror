/**
 * Test Data Factories
 * Centralized factories for generating consistent test data across all wallet tests
 */

import type { WalletAsset, Transaction, NetworkType } from '@bittasker/wallet-core';

/**
 * Factory for creating test wallet assets
 */
export const AssetFactory = {
	createRSKAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		symbol: 'RBTC',
		name: 'Rootstock Bitcoin',
		balance: '1000000000000000000', // 1 RBTC
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'rootstock-bitcoin',
		decimals: 18,
		...overrides
	}),

	createBSCBNBAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		symbol: 'BNB',
		name: 'Binance Coin',
		balance: '500000000000000000', // 0.5 BNB
		formattedBalance: '0.50',
		usdValue: 150,
		network: 'usdt-bsc',
		decimals: 18,
		...overrides
	}),

	createBSCUSDTAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		symbol: 'USDT',
		name: 'Tether USD',
		balance: '100000000', // 100 USDT
		formattedBalance: '100.00',
		usdValue: 100,
		network: 'usdt-bsc',
		decimals: 6,
		...overrides
	}),

	createBitcoinAsset: (overrides: Partial<WalletAsset> = {}): WalletAsset => ({
		symbol: 'BTC',
		name: 'Bitcoin',
		balance: '100000000', // 1 BTC in sats
		formattedBalance: '1.00',
		usdValue: 65000,
		network: 'bitcoin',
		decimals: 8,
		...overrides
	})
};

/**
 * Factory for creating test transactions
 */
export const TransactionFactory = {
	createSendTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		value: '1000000000000000000', // 1 RBTC
		blockNumber: 12345678,
		blockHash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: Date.now(),
		network: 'rootstock-bitcoin',
		type: 'send',
		status: 'confirmed',
		...overrides
	}),

	createReceiveTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		to: '0x1234567890123456789012345678901234567890',
		value: '500000000000000000', // 0.5 RBTC
		blockNumber: 12345679,
		blockHash: '0x' + Math.random().toString(16).substring(2, 66),
		timestamp: Date.now() - 3600000, // 1 hour ago
		network: 'rootstock-bitcoin',
		type: 'receive',
		status: 'confirmed',
		...overrides
	}),

	createPendingTransaction: (overrides: Partial<Transaction> = {}): Transaction => ({
		hash: '0x' + Math.random().toString(16).substring(2, 66),
		from: '0x1234567890123456789012345678901234567890',
		to: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
		value: '200000000000000000', // 0.2 RBTC
		blockNumber: null,
		blockHash: null,
		timestamp: Date.now(),
		network: 'rootstock-bitcoin',
		type: 'send',
		status: 'pending',
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





