/**
 * EIP7702DelegationManager — Phase 2 Unit Tests
 *
 * Tests the core delegation manager:
 * - Pure functions: estimateGasCost, validateGasCost, formatTokenCost, state transitions
 * - Manager class: constructor, state machine, recovery flow, BNB fallback stub
 *
 * Uses mocked ethers provider, Sentry, and DelegationJournal.
 *
 * @see USDT Integration Plan §2.1
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JsonRpcProvider, Wallet } from 'ethers';
import {
	EIP7702DelegationManager,
	estimateGasCost,
	validateGasCost,
	formatTokenCost,
	isValidTransition,
	assertValidTransition,
	getValidTransitions,
	DelegationManagerError,
	type DelegationState,
	type GasCostParams,
	type GasValidationParams
} from '$lib/services/gas-abstraction/eip7702-delegation-manager';
import * as delegationJournal from '$lib/services/delegation-journal';
import { getStablecoinConfig } from '$lib/services/stablecoin-registry';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('ethers', () => ({
	JsonRpcProvider: vi.fn(),
	Interface: vi.fn(),
	Wallet: vi.fn()
}));

vi.mock('$lib/services/delegation-journal', () => ({
	addEntry: vi.fn().mockResolvedValue({ data: null, error: null }),
	updateEntry: vi.fn().mockResolvedValue({ data: null, error: null }),
	getIncompleteDelegations: vi.fn().mockResolvedValue({ data: [], error: null })
}));

vi.mock('$lib/services/gas-abstraction/sentry-breadcrumbs', () => ({
	logDelegationBreadcrumb: vi.fn(),
	logDelegationError: vi.fn()
}));

vi.mock('$lib/services/stablecoin-registry', () => ({
	getStablecoinConfig: vi.fn(),
	getSupportedChainIds: vi.fn(() => [56, 97])
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Type for the mock ethers provider used across tests.
 */
type MockProvider = {
	getBlockNumber: ReturnType<typeof vi.fn>;
	getFeeData: ReturnType<typeof vi.fn>;
	estimateGas: ReturnType<typeof vi.fn>;
	getBalance: ReturnType<typeof vi.fn>;
	getCode: ReturnType<typeof vi.fn>;
	waitForTransaction: ReturnType<typeof vi.fn>;
	getTransactionCount: ReturnType<typeof vi.fn>;
	broadcastTransaction: ReturnType<typeof vi.fn>;
};

/**
 * Create a mock ethers provider that returns sensible defaults.
 */
function createMockProvider(overrides?: {
	blockNumber?: number;
	gasPrice?: bigint;
	maxFeePerGas?: bigint;
	estimateGas?: bigint;
	balance?: bigint;
	getCode?: string;
	waitForTx?: { status: number; blockNumber: number };
}): MockProvider {
	const {
		blockNumber = 42_000_000,
		gasPrice = 3_000_000_000n,
		maxFeePerGas = 3_000_000_000n,
		estimateGas = 65_000n,
		balance = 10_000_000_000_000_000_000n, // 10 BNB
		getCode = '0x',
		waitForTx = { status: 1, blockNumber: 42_000_001 }
	} = overrides ?? {};

	const mockProvider = {
		getBlockNumber: vi.fn().mockResolvedValue(blockNumber),
		getFeeData: vi.fn().mockResolvedValue({
			gasPrice,
			maxFeePerGas,
			maxPriorityFeePerGas: 1_000_000_000n
		}),
		estimateGas: vi.fn().mockResolvedValue(estimateGas),
		getBalance: vi.fn().mockResolvedValue(balance),
		getCode: vi.fn().mockResolvedValue(getCode),
		waitForTransaction: vi.fn().mockResolvedValue(waitForTx),
		getTransactionCount: vi.fn().mockResolvedValue(100),
		broadcastTransaction: vi.fn().mockResolvedValue({ hash: '0xbroadcastmock' })
	};

	vi.mocked(JsonRpcProvider).mockReturnValue(mockProvider as unknown as JsonRpcProvider);

	return mockProvider;
}

