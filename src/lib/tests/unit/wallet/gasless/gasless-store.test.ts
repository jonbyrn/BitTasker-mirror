import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock viem with isAddress and encodeFunctionData
vi.mock('viem', () => ({
	encodeFunctionData: vi.fn().mockReturnValue('0x' + 'ab'.repeat(20)),
	isAddress: vi.fn().mockImplementation((addr: string) => {
		return /^0x[0-9a-fA-F]{40}$/.test(addr);
	})
}));

// Mock the wallet module
vi.mock('../../../../../wallet/arbitrum-wallet', () => ({
	ArbitrumWallet: vi.fn().mockImplementation(() => ({
		getAddress: vi.fn().mockResolvedValue('0x' + 'ab'.repeat(20)),
		getProvider: vi.fn().mockReturnValue({}),
		getWallet: vi.fn().mockReturnValue({}),
		getAllTokenBalances: vi.fn().mockResolvedValue([])
	}))
}));

// Mock the config with all required exports
vi.mock('../../../../../wallet/gasless.config', () => ({
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 1_000_000n,
		maxPreVerificationGas: 100_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 5_000_000n
	},
	API_BASE_URL: 'http://localhost:3000/api',
	GAS_TREASURY: '0x1234567890123456789012345678901234567890',
	ARBITRUM_RPC_URL: 'https://arb1.arbitrum.io/rpc',
	ARBITRUM_CHAIN_ID: 42161
}));

// Mock the helpers
vi.mock('../../../../../wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: vi.fn(),
	validateFeeRecipient: vi.fn()
}));

// Mock global fetch
vi.stubGlobal('fetch', vi.fn());

import {
	gaslessWallet,
	gaslessAddress,
	gaslessReady,
	estimateFee
} from '../../../../../wallet/gasless-store';

describe('gasless-store readable stores', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('gaslessWallet is defined', () => {
		expect(gaslessWallet).toBeDefined();
	});

	it('gaslessAddress is defined', () => {
		expect(gaslessAddress).toBeDefined();
	});

	it('gaslessReady is defined', () => {
		expect(gaslessReady).toBeDefined();
	});

	it('initial address is null', () => {
		const val = get(gaslessAddress);
		expect(val).toBeNull();
	});

	it('initial ready is false', () => {
		const val = get(gaslessReady);
		expect(val).toBe(false);
	});

	it('initial wallet is an object with null address and false ready', () => {
		const val = get(gaslessWallet);
		expect(val).toBeDefined();
		expect(typeof val).toBe('object');
		expect(val).toHaveProperty('address', null);
		expect(val).toHaveProperty('ready', false);
	});
});

describe('estimateFee', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns a fee estimate object', async () => {
		const mockResponse = {
			ok: true,
			json: vi.fn().mockResolvedValue({
				feeToken: '0xFd086bC8CD6ce520EBC41709935D152F37Fc8d6a',
				feeAmount: '10000000000000000'
			})
		};
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(fetch as any).mockResolvedValue(mockResponse);

		const result = await estimateFee(
			'0xFd086bC8CD6ce520EBC41709935D152F37Fc8d6a',
			1000000000000000000n,
			'0x' + 'ab'.repeat(20),
			'test-jwt-token'
		);

		expect(result).toBeDefined();
		expect(result).toHaveProperty('feeToken');
		expect(result).toHaveProperty('feeAmount');
	});

	it('throws for invalid token address', async () => {
		await expect(
			estimateFee('invalid', 1000000000000000000n, '0x' + 'ab'.repeat(20), 'jwt')
		).rejects.toThrow('Invalid token address');
	});

	it('throws for invalid recipient address', async () => {
		await expect(
			estimateFee(
				'0xFd086bC8CD6ce520EBC41709935D152F37Fc8d6a',
				1000000000000000000n,
				'invalid',
				'jwt'
			)
		).rejects.toThrow('Invalid recipient address');
	});

	it('throws for zero amount', async () => {
		await expect(
			estimateFee('0xFd086bC8CD6ce520EBC41709935D152F37Fc8d6a', 0n, '0x' + 'ab'.repeat(20), 'jwt')
		).rejects.toThrow('Amount must be positive');
	});

	it('throws for negative amount', async () => {
		await expect(
			estimateFee('0xFd086bC8CD6ce520EBC41709935D152F37Fc8d6a', -1n, '0x' + 'ab'.repeat(20), 'jwt')
		).rejects.toThrow('Amount must be positive');
	});
});

describe('sendGaslessCalls', () => {
	let sendGaslessCalls: typeof import('$lib/wallet/gasless-store').sendGaslessCalls;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('$lib/wallet/gasless-store');
		sendGaslessCalls = mod.sendGaslessCalls;
	});

	it('throws for empty calls array', async () => {
		await expect(sendGaslessCalls([], '0xToken', 1000n, 'jwt')).rejects.toThrow(
			'At least one call is required'
		);
	});

	it('throws for invalid fee token address', async () => {
		await expect(
			sendGaslessCalls([{ to: '0x' + 'ab'.repeat(20), data: '0x' }], 'invalid', 1000n, 'jwt')
		).rejects.toThrow('Invalid fee token address');
	});

	it('throws for zero fee buffer', async () => {
		await expect(
			sendGaslessCalls(
				[{ to: '0x' + 'ab'.repeat(20), data: '0x' }],
				'0x' + 'ab'.repeat(20),
				0n,
				'jwt'
			)
		).rejects.toThrow('Fee buffer must be positive');
	});

	it('throws when wallet not initialized', async () => {
		await expect(
			sendGaslessCalls(
				[{ to: '0x' + 'ab'.repeat(20), data: '0x1234' }],
				'0x' + 'ab'.repeat(20),
				1000n,
				'jwt'
			)
		).rejects.toThrow('Wallet not initialized');
	});
});

describe('checkETHBalance', () => {
	let checkETHBalance: typeof import('$lib/wallet/gasless-store').checkETHBalance;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('$lib/wallet/gasless-store');
		checkETHBalance = mod.checkETHBalance;
	});

	it('throws for invalid address', async () => {
		await expect(checkETHBalance('invalid')).rejects.toThrow('Invalid user address');
	});
});

describe('sendTokenDirect', () => {
	let sendTokenDirect: typeof import('$lib/wallet/gasless-store').sendTokenDirect;

	beforeEach(async () => {
		vi.clearAllMocks();
		const mod = await import('$lib/wallet/gasless-store');
		sendTokenDirect = mod.sendTokenDirect;
	});

	it('throws for invalid token address', async () => {
		await expect(sendTokenDirect('invalid', '0x' + 'ab'.repeat(20), 1000n)).rejects.toThrow(
			'Invalid token address'
		);
	});

	it('throws for invalid recipient address', async () => {
		await expect(sendTokenDirect('0x' + 'ab'.repeat(20), 'invalid', 1000n)).rejects.toThrow(
			'Invalid recipient address'
		);
	});

	it('throws for zero amount', async () => {
		await expect(
			sendTokenDirect('0x' + 'ab'.repeat(20), '0x' + 'ab'.repeat(20), 0n)
		).rejects.toThrow('Amount must be positive');
	});

	it('throws when owner key not available', async () => {
		await expect(
			sendTokenDirect('0x' + 'ab'.repeat(20), '0x' + 'ab'.repeat(20), 1000n)
		).rejects.toThrow('Owner key not available');
	});
});
