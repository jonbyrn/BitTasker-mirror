import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// Mock viem
vi.mock('viem', () => ({
	encodeFunctionData: vi.fn().mockReturnValue('0x34fcd5be' + 'ab'.repeat(64)),
	isAddress: vi.fn().mockImplementation((addr: string) => /^0x[0-9a-fA-F]{40}$/.test(addr)),
	createPublicClient: vi.fn().mockReturnValue({
		readContract: vi.fn().mockResolvedValue(0n),
		getCode: vi.fn().mockResolvedValue('0x'), // No code = not delegated
		getTransactionCount: vi.fn().mockResolvedValue(5)
	}),
	http: vi.fn(),
	keccak256: vi.fn().mockReturnValue('0x' + 'dd'.repeat(32)),
	toRlp: vi.fn().mockReturnValue('0x' + 'ee'.repeat(32)),
	toHex: vi.fn().mockImplementation((v: bigint) => '0x' + v.toString(16)),
	concat: vi.fn().mockReturnValue(new Uint8Array(32))
}));

vi.mock('viem/chains', () => ({
	arbitrum: { id: 42161 }
}));

vi.mock('viem/accounts', () => ({
	privateKeyToAccount: vi.fn().mockReturnValue({
		signMessage: vi.fn().mockResolvedValue(
			'0x' + 'aa'.repeat(32) + 'bb'.repeat(32) + '1b' // r + s + v
		)
	})
}));

// Mock @sentry/sveltekit
vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// Mock the config
vi.mock('../../../../../wallet/gasless.config', () => ({
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 1_000_000n,
		maxPreVerificationGas: 100_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 5_000_000n
	},
	GAS_TREASURY: '0x1234567890123456789012345678901234567890',
	ARBITRUM_RPC_URL: 'https://arb1.arbitrum.io/rpc',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',
	SIMPLE_7702_ACCOUNT_IMPL: '0xe6Cae83BdE06E4c305530e199D7217f42808555B'
}));

// Mock the helpers
vi.mock('../../../../../wallet/gasless-helpers', () => ({
	validateFeeParameters: vi.fn(),
	validateFeeBufferBounds: vi.fn(),
	validateFeeRecipient: vi.fn()
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock permissionless
const mockSignUserOp = vi.fn().mockResolvedValue({ signature: '0x' + 'cc'.repeat(65) });
vi.mock('permissionless/accounts', () => ({
	to7702SimpleSmartAccount: vi.fn().mockResolvedValue({
		address: '0x' + 'ab'.repeat(20),
		signUserOperation: mockSignUserOp,
		getNonce: vi.fn().mockResolvedValue(0n)
	})
}));

import {
	walletState,
	sendToken,
	sendGaslessCalls,
	initWallet
} from '../../../../wallet/gasless-store';

describe('EIP-7702 auth signing path', () => {
	const mockToken = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
	const mockRecipient = '0x' + 'cd'.repeat(20);
	const mockAmount = 1000000000000000000n; // 1 token
	const mockFeeBuffer = 10000000000000000n; // 0.01 token
	const mockJwt = 'test-jwt-token';
	const mockPrivateKey = ('0x' + 'ee'.repeat(32)) as `0x${string}`;

	function getRelayBody() {
		const fetchCall = mockFetch.mock.calls.find((call: unknown[]) =>
			(call[0] as string).includes('/gasless/relay')
		);
		expect(fetchCall).toBeTruthy();
		const options = (fetchCall as unknown[])[1] as { body: string };
		return JSON.parse(options.body);
	}

	beforeEach(async () => {
		vi.clearAllMocks();
		mockFetch.mockResolvedValue({
			ok: true,
			json: () => Promise.resolve({ userOpHash: '0x' + 'ff'.repeat(32) })
		});

		// Re-initialize createPublicClient mock for each test (non-delegated by default)
		const { createPublicClient } = await import('viem');
		(createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
			readContract: vi.fn().mockResolvedValue(0n),
			getCode: vi.fn().mockResolvedValue('0x'),
			getTransactionCount: vi.fn().mockResolvedValue(5)
		});

		// Initialize the wallet (which stores ownerKey)
		await initWallet(mockPrivateKey);
	});

	it('wallet is initialized after initWallet()', () => {
		const state = get(walletState);
		expect(state.ready).toBe(true);
		expect(state.address).toBe('0x' + 'ab'.repeat(20));
	});

	it('ownerKey is stored after initWallet()', () => {
		const state = get(walletState);
		expect(state.ownerKey).toBe(mockPrivateKey);
	});

	it('sendToken includes eip7702Auth when account has no code', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer, mockJwt);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.eip7702Auth.chainId).toBe('0x' + BigInt(42161).toString(16));
		expect(body.eip7702Auth.address).toBe('0xe6Cae83BdE06E4c305530e199D7217f42808555B');
		expect(body.eip7702Auth.nonce).toBeDefined();
		expect(body.eip7702Auth.r).toBeDefined();
		expect(body.eip7702Auth.s).toBeDefined();
		expect(body.eip7702Auth.v).toBeDefined();
	});

	it('sendToken includes factory sentinel when not delegated', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer, mockJwt);
		const body = getRelayBody();
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('sendToken adds PER_EMPTY_ACCOUNT_COST to preVerificationGas', async () => {
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer, mockJwt);
		const body = getRelayBody();
		const preVerificationGas = BigInt(body.userOp.preVerificationGas);
		expect(preVerificationGas).toBeGreaterThan(100_000n);
	});

	it('sendToken does NOT include eip7702Auth when account is already delegated', async () => {
		const { createPublicClient } = await import('viem');
		(createPublicClient as ReturnType<typeof vi.fn>).mockReturnValue({
			readContract: vi.fn().mockResolvedValue(0n),
			getCode: vi.fn().mockResolvedValue('0xef0100' + 'ab'.repeat(20)),
			getTransactionCount: vi.fn().mockResolvedValue(5)
		});
		await sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer, mockJwt);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeUndefined();
		expect(body.userOp.factory).toBeUndefined();
	});

	it('sendGaslessCalls includes eip7702Auth when not delegated', async () => {
		const calls = [{ to: mockToken, data: '0xa9059cbb' + '00'.repeat(64) }];
		await sendGaslessCalls(calls, mockToken, mockFeeBuffer, mockJwt);
		const body = getRelayBody();
		expect(body.eip7702Auth).toBeDefined();
		expect(body.userOp.factory).toBe('0x7702000000000000000000000000000000000000');
	});

	it('sendToken throws when wallet is not initialized and not delegated', async () => {
		// Reset wallet to clear ownerKey
		walletState.reset();

		await expect(
			sendToken(mockToken, mockRecipient, mockAmount, mockFeeBuffer, mockJwt)
		).rejects.toThrow('Wallet not initialized');
	});
});