/**
 * Create a mock journal entry for testing.
 */
function createMockJournalEntry(overrides?: Record<string, unknown>) {
	return {
		id: 'test-journal-id',
		chainId: 56,
		status: 'AUTH_SIGNING',
		senderAddress: '0xsender1234567890abcdef1234567890abcdef12',
		recipientAddress: '0xrecipient1234567890abcdef1234567890abcd',
		amount: '500.00',
		tokenSymbol: 'USDT',
		tx1Hash: null,
		tx2Hash: null,
		createdAt: Date.now(),
		updatedAt: Date.now(),
		completed: false,
		error: null,
		retryCount: 0,
		...overrides
	};
}

/**
 * Configure stablecoin registry mock for BSC mainnet.
 */
function mockStablecoinConfig(chainId: number = 56): void {
	vi.mocked(getStablecoinConfig).mockReturnValue({
		chainId,
		name: 'BSC Mainnet',
		symbol: 'BNB',
		rpcUrls: ['https://bsc-dataseed1.binance.org'],
		explorerUrl: 'https://bscscan.com',
		nativeCurrency: {
			name: 'BNB',
			symbol: 'BNB',
			decimals: 18
		},
		paymaster: {
			address: '0xpaymaster12345678901234567890123456789012'
		},
		usdt: {
			address: '0x55d398326f99059ff775485246999027b3197955',
			decimals: 18
		}
	} as unknown as ReturnType<typeof getStablecoinConfig>);
}

// ---------------------------------------------------------------------------
// Tests: estimateGasCost (pure function)
// ---------------------------------------------------------------------------

describe('estimateGasCost (pure)', () => {
	const baseParams: GasCostParams = {
		gasLimit: 65_000n,
		cleanupGasLimit: 21_000n,
		gasPrice: 3_000_000_000n, // 3 gwei
		usdtPerBnb: 600_000_000_000_000_000_000n, // 600 USDT/BNB
		bufferBps: 1200 // 20% buffer
	};

	it('computes correct total gas wei', () => {
		const result = estimateGasCost(baseParams);
		const expectedGas = 65_000n + 21_000n; // 86,000
		const expectedWei = expectedGas * 3_000_000_000n; // 258,000,000,000,000 wei
		expect(result.totalGasWei).toBe(expectedWei);
	});

	it('computes correct USDT cost', () => {
		const result = estimateGasCost(baseParams);
		// totalGasWei = 86,000 * 3e9 = 258,000,000,000,000
		// totalUsdtCost = 258,000,000,000,000 * 600e18 / 1e18 = 154,800,000,000,000,000
		const totalGasWei = 86_000n * 3_000_000_000n;
		const expectedUsdtCost = (totalGasWei * 600_000_000_000_000_000_000n) / 10n ** 18n;
		expect(result.totalUsdtCost).toBe(expectedUsdtCost);
	});

	it('applies buffer correctly (20% = 1200 bps)', () => {
		const result = estimateGasCost(baseParams);
		const expectedWithBuffer = (result.totalUsdtCost * 1200n) / 10000n;
		expect(result.costWithBuffer).toBe(expectedWithBuffer);
	});

	it('returns high confidence for buffer <= 1500', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 1000 });
		expect(result.confidence).toBe(0.95);
	});

	it('returns medium confidence for buffer between 1501 and 3000', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 2000 });
		expect(result.confidence).toBe(0.8);
	});

	it('returns low confidence for buffer > 3000', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 3500 });
		expect(result.confidence).toBe(0.6);
	});

	it('throws for negative gasLimit', () => {
		expect(() => estimateGasCost({ ...baseParams, gasLimit: -1n })).toThrow(DelegationManagerError);
	});

	it('throws for negative cleanupGasLimit', () => {
		expect(() => estimateGasCost({ ...baseParams, cleanupGasLimit: -1n })).toThrow(
			DelegationManagerError
		);
	});

	it('throws for negative gasPrice', () => {
		expect(() => estimateGasCost({ ...baseParams, gasPrice: -1n })).toThrow(DelegationManagerError);
	});

	it('throws for negative usdtPerBnb', () => {
		expect(() => estimateGasCost({ ...baseParams, usdtPerBnb: -1n })).toThrow(
			DelegationManagerError
		);
	});

	it('throws for bufferBps below 1000', () => {
		expect(() => estimateGasCost({ ...baseParams, bufferBps: 999 })).toThrow(
			DelegationManagerError
		);
	});

	it('throws for bufferBps above 5000', () => {
		expect(() => estimateGasCost({ ...baseParams, bufferBps: 5001 })).toThrow(
			DelegationManagerError
		);
	});

	it('handles zero gas limit', () => {
		const result = estimateGasCost({
			...baseParams,
			gasLimit: 0n,
			cleanupGasLimit: 0n
		});
		expect(result.totalGasWei).toBe(0n);
		expect(result.totalUsdtCost).toBe(0n);
		expect(result.costWithBuffer).toBe(0n);
	});

	it('handles very large gas values without overflow', () => {
		const result = estimateGasCost({
			...baseParams,
			gasLimit: 10_000_000n,
			gasPrice: 100_000_000_000n // 100 gwei
		});
		expect(result.totalGasWei).toBeGreaterThan(0n);
		expect(result.totalUsdtCost).toBeGreaterThan(0n);
	});

	it('boundary: bufferBps at minimum (1000)', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 1000 });
		const expected = (result.totalUsdtCost * 1000n) / 10000n;
		expect(result.costWithBuffer).toBe(expected);
	});

	it('boundary: bufferBps at maximum (5000)', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 5000 });
		const expected = (result.totalUsdtCost * 5000n) / 10000n;
		expect(result.costWithBuffer).toBe(expected);
	});

	it('boundary: bufferBps at exact threshold 1500', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 1500 });
		expect(result.confidence).toBe(0.95);
	});

	it('boundary: bufferBps at exact threshold 3000', () => {
		const result = estimateGasCost({ ...baseParams, bufferBps: 3000 });
		expect(result.confidence).toBe(0.8);
	});
});

