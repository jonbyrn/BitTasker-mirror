import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Hoisted mocks — available inside vi.mock factories
const { mockGaslessRelay, mockGetCode, mockGetTransactionCount } = vi.hoisted(() => ({
	mockGaslessRelay: vi.fn(),
	mockGetCode: vi.fn().mockResolvedValue('0x'),
	mockGetTransactionCount: vi.fn().mockResolvedValue(5)
}));

// Mock ethers for EIP-7702 auth signing
vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();
	class MockJsonRpcProvider {
		getCode = mockGetCode;
		getTransactionCount = mockGetTransactionCount;
	}
	class MockContract {
		getNonce = vi.fn().mockResolvedValue(0n);
	}
	return {
		...actual,
		ethers: {
			...actual.ethers,
			JsonRpcProvider: MockJsonRpcProvider,
			Contract: MockContract
		}
	};
});

// Mock @sentry/sveltekit
vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// Mock the config
vi.mock('$lib/wallet/gasless.config', () => ({
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 500_000n,
		maxPreVerificationGas: 100_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 6_000_000n
	},
	GAS_TREASURY: '0x1234567890123456789012345678901234567890',
	ARBITRUM_RPC_URL: 'https://arb1.arbitrum.io/rpc',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	SIMPLE_7702_ACCOUNT_IMPL: '0xB2779581b8B1F816b747fBa66c64D22196c7D001'
}));

// Mock the helpers
vi.mock('$lib/wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: vi.fn(),
	validateFeeRecipient: vi.fn()
}));

// Mock gaslessService (axios-based)
vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		relay: mockGaslessRelay,
		prepare: vi.fn().mockResolvedValue({ paymasterAndData: '0x' + 'aa'.repeat(65) }),
		estimate: vi.fn(),
		checkBalance: vi.fn(),
		health: vi.fn(),
		simulate: vi.fn().mockResolvedValue({ success: true })
	}
}));

import {
	walletState,
	sendToken,
	sendGaslessCalls,
	initWallet
} from '$lib/wallet/gasless-store';

describe('EIP-7702 auth signing path', () => {
	const mockToken = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
	const mockRecipient = '0x' + 'cd'.repeat(20);
	const mockAmount = 1000000000000000000n; // 1 token
	const mockFeeBuffer = 10000000000000000n; // 0.01 token
	const mockPrivateKey = ('0x' + 'ee'.repeat(32)) as `0x${string}`;

	function getRelayBody() {
		expect(mockGaslessRelay).toHaveBeenCalled();
		const relayCall = mockGaslessRelay.mock.calls[0];
		expect(relayCall).toBeTruthy();
		return (relayCall as unknown[])[0] as {
			sender: string;
			userOp: Record<string, unknown>;
			eip7702Auth?: Record<string, unknown>;
		};
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		mockGaslessRelay.mockResolvedValue({ userOpHash: '0x' + 'ff'.repeat(32) });

		// Reset ethers provider mocks — not delegated by default
		mockGetCode.mockResolvedValue('0x');
		mockGetTransactionCount.mockResolvedValue(5);

		// Initialize the wallet (which stores ownerKey)
		await initWallet(mockPrivateKey);
	});

	it('wallet is initialized after initWallet()', () => {
		const state = get(walletState);
		expect(state.ready).toBe(true);
		// Address derived from mockPrivateKey (0xee repeated 32 times)
		expect(state.address).toMatch(/^0x[0-9a-fA-F]{40}$/);
	});

	it('ownerKey is stored after initWallet()', () => {
		const state = get(walletState);
		expect(state.ownerKey).toBe(mockPrivateKey);
	});

	it('sendToken includes eip7702Auth when account has no code', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.eip7702Auth!.chainId).toBe('0x' + BigInt(42161).toString(16));
		expect(body.eip7702Auth!.address).toBe('0xB2779581b8B1F816b747fBa66c64D22196c7D001');
		expect(body.eip7702Auth!.nonce).toBeDefined();
		expect(body.eip7702Auth!.r).toBeDefined();
		expect(body.eip7702Auth!.s).toBeDefined();
		expect(body.eip7702Auth!.v).toBeDefined();
	});

	it('sendToken includes factory sentinel when not delegated', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('sendToken adds PER_EMPTY_ACCOUNT_COST to preVerificationGas', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		const preVerificationGas = BigInt(body.userOp.preVerificationGas as string);
		expect(preVerificationGas).toBeGreaterThan(100_000n);
	});

	it('sendToken includes eip7702Auth even when account is already delegated (always-auth design)', async () => {
		// signEip7702AuthIfNeeded always returns auth data — even for already-delegated
		// accounts — because the backend requires eip7702Auth on every relay call.
		mockGetCode.mockResolvedValue('0xef0100' + 'B2779581b8B1F816b747fBa66c64D22196c7D001'.toLowerCase());
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.userOp.factory).toBeDefined();
	});

	it('sendGaslessCalls includes eip7702Auth when not delegated', async () => {
		const calls = [{ to: mockToken, data: '0xa9059cbb' + '00'.repeat(64) }];
		await sendGaslessCalls(calls, mockToken, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('sendToken throws when wallet is not initialized and not delegated', async () => {
		// Reset wallet to clear ownerKey
		walletState.reset();

		await expect(
			sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer)
		).rejects.toThrow('Wallet not initialized');
	});

	it('sendToken includes eip7702Auth even when delegated to correct impl (always-auth design)', async () => {
		// signEip7702AuthIfNeeded always returns auth — backend requires it on every relay call
		mockGetCode.mockResolvedValue('0xef0100' + 'B2779581b8B1F816b747fBa66c64D22196c7D001'.toLowerCase());
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.userOp.factory).toBeDefined();
	});

	it('sendToken re-delegates when delegated to old implementation', async () => {
		// Delegation target is a DIFFERENT address (old v0.8 impl)
		const OLD_IMPL = '0x' + '11'.repeat(20);
		mockGetCode.mockResolvedValue('0xef0100' + OLD_IMPL.slice(2).toLowerCase());
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		// Should include eip7702Auth to re-delegate to correct impl
		expect(body.eip7702Auth).toBeDefined();
		expect(body.eip7702Auth!.address).toBe('0xB2779581b8B1F816b747fBa66c64D22196c7D001');
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('sendGaslessCalls re-delegates when delegated to old implementation', async () => {
		const OLD_IMPL = '0x' + '11'.repeat(20);
		mockGetCode.mockResolvedValue('0xef0100' + OLD_IMPL.slice(2).toLowerCase());
		const calls = [{ to: mockToken, data: '0xa9059cbb' + '00'.repeat(64) }];
		await sendGaslessCalls(calls, mockToken, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.eip7702Auth!.address).toBe('0xB2779581b8B1F816b747fBa66c64D22196c7D001');
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('re-delegation auth uses correct SIMPLE_7702_ACCOUNT_IMPL address', async () => {
		const OLD_IMPL = '0x' + 'aa'.repeat(20);
		mockGetCode.mockResolvedValue('0xef0100' + OLD_IMPL.slice(2).toLowerCase());
		mockGetTransactionCount.mockResolvedValue(7);
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		// Must target the NEW impl, not the old one
		expect(body.eip7702Auth!.address).toBe('0xB2779581b8B1F816b747fBa66c64D22196c7D001');
		expect(body.eip7702Auth!.address).not.toBe(OLD_IMPL);
		// Nonce should be the EOA's current nonce (7)
		expect(body.eip7702Auth!.nonce).toBe('0x' + BigInt(7).toString(16));
	});
});
