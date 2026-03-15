/**
 * Testnet USDT-BSC Configuration and Test Fixtures
 *
 * Provides test account setup, contract addresses, and helper functions
 * for E2E testing USDT on BSC testnet (Chain 97)
 */

export const BSC_TESTNET_CONFIG = {
	chainId: 97,
	chainName: 'BSC Testnet',
	rpcUrl: process.env.VITE_BSC_RPC_URL || 'https://data-seed-prebsc-1-a.binance.org:8545',
	explorerUrl: 'https://testnet.bscscan.com',
	tokens: {
		USDT: {
			address: (process.env.VITE_BSC_USDT_TOKEN_ADDRESS || '').trim() || '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
			decimals: 6,
			symbol: 'USDT'
		}
	},
	directSend: {
		routerAddress: (process.env.VITE_BSC_DIRECT_SEND_ROUTER_ADDRESS || '').trim() || '',
		fixedFeeAtomic: (process.env.VITE_BSC_DIRECT_SEND_FIXED_FEE_ATOMIC || '0').trim() || '0'
	},
	faucet: {
		// Test faucet for getting testnet BNB
		url: 'https://testnet.binance.org/faucet-smart'
	}
};

/**
 * Test accounts for E2E testing
 * These should be pre-funded with testnet BNB and USDT
 */
export const TEST_ACCOUNTS = {
	user1: {
		address: '0x1234567890123456789012345678901234567890',
		label: 'Test User 1 (Creator)',
		privateKey: process.env.VITE_TEST_ACCOUNT_1_PK || ''
	},
	user2: {
		address: '0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd',
		label: 'Test User 2 (Bidder)',
		privateKey: process.env.VITE_TEST_ACCOUNT_2_PK || ''
	},
	ambiguous: {
		address: '0x9876543210987654321098765432109876543210',
		label: 'Ambiguous Address (no network qualifier)',
		privateKey: ''
	}
};

/**
 * Standard test amounts with USDT decimals (6)
 */
export const TEST_AMOUNTS = {
	small: '1.234567',
	medium: '12.345678',
	large: '100.000000',
	veryLarge: '1000.000000'
};

/**
 * Wait utilities for deterministic E2E tests
 */
export const WAIT_TIMES = {
	shortWait: 500,
	standardWait: 1000,
	mediumWait: 2000,
	longWait: 5000,
	veryLongWait: 10000,
	maxTimeout: 30000
};

/**
 * Helper to format USDT amounts
 * @param atomicAmount Amount in smallest unit (wei-like, 6 decimals for USDT)
 * @returns Formatted amount with proper decimals
 */
export function atomicToUsdtAmount(atomicAmount: string | number): number {
	const amount = typeof atomicAmount === 'string' ? BigInt(atomicAmount) : BigInt(atomicAmount);
	return Number(amount) / 10 ** BSC_TESTNET_CONFIG.tokens.USDT.decimals;
}

/**
 * Helper to convert USDT amount to atomic units
 * @param usdtAmount Human-readable USDT amount
 * @returns Atomic amount (with 6 decimals)
 */
export function usdtToAtomicAmount(usdtAmount: number | string): string {
	const amount = typeof usdtAmount === 'string' ? parseFloat(usdtAmount) : usdtAmount;
	const atomic = Math.floor(amount * 10 ** BSC_TESTNET_CONFIG.tokens.USDT.decimals);
	return atomic.toString();
}

/**
 * Format amount for display
 */
export function formatUsdtDisplay(amount: number | string, maxDecimals = 6): string {
	const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
	if (!Number.isFinite(numAmount)) return '0';

	return new Intl.NumberFormat('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: maxDecimals
	}).format(numAmount);
}

/**
 * Helper to construct explorer URLs
 */
export function getExplorerUrl(hash: string, type: 'tx' | 'address' = 'tx'): string {
	const baseUrl = BSC_TESTNET_CONFIG.explorerUrl;
	return `${baseUrl}/${type}/${hash}`;
}

/**
 * Validate BSC address format
 */
export function isValidBscAddress(address: string): boolean {
	if (!address.startsWith('0x')) return false;
	if (address.length !== 42) return false;
	return /^0x[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Create mock transaction for testing
 */
export function createMockTransaction(overrides: Partial<any> = {}) {
	return {
		hash: '0x' + 'a'.repeat(64),
		from: TEST_ACCOUNTS.user1.address,
		to: TEST_ACCOUNTS.user2.address,
		value: usdtToAtomicAmount('12.345678'), // 12.345678 USDT in atomic units
		network: 'usdt-bsc',
		chainId: BSC_TESTNET_CONFIG.chainId,
		type: 'send',
		status: 'confirmed',
		timestamp: Date.now(),
		...overrides
	};
}

/**
 * Seed testnet accounts with USDT tokens
 * (Normally done via testnet faucet or pre-funding)
 */
export async function seedTestnetAccounts(): Promise<void> {
	// In real tests, this would:
	// 1. Call BSC testnet faucet for BNB
	// 2. Approve USDT token if needed
	// 3. Transfer initial USDT balance to test accounts
	//
	// For E2E tests with mocked wallet, we use localStorage instead
	console.log('Setting up testnet seed data...');

	if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
		// Mock balance setup for test accounts
		localStorage.setItem('usdt_balance_user1', usdtToAtomicAmount(500)); // 500 USDT
		localStorage.setItem('usdt_balance_user2', usdtToAtomicAmount(1000)); // 1000 USDT
		localStorage.setItem('bsc_connected_account', TEST_ACCOUNTS.user1.address);
	}
}

/**
 * Network URL patterns for explorer
 */
export const EXPLORER_PATTERNS = {
	bscMainnet: /https?:\/\/(www\.)?bscscan\.com/i,
	bscTestnet: /https?:\/\/(www\.)?testnet\.bscscan\.com/i,
	bscAny: /bscscan\.com/i,
	rskMainnet: /blockscout\.com\/.*\/address/i,
	rskTestnet: /testnet\.blockscout\.com/i
};