// ---------------------------------------------------------------------------
// Tests: validateGasCost (pure function)
// ---------------------------------------------------------------------------

describe('validateGasCost (pure)', () => {
	const baseParams: GasValidationParams = {
		usdtBalance: 500_000_000n, // 500 USDT
		transferAmount: 100_000_000n, // 100 USDT
		estimatedGas: 20_000_000n // 0.02 USDT
	};

	it('returns sufficient when balance covers amount + gas', () => {
		const result = validateGasCost(baseParams);
		expect(result.sufficient).toBe(true);
		expect(result.shortfall).toBeNull();
		expect(result.requiredTotal).toBe(120_000_000n);
	});

	it('returns insufficient when balance cannot cover amount + gas', () => {
		const result = validateGasCost({
			usdtBalance: 50_000_000n, // 50 USDT
			transferAmount: 100_000_000n, // 100 USDT
			estimatedGas: 20_000_000n // 0.02 USDT
		});
		expect(result.sufficient).toBe(false);
		expect(result.shortfall).toBe(70_000_000n); // 120 - 50
	});

	it('returns exact when balance exactly equals required total', () => {
		const result = validateGasCost({
			usdtBalance: 120_000_000n,
			transferAmount: 100_000_000n,
			estimatedGas: 20_000_000n
		});
		expect(result.sufficient).toBe(true);
		expect(result.shortfall).toBeNull();
		expect(result.requiredTotal).toBe(120_000_000n);
	});

	it('handles zero estimated gas', () => {
		const result = validateGasCost({
			usdtBalance: 100_000_000n,
			transferAmount: 100_000_000n,
			estimatedGas: 0n
		});
		expect(result.sufficient).toBe(true);
		expect(result.requiredTotal).toBe(100_000_000n);
	});

	it('handles zero transfer amount', () => {
		const result = validateGasCost({
			usdtBalance: 20_000_000n,
			transferAmount: 0n,
			estimatedGas: 20_000_000n
		});
		expect(result.sufficient).toBe(true);
		expect(result.requiredTotal).toBe(20_000_000n);
	});

	it('handles zero balance', () => {
		const result = validateGasCost({
			usdtBalance: 0n,
			transferAmount: 100_000_000n,
			estimatedGas: 10_000n
		});
		expect(result.sufficient).toBe(false);
		expect(result.shortfall).toBe(100_010_000n);
	});

	it('handles very large numbers', () => {
		const result = validateGasCost({
			usdtBalance: 1_000_000_000_000_000_000n,
			transferAmount: 500_000_000_000_000_000n,
			estimatedGas: 1_000_000_000n
		});
		expect(result.sufficient).toBe(true);
	});

	it('throws for negative balance', () => {
		expect(() => validateGasCost({ ...baseParams, usdtBalance: -1n })).toThrow(
			DelegationManagerError
		);
	});

	it('throws for negative transfer amount', () => {
		expect(() => validateGasCost({ ...baseParams, transferAmount: -1n })).toThrow(
			DelegationManagerError
		);
	});

	it('throws for negative estimated gas', () => {
		expect(() => validateGasCost({ ...baseParams, estimatedGas: -1n })).toThrow(
			DelegationManagerError
		);
	});
});

