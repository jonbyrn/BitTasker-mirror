/**
 * Tests for Gasless Store — gasless-store.ts
 *
 * Covers:
 *  - gaslessWallet store (init, reset, error handling, loading state)
 *  - gaslessAddress derived store
 *  - gaslessReady derived store
 *  - buildExecuteBatchCallData (empty calls, single call, multiple calls)
 *  - sendGasless (wallet not initialized, success, relay failure)
 *  - sendTokenProgrammatic (convenience wrapper)
 *  - estimateFee (success, network fee error, generic error)
 *  - checkSufficientBalance (sufficient, insufficient)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------------
// Hoisted mock variables (must be hoisted to match vi.mock hoisting)
// ---------------------------------------------------------------------------
const {
	mockReadContract,
	mockGetCode,
	mockGetTransactionCount,
	mockCreatePublicClient,
	mockTo7702SimpleSmartAccount,
	mockValidateFeeParameters,
	mockValidateFeeBufferBounds,
	mockValidateFeeRecipient,
	mockGaslessRelay,
	mockGaslessEstimate
} = vi.hoisted(() => ({
	mockReadContract: vi.fn(),
	mockGetCode: vi.fn().mockResolvedValue('0x'), // No code = not yet delegated (EIP-7702)
	mockGetTransactionCount: vi.fn().mockResolvedValue(0),
	mockCreatePublicClient: vi.fn(),
	mockTo7702SimpleSmartAccount: vi.fn(),
	mockValidateFeeParameters: vi.fn(),
	mockValidateFeeBufferBounds: vi.fn(),
	mockValidateFeeRecipient: vi.fn(),
	mockGaslessRelay: vi.fn(),
	mockGaslessEstimate: vi.fn()
}));

// ---------------------------------------------------------------------------
// Mock viem modules (hoisted to top of file)
// ---------------------------------------------------------------------------

vi.mock('viem', () => ({
	createPublicClient: mockCreatePublicClient,
	http: vi.fn().mockReturnValue('mock-transport'),
	encodeFunctionData: vi.fn().mockReturnValue('0xencodeddata' as `0x${string}`),
	isAddress: vi.fn().mockReturnValue(true)
}));

vi.mock('viem/accounts', () => ({
	privateKeyToAccount: vi.fn().mockReturnValue({ address: '0xMockSigner' })
}));

vi.mock('viem/chains', () => ({
	arbitrum: { id: 42161, name: 'Arbitrum' }
}));

vi.mock('permissionless/accounts', () => ({
	to7702SimpleSmartAccount: mockTo7702SimpleSmartAccount
}));

// Mock @sentry/sveltekit
vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn()
}));

// Mock gasless-helpers
vi.mock('$lib/wallet/gasless-helpers', () => ({
	validateFeeParameters: mockValidateFeeParameters,
	validateFeeBufferBounds: mockValidateFeeBufferBounds,
	validateFeeRecipient: mockValidateFeeRecipient
}));

// Mock gasless.config
vi.mock('$lib/wallet/gasless.config', () => ({
	GAS_TREASURY: '0xTreasuryAddress1234567890abcdef12',
	GAS_BOUNDS: {
		maxCallGas: 5_000_000n,
		maxVerificationGas: 1_000_000n,
		maxPreVerificationGas: 400_000n,
		maxFeePerGas: 1_000_000_000n,
		maxPriorityFeePerGas: 100_000_000n,
		maxTotalGas: 6_400_000n
	},
	ARBITRUM_RPC_URL: 'https://arb-mainnet.g.alchemy.com/v2/test',
	ARBITRUM_CHAIN_ID: 42161,
	ENTRY_POINT_ADDRESS: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',
	SIMPLE_7702_ACCOUNT_IMPL: '0xe6Cae83BdE06E4c305530e199D7217f42808555B'
}));

// Mock gasless service (axios-based — auth handled by interceptor)
vi.mock('$lib/api/services/gasless.service', () => ({
	gaslessService: {
		relay: mockGaslessRelay,
		estimate: mockGaslessEstimate,
		checkBalance: vi.fn(),
		health: vi.fn()
	}
}));

// ---------------------------------------------------------------------------
// Import the store under test AFTER mocks
// ---------------------------------------------------------------------------
import {
	gaslessWallet,
	gaslessAddress,
	gaslessReady,
	buildExecuteBatchCallData,
	sendGasless,
	sendTokenProgrammatic,
	estimateFee,
	checkSufficientBalance
} from '$lib/wallet/gasless-store';

import {
	validateFeeParameters,
	validateFeeBufferBounds,
	validateFeeRecipient
} from '$lib/wallet/gasless-helpers';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const MOCK_PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const MOCK_ACCOUNT_ADDRESS = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
const MOCK_SMART_ACCOUNT = {
	address: MOCK_ACCOUNT_ADDRESS,
	signUserOperation: vi.fn()
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('gasless-store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		gaslessWallet.reset();

		// Reset gasless service mocks
		mockGaslessRelay.mockReset();
		mockGaslessEstimate.mockReset();

		// Default mocks
		mockTo7702SimpleSmartAccount.mockResolvedValue(MOCK_SMART_ACCOUNT);
		mockCreatePublicClient.mockReturnValue({
			readContract: mockReadContract,
			getCode: mockGetCode,
			getTransactionCount: mockGetTransactionCount
		});
	});

	// ── gaslessWallet store ──────────────────────────────────────────────

	describe('gaslessWallet', () => {
		it('has correct initial state', () => {
			const state = get(gaslessWallet);
			expect(state.address).toBeNull();
			expect(state.ready).toBe(false);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
		});

		it('sets loading=true during init', async () => {
			let resolveInit: (value: unknown) => void;
			const initPromise = new Promise((resolve) => {
				resolveInit = resolve;
			});
			mockTo7702SimpleSmartAccount.mockReturnValue(initPromise);

			const initCall = gaslessWallet.init(MOCK_PRIVATE_KEY);

			// Check loading state is true during init
			const loadingState = get(gaslessWallet);
			expect(loadingState.loading).toBe(true);
			expect(loadingState.error).toBeNull();

			resolveInit!(MOCK_SMART_ACCOUNT);
			await initCall;
		});

		it('init succeeds and updates state with address and ready', async () => {
			const address = await gaslessWallet.init(MOCK_PRIVATE_KEY);

			expect(address).toBe(MOCK_ACCOUNT_ADDRESS);

			const state = get(gaslessWallet);
			expect(state.address).toBe(MOCK_ACCOUNT_ADDRESS);
			expect(state.ready).toBe(true);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
		});

		it('init calls to7702SimpleSmartAccount', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			expect(mockTo7702SimpleSmartAccount).toHaveBeenCalledWith({
				client: expect.anything(),
				owner: expect.anything()
			});
		});

		it('init handles Error thrown value', async () => {
			const errorMsg = 'Invalid private key';
			mockTo7702SimpleSmartAccount.mockRejectedValue(new Error(errorMsg));

			await expect(gaslessWallet.init(MOCK_PRIVATE_KEY)).rejects.toThrow(errorMsg);

			const state = get(gaslessWallet);
			expect(state.loading).toBe(false);
			expect(state.error).toBe(errorMsg);
			expect(state.ready).toBe(false);
			expect(state.address).toBeNull();
		});

		it('init handles non-Error thrown value with fallback message', async () => {
			mockTo7702SimpleSmartAccount.mockRejectedValue('string error');

			await expect(gaslessWallet.init(MOCK_PRIVATE_KEY)).rejects.toBe('string error');

			const state = get(gaslessWallet);
			expect(state.error).toBe('Failed to initialize wallet');
		});

		it('reset clears all state back to initial', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);
			expect(get(gaslessWallet).ready).toBe(true);

			gaslessWallet.reset();

			const state = get(gaslessWallet);
			expect(state.address).toBeNull();
			expect(state.ready).toBe(false);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
		});
	});

	// ── gaslessAddress derived store ──────────────────────────────────────

	describe('gaslessAddress', () => {
		it('is null initially', () => {
			expect(get(gaslessAddress)).toBeNull();
		});

		it('updates to address after init', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);
			expect(get(gaslessAddress)).toBe(MOCK_ACCOUNT_ADDRESS);
		});

		it('returns to null after reset', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);
			gaslessWallet.reset();
			expect(get(gaslessAddress)).toBeNull();
		});
	});

	// ── gaslessReady derived store ────────────────────────────────────────

	describe('gaslessReady', () => {
		it('is false initially', () => {
			expect(get(gaslessReady)).toBe(false);
		});

		it('becomes true after successful init', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);
			expect(get(gaslessReady)).toBe(true);
		});

		it('stays false after failed init', async () => {
			mockTo7702SimpleSmartAccount.mockRejectedValue(new Error('fail'));
			await gaslessWallet.init(MOCK_PRIVATE_KEY).catch(() => {});
			expect(get(gaslessReady)).toBe(false);
		});

		it('returns to false after reset', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);
			gaslessWallet.reset();
			expect(get(gaslessReady)).toBe(false);
		});
	});

	// ── buildExecuteBatchCallData ─────────────────────────────────────────

	describe('buildExecuteBatchCallData', () => {
		it('throws error for empty calls array', () => {
			expect(() => buildExecuteBatchCallData([], '0xTokenAddress', 100n)).toThrow(
				'At least one user call is required'
			);
		});

		it('returns encoded data for single call', () => {
			const result = buildExecuteBatchCallData(
				[{ to: '0xRecipient', data: '0xCalldata' }],
				'0xTokenAddress',
				1000n
			);
			expect(result).toBe('0xencodeddata');
		});

		it('returns encoded data for multiple calls', () => {
			const result = buildExecuteBatchCallData(
				[
					{ to: '0xRecipient1', data: '0xCalldata1', value: 100n },
					{ to: '0xRecipient2', data: '0xCalldata2', value: 200n }
				],
				'0xTokenAddress',
				500n
			);
			expect(result).toBe('0xencodeddata');
		});
	});

	// ── sendGasless ───────────────────────────────────────────────────────

	describe('sendGasless', () => {
		const mockCalls = [{ to: '0xRecipient', data: '0xCalldata' }];
		const mockEstimatedGas = {
			callGasLimit: 100_000n,
			verificationGasLimit: 50_000n,
			preVerificationGas: 10_000n
		};

		it('throws if wallet is not initialized', async () => {
			await expect(
				sendGasless(
					mockCalls,
					'0xTokenAddress',
					1000n,
					mockEstimatedGas,
					MOCK_SMART_ACCOUNT
				)
			).rejects.toThrow('Wallet not initialized');
		});

		it('successfully sends gasless transaction and returns userOpHash', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			const mockSignedOp = {
				sender: MOCK_ACCOUNT_ADDRESS,
				nonce: 0n,
				callData: '0xencodeddata',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 10_000n,
				maxFeePerGas: 1_000_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0xSig'
			};
			MOCK_SMART_ACCOUNT.signUserOperation.mockResolvedValue(mockSignedOp);

			mockGaslessRelay.mockResolvedValue({ userOpHash: '0xUserOpHash123' });

			const result = await sendGasless(
				mockCalls,
				'0xTokenAddress',
				1000n,
				mockEstimatedGas,
				MOCK_SMART_ACCOUNT
			);

			expect(result).toBe('0xUserOpHash123');
			expect(MOCK_SMART_ACCOUNT.signUserOperation).toHaveBeenCalled();
			expect(mockGaslessRelay).toHaveBeenCalledWith(
				expect.objectContaining({
					sender: MOCK_ACCOUNT_ADDRESS,
					userOp: expect.objectContaining({
						sender: MOCK_ACCOUNT_ADDRESS
					})
				})
			);
			expect(validateFeeBufferBounds).toHaveBeenCalled();
			expect(validateFeeRecipient).toHaveBeenCalled();
			expect(validateFeeParameters).toHaveBeenCalled();
		});

		it('serializes UserOp bigint fields as 0x-prefixed hex strings', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			const mockSignedOp = {
				sender: MOCK_ACCOUNT_ADDRESS,
				nonce: 42n,
				callData: '0xabcdef',
				callGasLimit: 5_000_000n,
				verificationGasLimit: 1_000_000n,
				preVerificationGas: 50_000n,
				maxFeePerGas: 1_000_000_000n,
				maxPriorityFeePerGas: 100_000_000n,
				paymasterAndData: '0x',
				signature: '0xdeadbeef'
			};
			MOCK_SMART_ACCOUNT.signUserOperation.mockResolvedValue(mockSignedOp);
			mockGaslessRelay.mockResolvedValue({ userOpHash: '0xHash' });

			await sendGasless(
				mockCalls,
				'0xTokenAddress',
				1000n,
				mockEstimatedGas,
				MOCK_SMART_ACCOUNT
			);

			const relayCall = mockGaslessRelay.mock.calls[0][0];
			const userOp = relayCall.userOp;

			// All bigint fields must be 0x-prefixed hex (backend DTO requirement)
			expect(userOp.nonce).toBe('0x2a');
			expect(userOp.callGasLimit).toBe('0x4c4b40');
			expect(userOp.verificationGasLimit).toBe('0xf4240');
			expect(userOp.preVerificationGas).toBe('0xc350');
			expect(userOp.maxFeePerGas).toBe('0x3b9aca00');
			expect(userOp.maxPriorityFeePerGas).toBe('0x5f5e100');

			// Non-bigint fields pass through unchanged
			expect(userOp.callData).toBe('0xabcdef');
			expect(userOp.paymasterAndData).toBe('0x');
			expect(userOp.signature).toBe('0xdeadbeef');
			expect(userOp.sender).toBe(MOCK_ACCOUNT_ADDRESS);
		});

		it('throws error when relay rejects', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			MOCK_SMART_ACCOUNT.signUserOperation.mockResolvedValue({
				sender: MOCK_ACCOUNT_ADDRESS,
				nonce: 0n,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 10_000n,
				maxFeePerGas: 1_000_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			});

			mockGaslessRelay.mockRejectedValue(new Error('Relay server error'));

			await expect(
				sendGasless(
					mockCalls,
					'0xTokenAddress',
					1000n,
					mockEstimatedGas,
					MOCK_SMART_ACCOUNT
				)
			).rejects.toThrow('Relay server error');
		});

		it('throws error when relay fails with network error', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			MOCK_SMART_ACCOUNT.signUserOperation.mockResolvedValue({
				sender: MOCK_ACCOUNT_ADDRESS,
				nonce: 0n,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 10_000n,
				maxFeePerGas: 1_000_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			});

			mockGaslessRelay.mockRejectedValue(new Error('Relay failed'));

			await expect(
				sendGasless(
					mockCalls,
					'0xTokenAddress',
					1000n,
					mockEstimatedGas,
					MOCK_SMART_ACCOUNT
				)
			).rejects.toThrow('Relay failed');
		});
	});

	// ── sendTokenProgrammatic ─────────────────────────────────────────────

	describe('sendTokenProgrammatic', () => {
		it('throws if wallet is not initialized', async () => {
			await expect(
				sendTokenProgrammatic(
					'0xTokenAddress',
					'0xRecipient',
					100n,
					10n,
					{ callGasLimit: 100_000n, verificationGasLimit: 50_000n, preVerificationGas: 10_000n },
					MOCK_SMART_ACCOUNT
				)
			).rejects.toThrow('Wallet not initialized');
		});

		it('sends token transfer via sendGasless', async () => {
			await gaslessWallet.init(MOCK_PRIVATE_KEY);

			MOCK_SMART_ACCOUNT.signUserOperation.mockResolvedValue({
				sender: MOCK_ACCOUNT_ADDRESS,
				nonce: 0n,
				callData: '0x',
				callGasLimit: 100_000n,
				verificationGasLimit: 50_000n,
				preVerificationGas: 10_000n,
				maxFeePerGas: 1_000_000_000n,
				maxPriorityFeePerGas: 10_000_000n,
				paymasterAndData: '0x',
				signature: '0x'
			});

			mockGaslessRelay.mockResolvedValue({ userOpHash: '0xTokenHash' });

			const result = await sendTokenProgrammatic(
				'0xTokenAddress',
				'0xRecipient',
				100n,
				10n,
				{ callGasLimit: 100_000n, verificationGasLimit: 50_000n, preVerificationGas: 10_000n },
				MOCK_SMART_ACCOUNT
			);

			expect(result).toBe('0xTokenHash');
		});
	});

	// ── estimateFee ───────────────────────────────────────────────────────

	describe('estimateFee', () => {
		it('returns fee estimate on success', async () => {
			const mockEstimate = {
				feeBuffer: '1000000',
				feeCostUSD: 0.01,
				feeTier: 'Low',
				totalWithBuffer: '1001000000'
			};
			mockGaslessEstimate.mockResolvedValue(mockEstimate);

			const result = await estimateFee('0xToken', 100n, '0xRecipient');

			expect(result).toEqual(mockEstimate);
			expect(mockGaslessEstimate).toHaveBeenCalledWith(
				expect.objectContaining({
					token: '0xToken',
					amount: '100',
					recipient: '0xRecipient'
				})
			);
		});

		it('throws the raw message for network fee too high error', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Network fee too high for this operation'));

			await expect(estimateFee('0xToken', 100n, '0xRecipient')).rejects.toThrow(
				'Network fee too high for this operation'
			);
		});

		it('throws generic error for other failures', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Token not found'));

			await expect(estimateFee('0xToken', 100n, '0xRecipient')).rejects.toThrow('Token not found');
		});

		it('throws default message on unexpected service error', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Fee estimation failed'));

			await expect(estimateFee('0xToken', 100n, '0xRecipient')).rejects.toThrow(
				'Fee estimation failed'
			);
		});
	});

	// ── checkSufficientBalance ────────────────────────────────────────────

	describe('checkSufficientBalance', () => {
		it('returns sufficient=true when balance >= required', async () => {
			mockReadContract.mockResolvedValue(1_000_000_000_000_000_000n); // 1 token

			const result = await checkSufficientBalance(
				'0xTokenAddress',
				'0xUserAddress',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n,
				'https://arb-mainnet.g.alchemy.com/v2/test'
			);

			expect(result.sufficient).toBe(true);
			expect(result.balance).toBe(1_000_000_000_000_000_000n);
			expect(result.required).toBe(600_000_000_000_000_000n);
			expect(mockReadContract).toHaveBeenCalled();
		});

		it('returns sufficient=false when balance < required', async () => {
			mockReadContract.mockResolvedValue(100_000_000_000_000_000n); // 0.1 token

			const result = await checkSufficientBalance(
				'0xTokenAddress',
				'0xUserAddress',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n,
				'https://arb-mainnet.g.alchemy.com/v2/test'
			);

			expect(result.sufficient).toBe(false);
			expect(result.balance).toBe(100_000_000_000_000_000n);
			expect(result.required).toBe(600_000_000_000_000_000n);
		});

		it('returns sufficient=true when balance exactly equals required', async () => {
			mockReadContract.mockResolvedValue(600_000_000_000_000_000n);

			const result = await checkSufficientBalance(
				'0xTokenAddress',
				'0xUserAddress',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n
			);

			expect(result.sufficient).toBe(true);
		});

		it('creates public client with provided rpcUrl', async () => {
			mockReadContract.mockResolvedValue(0n);

			await checkSufficientBalance(
				'0xTokenAddress',
				'0xUserAddress',
				100n,
				10n,
				'https://custom-rpc.example.com'
			);

			expect(mockCreatePublicClient).toHaveBeenCalledWith(
				expect.objectContaining({
					chain: expect.any(Object),
					transport: expect.any(String)
				})
			);
		});
	});
});
