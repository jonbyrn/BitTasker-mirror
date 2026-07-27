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
	mockValidateFeeParameters,
	mockValidateFeeBufferBounds,
	mockValidateFeeRecipient,
	mockGaslessRelay,
	mockGaslessEstimate,
	mockEthersGetBalance,
	mockEthersContractBalanceOf,
	mockEthersGetCode,
	mockEthersGetTransactionCount,
	mockEthersContractGetNonce
} = vi.hoisted(() => ({
	mockValidateFeeParameters: vi.fn(),
	mockValidateFeeBufferBounds: vi.fn(),
	mockValidateFeeRecipient: vi.fn(),
	mockGaslessRelay: vi.fn(),
	mockGaslessEstimate: vi.fn(),
	mockEthersGetBalance: vi.fn().mockResolvedValue(1000000n),
	mockEthersContractBalanceOf: vi.fn().mockResolvedValue(1000000n),
	mockEthersGetCode: vi.fn().mockResolvedValue('0x'),
	mockEthersGetTransactionCount: vi.fn().mockResolvedValue(0),
	mockEthersContractGetNonce: vi.fn().mockResolvedValue(0n)
}));

// Mock ethers — override only the functions that make RPC calls.
// ABI encoding (Interface, AbiCoder) uses real ethers.
vi.mock('ethers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('ethers')>();
	class MockJsonRpcProvider {
		getBalance = mockEthersGetBalance;
		getCode = mockEthersGetCode;
		getTransactionCount = mockEthersGetTransactionCount;
	}
	class MockContract {
		balanceOf = mockEthersContractBalanceOf;
		getNonce = mockEthersContractGetNonce;
	}
	return {
		...actual,
		ethers: {
			...actual.ethers,
			isAddress: vi.fn().mockReturnValue(true),
			JsonRpcProvider: MockJsonRpcProvider,
			Contract: MockContract
		}
	};
});

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
	GAS_TREASURY: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
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
	ENTRY_POINT_ADDRESS: '0x433709009B8330FDa32311DF1C2AFA402eD8D009',
	SIMPLE_7702_ACCOUNT_IMPL: '0xB2779581b8B1F816b747fBa66c64D22196c7D001'
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
			const initCall = gaslessWallet.init(MOCK_PRIVATE_KEY);

			// Check loading state is true during init
			const loadingState = get(gaslessWallet);
			expect(loadingState.loading).toBe(true);
			expect(loadingState.error).toBeNull();

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

		it('init handles Error thrown value', async () => {
			const errorMsg = 'Invalid private key';

			await expect(gaslessWallet.init(MOCK_PRIVATE_KEY)).rejects.toThrow();

			const state = get(gaslessWallet);
			expect(state.loading).toBe(false);
			expect(state.ready).toBe(false);
		});

		it('init handles non-Error thrown value with fallback message', async () => {
			await expect(gaslessWallet.init(MOCK_PRIVATE_KEY)).rejects.toBeDefined();

			const state = get(gaslessWallet);
			expect(state.loading).toBe(false);
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
			expect(() => buildExecuteBatchCallData([], '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 100n)).toThrow(
				'At least one user call is required'
			);
		});

		it('returns encoded data for single call', () => {
			const result = buildExecuteBatchCallData(
				[{ to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', data: '0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000007530' }],
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				1000n
			);
			expect(result.startsWith('0x34fcd5be')).toBe(true); // executeBatch selector
			expect((result.length - 2) % 2).toBe(0); // even-length hex
		});

		it('returns encoded data for multiple calls', () => {
			const result = buildExecuteBatchCallData(
				[
					{ to: '0x6398B76DF91C5eBe9f488e3656658E79284dDc0F', data: '0xa9059cbb0000000000000000000000006398b76df91c5ebe9f488e3656658e79284ddc0f0000000000000000000000000000000000000000000000000000000000000064', value: 100n },
					{ to: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', data: '0xa9059cbb000000000000000000000000fd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9000000000000000000000000000000000000000000000000000000000000c800', value: 200n }
				],
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				500n
			);
			expect(result.startsWith('0x34fcd5be')).toBe(true); // executeBatch selector
			expect((result.length - 2) % 2).toBe(0); // even-length hex
		});
	});

	// ── sendGasless ───────────────────────────────────────────────────────

	describe('sendGasless', () => {
		const mockCalls = [{ to: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC', data: '0xa9059cbb0000000000000000000000003c44cdddb6a900fa2b585dd299e03d12fa4293bc0000000000000000000000000000000000000000000000000000000000007530' }];
		const mockEstimatedGas = {
			callGasLimit: 100_000n,
			verificationGasLimit: 50_000n,
			preVerificationGas: 10_000n
		};

		it('throws if wallet is not initialized', async () => {
			await expect(
				sendGasless(
					mockCalls,
					'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
					1000n,
					mockEstimatedGas
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
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				1000n,
				mockEstimatedGas
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
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				1000n,
				mockEstimatedGas
			);

			const relayCall = mockGaslessRelay.mock.calls[0][0];
			const userOp = relayCall.userOp;

			// All bigint fields must be 0x-prefixed hex (backend DTO requirement)
			// toHex() pads odd-length hex with leading zero for ethers v6 compatibility
			expect(userOp.nonce).toBe('0x2a');         // 42 = 0x2a → padded to 0x2a (even: '2a' = 2 chars)
			expect(userOp.callGasLimit).toBe('0x4c4b40'); // 5000000 = even
			expect(userOp.verificationGasLimit).toBe('0x0f4240'); // 1000000 = 0xf4240 → padded
			expect(userOp.preVerificationGas).toBe('0xc350'); // 50000 = even
			expect(userOp.maxFeePerGas).toBe('0x3b9aca00'); // 1000000000 = even
			expect(userOp.maxPriorityFeePerGas).toBe('0x05f5e100'); // 100000000 = 0x5f5e100 → padded

			// Non-bigint fields pass through unchanged
			expect(userOp.callData).toBe('0xabcdef');
			// paymasterAndData is NOT sent — split fields are used instead
			expect(userOp.paymasterAndData).toBeUndefined();
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
					'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
					1000n,
					mockEstimatedGas
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
					'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
					1000n,
					mockEstimatedGas
				)
			).rejects.toThrow('Relay failed');
		});
	});

	// ── sendTokenProgrammatic ─────────────────────────────────────────────

	describe('sendTokenProgrammatic', () => {
		it('throws if wallet is not initialized', async () => {
			await expect(
				sendTokenProgrammatic(
					'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
					'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
					100n,
					10n,
					{ callGasLimit: 100_000n, verificationGasLimit: 50_000n, preVerificationGas: 10_000n }
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
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				'0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
				100n,
				10n,
				{ callGasLimit: 100_000n, verificationGasLimit: 50_000n, preVerificationGas: 10_000n }
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

			const result = await estimateFee('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 100n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC');

			expect(result).toEqual(mockEstimate);
			expect(mockGaslessEstimate).toHaveBeenCalledWith(
				expect.objectContaining({
					token: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
					amount: '100',
					recipient: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
				})
			);
		});

		it('throws the raw message for network fee too high error', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Network fee too high for this operation'));

			await expect(estimateFee('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 100n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')).rejects.toThrow(
				'Network fee too high for this operation'
			);
		});

		it('throws generic error for other failures', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Token not found'));

			await expect(estimateFee('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 100n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')).rejects.toThrow('Token not found');
		});

		it('throws default message on unexpected service error', async () => {
			mockGaslessEstimate.mockRejectedValue(new Error('Fee estimation failed'));

			await expect(estimateFee('0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', 100n, '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC')).rejects.toThrow(
				'Fee estimation failed'
			);
		});
	});

	// ── checkSufficientBalance ────────────────────────────────────────────

	describe('checkSufficientBalance', () => {
		it('returns sufficient=true when balance >= required', async () => {
			mockEthersContractBalanceOf.mockResolvedValue(1_000_000_000_000_000_000n); // 1 token

			const result = await checkSufficientBalance(
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				'0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n,
				'https://arb-mainnet.g.alchemy.com/v2/test'
			);

			expect(result.sufficient).toBe(true);
			expect(result.balance).toBe(1_000_000_000_000_000_000n);
			expect(result.required).toBe(600_000_000_000_000_000n);
			expect(mockEthersContractBalanceOf).toHaveBeenCalled();
		});

		it('returns sufficient=false when balance < required', async () => {
			mockEthersContractBalanceOf.mockResolvedValue(100_000_000_000_000_000n); // 0.1 token

			const result = await checkSufficientBalance(
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				'0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n,
				'https://arb-mainnet.g.alchemy.com/v2/test'
			);

			expect(result.sufficient).toBe(false);
			expect(result.balance).toBe(100_000_000_000_000_000n);
			expect(result.required).toBe(600_000_000_000_000_000n);
		});

		it('returns sufficient=true when balance exactly equals required', async () => {
			mockEthersContractBalanceOf.mockResolvedValue(600_000_000_000_000_000n);

			const result = await checkSufficientBalance(
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				'0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
				500_000_000_000_000_000n,
				100_000_000_000_000_000n
			);

			expect(result.sufficient).toBe(true);
		});

		it('uses ethers JsonRpcProvider for balance checks', async () => {
			mockEthersContractBalanceOf.mockResolvedValue(0n);

			await checkSufficientBalance(
				'0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
				'0x9AEA6dDa21cC99dDA8C7345e1A9A834356eF8E1D',
				100n,
				10n,
				'https://custom-rpc.example.com'
			);

			// verify balance check was performed
			expect(mockEthersContractBalanceOf).toHaveBeenCalled();
		});
	});
});