// ---------------------------------------------------------------------------
// Tests: formatTokenCost (pure function)
// ---------------------------------------------------------------------------

describe('formatTokenCost (pure)', () => {
	it('formats a simple value', () => {
		expect(formatTokenCost(123_000_000_000_000_000_000n)).toBe('123');
	});

	it('formats a value with decimals', () => {
		expect(formatTokenCost(123_456_789_012_345_678_912n)).toBe('123.456789012345678912');
	});

	it('formats a sub-1 value', () => {
		expect(formatTokenCost(500_000_000_000_000_000n)).toBe('0.5');
	});

	it('returns "0" for zero', () => {
		expect(formatTokenCost(0n)).toBe('0');
	});

	it('formats a tiny value', () => {
		expect(formatTokenCost(1n)).toBe('0.000000000000000001');
	});

	it('handles custom decimals', () => {
		expect(formatTokenCost(123_456_789n, 6)).toBe('123.456789');
	});

	it('handles zero decimals', () => {
		expect(formatTokenCost(123n, 0)).toBe('123');
	});

	it('handles large values', () => {
		const value = 1_000_000_000_000_000_000_000_000_000_000_000_000_000n;
		expect(formatTokenCost(value)).toBe('1000000000000000000000');
	});

	it('throws for negative cost', () => {
		expect(() => formatTokenCost(-1n)).toThrow(DelegationManagerError);
	});

	it('throws for negative decimals', () => {
		expect(() => formatTokenCost(100n, -1)).toThrow(DelegationManagerError);
	});
});

// ---------------------------------------------------------------------------
// Tests: State transitions (pure functions)
// ---------------------------------------------------------------------------

describe('delegation state transitions (pure)', () => {
	it('allows IDLE -> AUTH_SIGNING', () => {
		expect(isValidTransition('IDLE', 'AUTH_SIGNING')).toBe(true);
	});

	it('allows TX1_MINED -> CLEANUP_NEEDED', () => {
		expect(isValidTransition('TX1_MINED', 'CLEANUP_NEEDED')).toBe(true);
	});

	it('allows TX1_MINED -> RECOVERY_NEEDED', () => {
		expect(isValidTransition('TX1_MINED', 'RECOVERY_NEEDED')).toBe(true);
	});

	it('allows RECOVERY_NEEDED -> TX2_SUBMITTED', () => {
		expect(isValidTransition('RECOVERY_NEEDED', 'TX2_SUBMITTED')).toBe(true);
	});

	it('allows RECOVERY_NEEDED -> CLEANUP_NEEDED', () => {
		expect(isValidTransition('RECOVERY_NEEDED', 'CLEANUP_NEEDED')).toBe(true);
	});

	it('allows the full happy path', () => {
		const happyPath: Array<[string, string]> = [
			['IDLE', 'AUTH_SIGNING'],
			['AUTH_SIGNING', 'AUTH_SIGNED'],
			['AUTH_SIGNED', 'TX1_SUBMITTED'],
			['TX1_SUBMITTED', 'TX1_MINED'],
			['TX1_MINED', 'CLEANUP_NEEDED'],
			['CLEANUP_NEEDED', 'TX2_SUBMITTED'],
			['TX2_SUBMITTED', 'TX2_MINED'],
			['TX2_MINED', 'IDLE']
		];
		for (const [from, to] of happyPath) {
			expect(isValidTransition(from as DelegationState, to as DelegationState)).toBe(true);
		}
	});

	it('disallows IDLE -> TX1_SUBMITTED (skipping signing)', () => {
		expect(isValidTransition('IDLE', 'TX1_SUBMITTED')).toBe(false);
	});

	it('allows IDLE -> RECOVERY_NEEDED (external recovery trigger)', () => {
		expect(isValidTransition('IDLE', 'RECOVERY_NEEDED')).toBe(true);
	});

	it('disallows AUTH_SIGNING -> TX1_MINED (skipping TX1_SUBMITTED)', () => {
		expect(isValidTransition('AUTH_SIGNING', 'TX1_MINED')).toBe(false);
	});

	it('disallows backwards transitions', () => {
		expect(isValidTransition('AUTH_SIGNED', 'AUTH_SIGNING')).toBe(false);
		expect(isValidTransition('TX1_MINED', 'AUTH_SIGNED')).toBe(false);
		expect(isValidTransition('TX2_MINED', 'TX2_SUBMITTED')).toBe(false);
	});

	it('assertValidTransition does not throw for valid', () => {
		expect(() => assertValidTransition('IDLE', 'AUTH_SIGNING')).not.toThrow();
	});

	it('assertValidTransition throws for invalid', () => {
		expect(() => assertValidTransition('IDLE', 'TX1_SUBMITTED')).toThrow(DelegationManagerError);
	});

	it('getValidTransitions returns correct destinations for IDLE', () => {
		const transitions = getValidTransitions('IDLE');
		expect(transitions).toEqual(['AUTH_SIGNING', 'RECOVERY_NEEDED']);
	});

	it('getValidTransitions returns correct destinations for TX1_MINED', () => {
		const transitions = getValidTransitions('TX1_MINED');
		expect(transitions).toContain('CLEANUP_NEEDED');
		expect(transitions).toContain('RECOVERY_NEEDED');
	});

	it('getValidTransitions returns empty for unknown state', () => {
		const transitions = getValidTransitions('UNKNOWN' as DelegationState);
		expect(transitions).toEqual([]);
	});

	it('assertValidTransition error message includes state names', () => {
		try {
			assertValidTransition('IDLE', 'TX1_SUBMITTED');
			expect.unreachable('Should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(DelegationManagerError);
			expect((err as DelegationManagerError).message).toContain('IDLE');
			expect((err as DelegationManagerError).message).toContain('TX1_SUBMITTED');
		}
	});
});

// ---------------------------------------------------------------------------
// Tests: EIP7702DelegationManager class
// ---------------------------------------------------------------------------

describe('EIP7702DelegationManager (class)', () => {
	let mockProvider: MockProvider;

	beforeEach(() => {
		vi.clearAllMocks();
		mockStablecoinConfig();
		mockProvider = createMockProvider();
		vi.mocked(delegationJournal.addEntry).mockResolvedValue({
			data: createMockJournalEntry() as unknown as Awaited<
				ReturnType<typeof delegationJournal.addEntry>
			>['data'],
			error: null
		});
		vi.mocked(delegationJournal.updateEntry).mockResolvedValue({
			data: createMockJournalEntry() as unknown as Awaited<
				ReturnType<typeof delegationJournal.updateEntry>
			>['data'],
			error: null
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// Constructor
	// -----------------------------------------------------------------------

	describe('constructor', () => {
		it('creates an instance with valid config', () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});
			expect(manager).toBeInstanceOf(EIP7702DelegationManager);
			expect(manager.getState()).toBe('IDLE');
		});

		it('throws for unsupported chain', () => {
			vi.mocked(getStablecoinConfig).mockReturnValueOnce(
				undefined as ReturnType<typeof getStablecoinConfig>
			);
			expect(
				() =>
					new EIP7702DelegationManager({
						chainId: 999,
						provider: mockProvider as unknown as JsonRpcProvider
					})
			).toThrow(DelegationManagerError);
		});
	});

	// -----------------------------------------------------------------------
	// Error types
	// -----------------------------------------------------------------------

	describe('DelegationManagerError', () => {
		it('creates error with message and code', () => {
			const err = new DelegationManagerError('test error', 'TEST_CODE', 'IDLE');
			expect(err.message).toBe('test error');
			expect(err.code).toBe('TEST_CODE');
			expect(err.state).toBe('IDLE');
			expect(err.name).toBe('DelegationManagerError');
		});

		it('creates error with default code', () => {
			const err = new DelegationManagerError('test error');
			expect(err.code).toBe('DELEGATION_MANAGER_ERROR');
		});

		it('creates error without state', () => {
			const err = new DelegationManagerError('test error');
			expect(err.state).toBeUndefined();
		});
	});

	// -----------------------------------------------------------------------
	// Accessors
	// -----------------------------------------------------------------------

	describe('accessors', () => {
		it('getState returns IDLE initially', () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});
			expect(manager.getState()).toBe('IDLE');
		});

		it('getJournalEntryId returns null initially', () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});
			expect(manager.getJournalEntryId()).toBeNull();
		});

		it('getSessionSnapshot returns a copy of the session', () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});
			const snapshot = manager.getSessionSnapshot();
			expect(snapshot.currentState).toBe('IDLE');
			expect(snapshot.journalEntryId).toBeNull();
			expect(snapshot.tx1Hash).toBeNull();
			expect(snapshot.tx2Hash).toBeNull();
		});
	});

	// -----------------------------------------------------------------------
	// estimateGasCost (instance method)
	// -----------------------------------------------------------------------

	describe('estimateGasCost (instance)', () => {
		it('returns gas estimate for a valid transaction', async () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			const estimate = await manager.estimateGasCost({
				to: '0xrecipient1234567890abcdef1234567890abcd',
				from: '0xsender1234567890abcdef1234567890abcdef12'
			});

			expect(estimate.gasLimit).toBe(65_000n);
			expect(estimate.gasPrice).toBe(3_000_000_000n);
			expect(estimate.totalTokenCost).toBeGreaterThan(0n);
			expect(estimate.confidence).toBeGreaterThan(0);
		});

		it('throws when gas price fetch fails', async () => {
			mockProvider.getFeeData.mockRejectedValueOnce(new Error('RPC error'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			await expect(manager.estimateGasCost({ to: '0x1234' })).rejects.toThrow(
				DelegationManagerError
			);
		});

		it('throws when gas estimation fails', async () => {
			mockProvider.estimateGas.mockRejectedValueOnce(new Error('Estimation failed'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			await expect(manager.estimateGasCost({ to: '0x1234' })).rejects.toThrow(
				DelegationManagerError
			);
		});
	});

	// -----------------------------------------------------------------------
	// Recovery flow
	// -----------------------------------------------------------------------

	describe('recoverDelegation', () => {
		it('returns recovered=true when on-chain code is empty', async () => {
			mockProvider.getCode.mockResolvedValue('0x');

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			const result = await manager.recoverDelegation('0xsender1234567890abcdef1234567890abcdef12');
			expect(result.recovered).toBe(true);
			expect(result.reason).toContain('empty');
		});

		it('returns recovered=false when getCode fails', async () => {
			mockProvider.getCode.mockRejectedValueOnce(new Error('RPC error'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			const result = await manager.recoverDelegation('0xsender1234567890abcdef1234567890abcdef12');
			expect(result.recovered).toBe(false);
			expect(result.reason).toContain('Failed to query');
		});

		it('returns recovered=false when all recovery paths exhausted', async () => {
			// Non-empty code triggers Tx2 submit which throws (not implemented)
			mockProvider.getCode.mockResolvedValue('0xdeadbeef');

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			const result = await manager.recoverDelegation('0xsender1234567890abcdef1234567890abcdef12');
			expect(result.recovered).toBe(false);
			expect(result.reason).toContain('exhausted');
		});
	});

	// -----------------------------------------------------------------------
	// Hidden BNB fallback
	// -----------------------------------------------------------------------

	describe('BNB fallback', () => {
		/**
		 * Helper to access the protected attemptBnbFallback method for testing.
		 */
		async function callAttemptBnbFallback(
			manager: EIP7702DelegationManager,
			tx: Record<string, string | undefined>
		): Promise<string | null> {
			const accessor = manager as unknown as {
				attemptBnbFallback(tx: Record<string, string | undefined>): Promise<string | null>;
			};
			return accessor.attemptBnbFallback(tx);
		}

		/**
		 * Create a mock wallet that looks like an ethers.Wallet for testing.
		 */
		function createMockWallet(): {
			address: string;
			signTransaction: ReturnType<typeof vi.fn>;
		} {
			return {
				address: '0xwallet123456789012345678901234567890123456',
				signTransaction: vi.fn().mockResolvedValue('0xsignedtransaction')
			};
		}

		/** Shared mock wallet reference for tests that need one. */
		let mockWallet: ReturnType<typeof createMockWallet>;

		beforeEach(() => {
			mockWallet = createMockWallet();
			// Provide broadcastTransaction on the mock provider
			mockProvider.broadcastTransaction = vi
				.fn()
				.mockResolvedValue({ hash: '0xbbroadcastedtxhash' });
		});

		it('returns null when no BNB fallback wallet is configured', async () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
		});

		it('returns null when the wallet address has zero BNB balance', async () => {
			mockProvider.getBalance.mockResolvedValue(0n);

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
			// signTransaction should not be called when balance is zero
			expect(mockWallet.signTransaction).not.toHaveBeenCalled();
		});

		it('returns null when the balance check throws', async () => {
			mockProvider.getBalance.mockRejectedValueOnce(new Error('RPC error'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
		});

		it('returns null when fee data fetch fails', async () => {
			mockProvider.getFeeData.mockRejectedValueOnce(new Error('RPC timeout'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
		});

		it('returns null when wallet has insufficient BNB for gas', async () => {
			// Balance of 1 wei is far below gas cost ~ 63,000 gwei = 63,000,000,000,000 wei
			mockProvider.getBalance.mockResolvedValue(1n);

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
			expect(mockWallet.signTransaction).not.toHaveBeenCalled();
		});

		it('returns tx hash on successful BNB fallback submission', async () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBe('0xbbroadcastedtxhash');
			expect(mockWallet.signTransaction).toHaveBeenCalledTimes(1);
			expect(mockProvider.broadcastTransaction).toHaveBeenCalledWith('0xsignedtransaction');
		});

		it('returns null when transaction signing fails', async () => {
			mockWallet.signTransaction.mockRejectedValueOnce(new Error('signing rejected'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
			expect(mockProvider.broadcastTransaction).not.toHaveBeenCalled();
		});

		it('returns null when broadcast fails', async () => {
			mockProvider.broadcastTransaction = vi.fn().mockRejectedValue(new Error('already known'));

			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient'
			});
			expect(result).toBeNull();
			expect(mockWallet.signTransaction).toHaveBeenCalledTimes(1);
		});

		it('uses the provided nonce when present in tx', async () => {
			const manager = new EIP7702DelegationManager({
				chainId: 56,
				provider: mockProvider as unknown as JsonRpcProvider,
				bnbFallbackWallet: mockWallet as unknown as Wallet
			});

			const result = await callAttemptBnbFallback(manager, {
				to: '0xrecipient',
				nonce: '42'
			});
			expect(result).toBe('0xbbroadcastedtxhash');
			// getTransactionCount should NOT be called when nonce is provided
			expect(mockProvider.getTransactionCount).not.toHaveBeenCalled();
		});
	});
});
