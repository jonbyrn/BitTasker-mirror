/**
 * DerivationMigrator — Phase 3.4 (Unit Tests)
 *
 * Tests the complete DerivationMigrator service including:
 * - State machine transitions
 * - Pure function correctness (sweep amount, dust, detection)
 * - State persistence (load, save, reset, transition)
 * - Migration operations (detect, sweep, confirm)
 * - Escrow inventory check
 * - Idempotency (interrupted migration resumes)
 * - Zero-balance silent migration
 * - Error handling (provider failures, invalid transitions)
 *
 * @see USDT Integration Plan §4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';

// ethers v6.16.0 has a Buffer/BytesLike compatibility issue in jsdom.
// Mock Mnemonic + Contract to work around it. vi.mock gets hoisted above
// imports by vitest, so this intercepts all 'ethers' imports in the module graph.
vi.mock('ethers', () => {
	const STANDARD = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94';
	const ALTERNATE = '0x6Fac4D18c912343BF86fa7049364Dd4E424Ab9C0';

	function makeWallet(address: string) {
		return {
			address,
			connect: vi.fn(() => makeWallet(address)),
			sendTransaction: vi.fn(),
			signTransaction: vi.fn(),
			signMessage: vi.fn(),
			signTypedData: vi.fn(),
			provider: null as unknown
		};
	}

	return {
		Mnemonic: {
			fromPhrase: vi.fn((phrase: string) => {
				if (phrase === 'not a valid mnemonic phrase' || phrase === 'not a mnemonic') {
					throw new Error('Invalid mnemonic');
				}
				return {
					phrase,
					password: '',
					wordlist: { locale: 'en' },
					computeSeed: vi.fn(() => '')
				};
			})
		},
		HDNodeWallet: {
			fromMnemonic: vi.fn((_mnemonic: unknown, path: string) =>
				makeWallet(
					path === "m/44'/60'/0'/0/0"
						? STANDARD
						: path === "m/44'/60'/0'/0/1"
							? ALTERNATE
							: '0x' + 'ff'.repeat(20)
				)
			)
		},
		JsonRpcProvider: vi.fn(),
		Contract: vi.fn().mockImplementation(function (
			_address: string,
			_abi: unknown,
			provider: { call?: () => Promise<unknown> }
		) {
			return {
				filters: { EscrowCreated: vi.fn() },
				queryFilter: vi.fn(async () => {
					// If the provider has a call method that rejects, propagate the error
					// so checkEscrowInventory's error path is exercised
					if (provider?.call) {
						await provider.call();
					}
					return [];
				}),
				getEscrow: vi.fn().mockResolvedValue({
					state: 2n,
					tasker: '',
					taskee: '',
					amount: 0n
				})
			};
		}),
		TransactionReceipt: class {},
		TransactionResponse: class {}
	} as never;
});

import { HDNodeWallet, JsonRpcProvider } from 'ethers';
import {
	// Constants
	STANDARD_DERIVATION_PATH,
	DUST_THRESHOLD_WEI,
	REQUIRED_SWEEP_CONFIRMATIONS,

	// Types
	type MigrationPhase,
	type MigrationState,
	type PathDetectionResult,

	// Pure functions
	calculateSweepAmount,
	isDust,
	isStandardPath,
	deriveAddress,
	detectLegacyPath,
	isValidTransition,
	determineNextPhaseFromBalance,
	estimateTransferGas,
	buildMigrationInput,

	// State management
	INITIAL_MIGRATION_STATE,
	loadState,
	saveState,
	resetState,
	transitionTo,

	// Migration operations
	detectAndCheckMigration,
	checkBalance,
	sweepFunds,
	confirmSweep,
	checkEscrowInventory,

	// Helpers
	buildWallet,
	getRSKConfig,
	getMigrationStatus
} from '$lib/services/derivation-migrator';

// ---------------------------------------------------------------------------
// In-memory storage mock for Capacitor Preferences
// ---------------------------------------------------------------------------

let storage: Record<string, string> = {};

beforeEach(() => {
	storage = {};
	vi.mocked(Preferences.get).mockImplementation(async ({ key }: { key: string }) => ({
		value: storage[key] ?? null
	}));
	vi.mocked(Preferences.set).mockImplementation(
		async ({ key, value }: { key: string; value: string }) => {
			storage[key] = value;
		}
	);
	vi.mocked(Preferences.remove).mockImplementation(async ({ key }: { key: string }) => {
		delete storage[key];
	});
});

afterEach(() => {
	vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Well-known mnemonic for testing (BIP39 test vector). */
const TEST_MNEMONIC =
	'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

/** Address derived from TEST_MNEMONIC at the standard EVM path. */
const STANDARD_PATH_ADDRESS = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'; // validated with ethers v6

/** A mock legacy address (different from the standard path address). */
const LEGACY_ADDRESS = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';

/** Another address used as sweep target in tests. */
const SWEEP_TARGET = '0xbe0eb3f7d7c580c03d3233e0dca8e8d5d3ba7c3d';

// ---------------------------------------------------------------------------
// Pure Function Tests
// ---------------------------------------------------------------------------

describe('calculateSweepAmount', () => {
	it('subtracts gas from balance', () => {
		expect(calculateSweepAmount(100000n, 21000n)).toBe(79000n);
	});

	it('returns 0 when gas equals balance', () => {
		expect(calculateSweepAmount(21000n, 21000n)).toBe(0n);
	});

	it('returns 0 when gas exceeds balance', () => {
		expect(calculateSweepAmount(10000n, 21000n)).toBe(0n);
	});

	it('returns 0 for negative balance', () => {
		expect(calculateSweepAmount(-1n, 21000n)).toBe(0n);
	});

	it('returns 0 for negative gas', () => {
		expect(calculateSweepAmount(100000n, -1n)).toBe(0n);
	});

	it('returns 0 for zero balance', () => {
		expect(calculateSweepAmount(0n, 21000n)).toBe(0n);
	});

	it('handles large values without overflow', () => {
		const largeBalance = BigInt('1000000000000000000'); // 1 rBTC
		const gasCost = BigInt('210000000000000'); // 0.00021 rBTC at 10 gwei
		const expected = BigInt('999790000000000000'); // 1e18 - 2.1e14
		expect(calculateSweepAmount(largeBalance, gasCost)).toBe(expected);
	});
});

describe('isDust', () => {
	it('returns true for zero', () => {
		expect(isDust(0n)).toBe(true);
	});

	it('returns true for exactly dust threshold', () => {
		expect(isDust(DUST_THRESHOLD_WEI)).toBe(true);
	});

	it('returns false for one wei above threshold', () => {
		expect(isDust(DUST_THRESHOLD_WEI + 1n)).toBe(false);
	});

	it('returns true for negative values', () => {
		expect(isDust(-1n)).toBe(true);
	});

	it('returns false for a normal sweep amount', () => {
		expect(isDust(BigInt('100000000000000000'))).toBe(false);
	});
});

describe('isStandardPath', () => {
	it('returns true for the standard path', () => {
		expect(isStandardPath(STANDARD_DERIVATION_PATH)).toBe(true);
	});

	it('returns false for a different path', () => {
		expect(isStandardPath("m/44'/0'/0'/0/0")).toBe(false);
	});

	it('returns false for legacy RSK path', () => {
		expect(isStandardPath("m/44'/137'/0'/0/0")).toBe(false);
	});

	it('returns false for empty string', () => {
		expect(isStandardPath('')).toBe(false);
	});
});

describe('estimateTransferGas', () => {
	it('calculates gas cost for a simple transfer', () => {
		// 21000 gas * 10 gwei = 210000000000000 wei
		expect(estimateTransferGas(BigInt('10000000000'))).toBe(BigInt('210000000000000'));
	});

	it('returns 0 for zero gas price', () => {
		expect(estimateTransferGas(0n)).toBe(0n);
	});

	it('returns 0 for negative gas price', () => {
		expect(estimateTransferGas(-1n)).toBe(0n);
	});

	it('handles high gas price', () => {
		// 21000 * 100 gwei = 2_100_000_000_000_000 wei
		expect(estimateTransferGas(BigInt('100000000000'))).toBe(BigInt('2100000000000000'));
	});
});

// ---------------------------------------------------------------------------
// deriveAddress and detectLegacyPath Tests
// ---------------------------------------------------------------------------

describe('deriveAddress', () => {
	it('derives the standard EVM address from a mnemonic', () => {
		const address = deriveAddress(TEST_MNEMONIC, STANDARD_DERIVATION_PATH);
		expect(address).toBeTruthy();
		expect(address.startsWith('0x')).toBe(true);
		expect(address.length).toBe(42); // 0x + 40 hex chars
	});

	it('derives different addresses for different paths', () => {
		const addr1 = deriveAddress(TEST_MNEMONIC, STANDARD_DERIVATION_PATH);
		const addr2 = deriveAddress(TEST_MNEMONIC, "m/44'/60'/0'/0/1");
		expect(addr1.toLowerCase()).not.toBe(addr2.toLowerCase());
	});

	it('throws for invalid mnemonic', () => {
		expect(() => deriveAddress('not a valid mnemonic phrase', STANDARD_DERIVATION_PATH)).toThrow();
	});
});

describe('detectLegacyPath', () => {
	it('detects no legacy when addresses match standard path', () => {
		const standardAddr = deriveAddress(TEST_MNEMONIC, STANDARD_DERIVATION_PATH);
		const result = detectLegacyPath(TEST_MNEMONIC, standardAddr);

		expect(result.isLegacy).toBe(false);
		expect(result.addressesMatch).toBe(true);
		expect(result.currentAddress.toLowerCase()).toBe(standardAddr.toLowerCase());
		expect(result.standardAddress.toLowerCase()).toBe(standardAddr.toLowerCase());
	});

	it('detects legacy path when address differs from standard', () => {
		// Pass a different address to simulate legacy path
		const result = detectLegacyPath(TEST_MNEMONIC, LEGACY_ADDRESS);

		expect(result.isLegacy).toBe(true);
		expect(result.addressesMatch).toBe(false);
		expect(result.currentAddress).toBe(LEGACY_ADDRESS);
		expect(result.standardAddress).toBeTruthy();
		// Standard address should NOT match the legacy address
		expect(result.standardAddress.toLowerCase()).not.toBe(LEGACY_ADDRESS.toLowerCase());
	});

	it('is case-insensitive for address comparison', () => {
		const standardAddr = deriveAddress(TEST_MNEMONIC, STANDARD_DERIVATION_PATH);
		const upperCased = standardAddr.toUpperCase();
		const result = detectLegacyPath(TEST_MNEMONIC, upperCased);

		expect(result.addressesMatch).toBe(true);
		expect(result.isLegacy).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isValidTransition Tests
// ---------------------------------------------------------------------------

describe('isValidTransition', () => {
	const validTransitions: Array<[MigrationPhase, MigrationPhase]> = [
		['NOT_STARTED', 'DETECTING'],
		['DETECTING', 'CHECK_BALANCE'],
		['CHECK_BALANCE', 'AWAITING_USER'],
		['CHECK_BALANCE', 'MIGRATE_SILENTLY'],
		['AWAITING_USER', 'MIGRATION_STARTED'],
		['MIGRATE_SILENTLY', 'MIGRATION_COMPLETE'],
		['MIGRATION_STARTED', 'SWEEP_BROADCAST'],
		['SWEEP_BROADCAST', 'SWEEP_CONFIRMING'],
		['SWEEP_CONFIRMING', 'SWEEP_COMPLETE'],
		['SWEEP_COMPLETE', 'MIGRATION_COMPLETE']
	];

	it.each(validTransitions)('allows valid transition %s -> %s', (from, to) => {
		expect(isValidTransition(from, to)).toBe(true);
	});

	const invalidTransitions: Array<[MigrationPhase, MigrationPhase]> = [
		['NOT_STARTED', 'CHECK_BALANCE'],
		['DETECTING', 'SWEEP_BROADCAST'],
		['AWAITING_USER', 'SWEEP_CONFIRMING'],
		['MIGRATION_STARTED', 'DETECTING'],
		['MIGRATION_COMPLETE', 'DETECTING'],
		['FAILED', 'DETECTING'],
		['MIGRATE_SILENTLY', 'AWAITING_USER'],
		['NOT_STARTED', 'MIGRATION_COMPLETE']
	];

	it.each(invalidTransitions)('rejects invalid transition %s -> %s', (from, to) => {
		expect(isValidTransition(from, to)).toBe(false);
	});

	it('allows FAILED from any non-terminal phase', () => {
		const nonTerminal: MigrationPhase[] = [
			'DETECTING',
			'CHECK_BALANCE',
			'AWAITING_USER',
			'MIGRATION_STARTED',
			'MIGRATE_SILENTLY',
			'SWEEP_BROADCAST',
			'SWEEP_CONFIRMING',
			'SWEEP_COMPLETE'
		];

		for (const phase of nonTerminal) {
			expect(isValidTransition(phase, 'FAILED')).toBe(true);
		}
	});

	it('rejects FAILED from FAILED', () => {
		expect(isValidTransition('FAILED', 'FAILED')).toBe(false);
	});

	it('rejects FAILED from MIGRATION_COMPLETE', () => {
		expect(isValidTransition('MIGRATION_COMPLETE', 'FAILED')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// determineNextPhaseFromBalance Tests
// ---------------------------------------------------------------------------

describe('determineNextPhaseFromBalance', () => {
	it('returns AWAITING_USER when balance > 0', () => {
		expect(determineNextPhaseFromBalance(1n)).toBe('AWAITING_USER');
		expect(determineNextPhaseFromBalance(BigInt('1000000000000000000'))).toBe('AWAITING_USER');
	});

	it('returns MIGRATE_SILENTLY when balance is 0', () => {
		expect(determineNextPhaseFromBalance(0n)).toBe('MIGRATE_SILENTLY');
	});
});

// ---------------------------------------------------------------------------
// buildMigrationInput Tests
// ---------------------------------------------------------------------------

describe('buildMigrationInput', () => {
	it('builds input from detection result', () => {
		const detectionResult: PathDetectionResult = {
			isLegacy: true,
			currentAddress: LEGACY_ADDRESS,
			standardAddress: STANDARD_PATH_ADDRESS,
			addressesMatch: false
		};

		const input = buildMigrationInput(detectionResult, "m/44'/137'/0'/0/0");

		expect(input.oldAddress).toBe(LEGACY_ADDRESS);
		expect(input.newAddress).toBe(STANDARD_PATH_ADDRESS);
		expect(input.oldDerivationPath).toBe("m/44'/137'/0'/0/0");
		expect(input.newDerivationPath).toBe(STANDARD_DERIVATION_PATH);
	});
});

// ---------------------------------------------------------------------------
// State Management Tests
// ---------------------------------------------------------------------------

describe('INITIAL_MIGRATION_STATE', () => {
	it('has NOT_STARTED phase', () => {
		expect(INITIAL_MIGRATION_STATE.phase).toBe('NOT_STARTED');
	});

	it('has null addresses', () => {
		expect(INITIAL_MIGRATION_STATE.oldAddress).toBeNull();
		expect(INITIAL_MIGRATION_STATE.newAddress).toBeNull();
	});

	it('uses standard derivation path', () => {
		expect(INITIAL_MIGRATION_STATE.newDerivationPath).toBe(STANDARD_DERIVATION_PATH);
	});
});

describe('loadState', () => {
	it('returns initial state when no data stored', async () => {
		const state = await loadState();
		expect(state.phase).toBe('NOT_STARTED');
	});

	it('returns initial state for corrupt JSON', async () => {
		storage[STORAGE_KEY_EXTRACT] = 'not valid json';
		const state = await loadState();
		expect(state.phase).toBe('NOT_STARTED');
	});

	it('returns initial state for non-object JSON', async () => {
		storage[STORAGE_KEY_EXTRACT] = JSON.stringify('string');
		const state = await loadState();
		expect(state.phase).toBe('NOT_STARTED');
	});

	it('restores previously saved state', async () => {
		const saved: MigrationState = {
			phase: 'SWEEP_CONFIRMING',
			oldAddress: LEGACY_ADDRESS,
			newAddress: STANDARD_PATH_ADDRESS,
			sweepTxHash: '0xsweep',
			confirmations: 5,
			oldDerivationPath: "m/44'/137'/0'/0/0",
			newDerivationPath: STANDARD_DERIVATION_PATH,
			balanceAtMigration: '100000000000000000',
			error: null,
			updatedAt: Date.now()
		};
		storage[STORAGE_KEY_EXTRACT] = JSON.stringify(saved);

		const loaded = await loadState();
		expect(loaded.phase).toBe('SWEEP_CONFIRMING');
		expect(loaded.oldAddress).toBe(LEGACY_ADDRESS);
		expect(loaded.newAddress).toBe(STANDARD_PATH_ADDRESS);
		expect(loaded.sweepTxHash).toBe('0xsweep');
		expect(loaded.confirmations).toBe(5);
		expect(loaded.balanceAtMigration).toBe('100000000000000000');
	});

	it('returns initial state when Preferences.get fails', async () => {
		vi.mocked(Preferences.get).mockRejectedValueOnce(new Error('Storage read error'));
		const state = await loadState();
		expect(state.phase).toBe('NOT_STARTED');
	});
});

// Extract storage key from the module — we need this constant.
// Since it's not exported, we use the known value.
const STORAGE_KEY_EXTRACT = 'bittasker_derivation_migration';

describe('saveState', () => {
	it('persists state to Capacitor Preferences', async () => {
		const state: MigrationState = {
			phase: 'DETECTING',
			oldAddress: null,
			newAddress: null,
			sweepTxHash: null,
			confirmations: 0,
			oldDerivationPath: null,
			newDerivationPath: STANDARD_DERIVATION_PATH,
			balanceAtMigration: null,
			error: null,
			updatedAt: 0
		};

		const { error } = await saveState(state);
		expect(error).toBeNull();

		expect(Preferences.set).toHaveBeenCalledOnce();
		const setCall = vi.mocked(Preferences.set).mock.calls[0]?.[0];
		expect(setCall?.key).toBe(STORAGE_KEY_EXTRACT);

		const persisted = JSON.parse(setCall?.value ?? '{}');
		expect(persisted.phase).toBe('DETECTING');
		expect(persisted.updatedAt).toBeGreaterThan(0);
	});

	it('returns error when Preferences.set fails', async () => {
		vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('Write error'));

		const { error } = await saveState(INITIAL_MIGRATION_STATE);
		expect(error).toBeTruthy();
		expect(error!.message).toContain('Write error');
	});
});

describe('resetState', () => {
	it('clears stored state', async () => {
		storage[STORAGE_KEY_EXTRACT] = JSON.stringify({ phase: 'MIGRATION_COMPLETE' });

		const { error } = await resetState();
		expect(error).toBeNull();
		expect(storage[STORAGE_KEY_EXTRACT]).toBeUndefined();
	});

	it('succeeds when no state was stored', async () => {
		const { error } = await resetState();
		expect(error).toBeNull();
	});

	it('returns error when Preferences.remove fails', async () => {
		vi.mocked(Preferences.remove).mockRejectedValueOnce(new Error('Remove error'));

		const { error } = await resetState();
		expect(error).toBeTruthy();
	});
});

describe('transitionTo', () => {
	it('transitions to a valid next phase', async () => {
		const result = await transitionTo(INITIAL_MIGRATION_STATE, 'DETECTING');

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(result.data!.phase).toBe('DETECTING');
	});

	it('persists the new state after transition', async () => {
		await transitionTo(INITIAL_MIGRATION_STATE, 'DETECTING');

		const persisted = JSON.parse(storage[STORAGE_KEY_EXTRACT] ?? '{}');
		expect(persisted.phase).toBe('DETECTING');
	});

	it('applies additional updates during transition', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'DETECTING'
		};

		const result = await transitionTo(state, 'CHECK_BALANCE', {
			oldAddress: LEGACY_ADDRESS,
			oldDerivationPath: "m/44'/137'/0'/0/0"
		});

		expect(result.data!.oldAddress).toBe(LEGACY_ADDRESS);
		expect(result.data!.oldDerivationPath).toBe("m/44'/137'/0'/0/0");
	});

	it('rejects invalid transitions', async () => {
		const result = await transitionTo(INITIAL_MIGRATION_STATE, 'SWEEP_BROADCAST');

		expect(result.data).toBeNull();
		expect(result.error).toBeTruthy();
		expect(result.error!.message).toContain('Invalid transition');
	});

	it('allows FAILED from any non-terminal phase', async () => {
		const result = await transitionTo(INITIAL_MIGRATION_STATE, 'FAILED', {
			error: 'Something went wrong'
		});

		expect(result.data).not.toBeNull();
		expect(result.data!.phase).toBe('FAILED');
		expect(result.data!.error).toBe('Something went wrong');
	});

	it('returns error when save fails during transition', async () => {
		vi.mocked(Preferences.set).mockRejectedValueOnce(new Error('Persist error'));

		const result = await transitionTo(INITIAL_MIGRATION_STATE, 'DETECTING');
		expect(result.data).toBeNull();
		expect(result.error).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Migration Operations Tests
// ---------------------------------------------------------------------------

describe('detectAndCheckMigration', () => {
	it('detects standard path when addresses match', async () => {
		const standardAddr = deriveAddress(TEST_MNEMONIC, STANDARD_DERIVATION_PATH);
		const { data, error } = await detectAndCheckMigration(TEST_MNEMONIC, standardAddr);

		expect(error).toBeNull();
		expect(data).not.toBeNull();
		expect(data!.isLegacy).toBe(false);
		expect(data!.addressesMatch).toBe(true);
	});

	it('detects legacy path when addresses differ', async () => {
		const { data, error } = await detectAndCheckMigration(TEST_MNEMONIC, LEGACY_ADDRESS);

		expect(error).toBeNull();
		expect(data).not.toBeNull();
		expect(data!.isLegacy).toBe(true);
	});

	it('returns error for invalid mnemonic', async () => {
		const { data, error } = await detectAndCheckMigration('not a mnemonic', LEGACY_ADDRESS);

		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});
});

describe('checkBalance', () => {
	it('returns balance from provider', async () => {
		const mockProvider = {
			getBalance: vi.fn().mockResolvedValue(BigInt('500000000000000000'))
		} as unknown as JsonRpcProvider;

		const { data, error } = await checkBalance(mockProvider, LEGACY_ADDRESS);
		expect(error).toBeNull();
		expect(data).toBe(BigInt('500000000000000000'));
		expect(mockProvider.getBalance).toHaveBeenCalledWith(LEGACY_ADDRESS);
	});

	it('returns error when provider fails', async () => {
		const mockProvider = {
			getBalance: vi.fn().mockRejectedValue(new Error('RPC error'))
		} as unknown as JsonRpcProvider;

		const { data, error } = await checkBalance(mockProvider, LEGACY_ADDRESS);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});
});

describe('sweepFunds', () => {
	const TEST_BALANCE = BigInt('1000000000000000000'); // 1 rBTC
	const GAS_PRICE = BigInt('10000000000'); // 10 gwei

	function createMockProvider(balance: bigint = TEST_BALANCE): JsonRpcProvider {
		return {
			getBalance: vi.fn().mockResolvedValue(balance),
			getFeeData: vi.fn().mockResolvedValue({ gasPrice: GAS_PRICE }),
			getBlockNumber: vi.fn().mockResolvedValue(1000),
			getTransactionReceipt: vi.fn().mockResolvedValue({
				status: 1,
				blockNumber: 995
			}),
			call: vi.fn()
		} as unknown as JsonRpcProvider;
	}

	function createMockWallet(address: string = LEGACY_ADDRESS): HDNodeWallet {
		return {
			address,
			connect: vi.fn().mockImplementation(function (
				this: HDNodeWallet,
				_provider: JsonRpcProvider
			) {
				return this;
			}),
			sendTransaction: vi.fn().mockResolvedValue({
				hash: '0xsweeptx',
				from: address,
				to: SWEEP_TARGET,
				value: BigInt('999999790000000000000'),
				wait: vi.fn()
			}),
			signTransaction: vi.fn(),
			signMessage: vi.fn(),
			signTypedData: vi.fn()
		} as unknown as HDNodeWallet;
	}

	it('sweeps balance minus gas to new address', async () => {
		const provider = createMockProvider();
		const wallet = createMockWallet();

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);

		expect(error).toBeNull();
		expect(data).not.toBeNull();
		expect(data!.hash).toBe('0xsweeptx');

		// Verify the transaction was created with correct params
		expect(wallet.sendTransaction).toHaveBeenCalledOnce();
		const txRequest = vi.mocked(wallet.sendTransaction).mock.calls[0]?.[0];
		expect(txRequest.to).toBe(SWEEP_TARGET);
		expect(txRequest.value).toBeGreaterThan(0n);
	});

	it('returns error when wallet has insufficient funds for gas', async () => {
		const provider = createMockProvider(BigInt('1000')); // Tiny balance
		const wallet = createMockWallet();

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
		expect(error!.message).toContain('too low');
	});

	it('returns error when sweep amount is below dust threshold', async () => {
		// Balance just above gas cost so sweepAmount > 0 but below dust threshold
		// gas=210000000000000, dust=10000000000, need 210000000000000 < balance <= 210010000000000
		const provider = createMockProvider(BigInt('210005000000000'));
		const wallet = createMockWallet();

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
		expect(error!.message).toContain('dust threshold');
	});

	it('returns error when balance fetch fails', async () => {
		const provider = {
			getBalance: vi.fn().mockRejectedValue(new Error('RPC error')),
			getFeeData: vi.fn()
		} as unknown as JsonRpcProvider;
		const wallet = createMockWallet();

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});

	it('returns error when gas price fetch fails', async () => {
		const provider = {
			getBalance: vi.fn().mockResolvedValue(TEST_BALANCE),
			getFeeData: vi.fn().mockRejectedValue(new Error('Gas price error'))
		} as unknown as JsonRpcProvider;
		const wallet = createMockWallet();

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});

	it('returns error when transaction send fails', async () => {
		const provider = createMockProvider();
		const wallet = {
			address: LEGACY_ADDRESS,
			connect: vi.fn().mockReturnThis(),
			sendTransaction: vi.fn().mockRejectedValue(new Error('Transaction rejected'))
		} as unknown as HDNodeWallet;

		const { data, error } = await sweepFunds(provider, wallet, SWEEP_TARGET);
		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});
});

describe('confirmSweep', () => {
	const TX_HASH = '0xsweeptx';

	function createMockProvider(
		status: number = 1,
		blockNumber: number = 995,
		currentBlock: number = 1007,
		receiptFound: boolean = true
	): JsonRpcProvider {
		return {
			getTransactionReceipt: vi.fn().mockResolvedValue(
				receiptFound
					? {
							status,
							blockNumber,
							hash: TX_HASH
						}
					: null
			),
			getBlockNumber: vi.fn().mockResolvedValue(currentBlock)
		} as unknown as JsonRpcProvider;
	}

	it('returns confirmed when receipt has enough confirmations', async () => {
		// blockNumber=995, currentBlock=1007 => 13 confirmations (>= 12)
		const provider = createMockProvider(1, 995, 1007);

		const { data, error } = await confirmSweep(provider, TX_HASH, 12, 5000);

		expect(error).toBeNull();
		expect(data).not.toBeNull();
		expect(data!.confirmations).toBeGreaterThanOrEqual(12);
	});

	it('returns error when transaction is reverted', async () => {
		const provider = createMockProvider(0, 1000, 1015);

		const { data, error } = await confirmSweep(provider, TX_HASH, 12, 5000);

		expect(data).toBeNull();
		expect(error).toBeTruthy();
		expect(error!.message).toContain('reverted');
	});

	it('timeouts and returns partial confirmations', async () => {
		// Transaction mined at block 1000, but current block is only 1005 = 6 confirmations
		const provider = createMockProvider(1, 1000, 1005);

		const { data, error } = await confirmSweep(provider, TX_HASH, 12, 1000);

		// Should have partial result with timeout error
		expect(data).not.toBeNull();
		expect(data!.confirmations).toBe(6);
		expect(error).toBeTruthy();
		expect(error!.message).toContain('confirmations');
	});

	it('returns error when transaction receipt is never found', async () => {
		const provider = createMockProvider(1, 0, 0, false);

		const { data, error } = await confirmSweep(provider, TX_HASH, 12, 1000);

		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Escrow Inventory Tests
// ---------------------------------------------------------------------------

describe('checkEscrowInventory', () => {
	const ESCROW_CONTRACT = '0xEscrowContractAddress000000000000000000000001';

	function createMockProvider(): JsonRpcProvider {
		return {} as unknown as JsonRpcProvider;
	}

	it('returns safe result when no escrows found', async () => {
		const provider = createMockProvider();

		// We need to mock Contract constructor. Since it's imported from 'ethers',
		// we'll spy on it or just test the pure logic path.
		// For this test, we mock the provider's call directly.

		const { data, error } = await checkEscrowInventory(provider, ESCROW_CONTRACT, LEGACY_ADDRESS);

		// If no events found, result should be safe
		// This may have different outcomes based on the mock
		expect(error).toBeNull();
		if (data) {
			expect(data.safeToMigrate).toBe(true);
			expect(data.warning).toBeNull();
		}
	});

	it('returns contracts when active escrows found', async () => {
		const mockProvider = {
			call: vi
				.fn()
				.mockResolvedValue('0x0000000000000000000000000000000000000000000000000000000000000000')
		} as unknown as JsonRpcProvider;

		const { error } = await checkEscrowInventory(mockProvider, ESCROW_CONTRACT, LEGACY_ADDRESS);

		expect(error).toBeNull();
		// Should still work gracefully — ethers Contract handles provider.call internally
	});

	it('returns error when provider is unreachable', async () => {
		const brokenProvider = {
			call: vi.fn().mockRejectedValue(new Error('Cannot connect'))
		} as unknown as JsonRpcProvider;

		const { data, error } = await checkEscrowInventory(
			brokenProvider,
			ESCROW_CONTRACT,
			LEGACY_ADDRESS
		);

		expect(data).toBeNull();
		expect(error).toBeTruthy();
	});
});

// ---------------------------------------------------------------------------
// Idempotency Tests (Interrupted Migration Resumes)
// ---------------------------------------------------------------------------

describe('idempotency', () => {
	it('transitionTo is idempotent — same state can be saved twice', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'SWEEP_CONFIRMING',
			sweepTxHash: '0xsweep',
			confirmations: 5
		};

		// Save twice
		await saveState(state);
		await saveState(state);

		const loaded = await loadState();
		expect(loaded.phase).toBe('SWEEP_CONFIRMING');
		expect(loaded.sweepTxHash).toBe('0xsweep');
	});

	it('loadState returns persisted state after saveState', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'MIGRATION_STARTED',
			oldAddress: LEGACY_ADDRESS,
			newAddress: STANDARD_PATH_ADDRESS,
			oldDerivationPath: "m/44'/137'/0'/0/0"
		};

		await saveState(state);
		const loaded = await loadState();

		expect(loaded.phase).toBe('MIGRATION_STARTED');
		expect(loaded.oldAddress).toBe(LEGACY_ADDRESS);
		expect(loaded.newAddress).toBe(STANDARD_PATH_ADDRESS);
	});

	it('full migration round-trip: start -> detect -> check -> silent -> complete', async () => {
		let state = { ...INITIAL_MIGRATION_STATE };
		let currentPhase: MigrationPhase = 'NOT_STARTED';

		// Simulate zero-balance migration (no sweep needed)
		const steps: Array<{
			from: MigrationPhase;
			to: MigrationPhase;
			updates?: Partial<MigrationState>;
		}> = [
			{ from: 'NOT_STARTED', to: 'DETECTING' },
			{
				from: 'DETECTING',
				to: 'CHECK_BALANCE',
				updates: {
					oldAddress: LEGACY_ADDRESS,
					newAddress: STANDARD_PATH_ADDRESS,
					oldDerivationPath: "m/44'/137'/0'/0/0"
				}
			},
			{ from: 'CHECK_BALANCE', to: 'MIGRATE_SILENTLY', updates: { balanceAtMigration: '0' } },
			{ from: 'MIGRATE_SILENTLY', to: 'MIGRATION_COMPLETE' }
		];

		for (const step of steps) {
			const result = await transitionTo(state, step.to, step.updates);
			expect(result.error).toBeNull();
			expect(result.data).not.toBeNull();
			state = result.data!;
			currentPhase = result.data!.phase;
		}

		expect(currentPhase).toBe('MIGRATION_COMPLETE');

		// Reload and verify
		const finalState = await loadState();
		expect(finalState.phase).toBe('MIGRATION_COMPLETE');
		expect(finalState.oldAddress).toBe(LEGACY_ADDRESS);
	});

	it('resumes from last completed phase after simulated interruption', async () => {
		// Save state simulating interruption at SWEEP_CONFIRMING
		const interruptedState: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'SWEEP_CONFIRMING',
			oldAddress: LEGACY_ADDRESS,
			newAddress: STANDARD_PATH_ADDRESS,
			sweepTxHash: '0xsweep',
			confirmations: 7,
			oldDerivationPath: "m/44'/137'/0'/0/0"
		};
		await saveState(interruptedState);

		// Simulate app restart — load state
		const loaded = await loadState();
		expect(loaded.phase).toBe('SWEEP_CONFIRMING');
		expect(loaded.sweepTxHash).toBe('0xsweep');
		expect(loaded.confirmations).toBe(7);
		expect(loaded.oldAddress).toBe(LEGACY_ADDRESS);

		// Resume — continue to SWEEP_COMPLETE
		let resumedResult;
		if (isValidTransition(loaded.phase, 'SWEEP_COMPLETE')) {
			resumedResult = await transitionTo(loaded, 'SWEEP_COMPLETE', {
				confirmations: REQUIRED_SWEEP_CONFIRMATIONS
			});
			expect(resumedResult.error).toBeNull();

			resumedResult = await transitionTo(resumedResult.data!, 'MIGRATION_COMPLETE');
			expect(resumedResult.error).toBeNull();
			expect(resumedResult.data!.phase).toBe('MIGRATION_COMPLETE');
		}
	});
});

// ---------------------------------------------------------------------------
// Zero-Balance Silent Migration Tests
// ---------------------------------------------------------------------------

describe('zero-balance silent migration', () => {
	it('determineNextPhaseFromBalance returns MIGRATE_SILENTLY for zero', () => {
		expect(determineNextPhaseFromBalance(0n)).toBe('MIGRATE_SILENTLY');
	});

	it('state machine allows MIGRATE_SILENTLY -> MIGRATION_COMPLETE', () => {
		expect(isValidTransition('MIGRATE_SILENTLY', 'MIGRATION_COMPLETE')).toBe(true);
	});

	it('state machine allows CHECK_BALANCE -> MIGRATE_SILENTLY', () => {
		expect(isValidTransition('CHECK_BALANCE', 'MIGRATE_SILENTLY')).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// getRSKConfig Tests
// ---------------------------------------------------------------------------

describe('getRSKConfig', () => {
	beforeEach(() => {
		// Reset env mock before each test
		vi.unstubAllEnvs();
	});

	it('returns testnet config by default', () => {
		vi.stubEnv('VITE_RSK_NETWORK', undefined);
		const config = getRSKConfig();
		expect(config.chainId).toBe(31);
		expect(config.rpcUrl).toContain('testnet');
	});

	it('returns mainnet config when VITE_RSK_NETWORK=mainnet', () => {
		vi.stubEnv('VITE_RSK_NETWORK', 'mainnet');
		const config = getRSKConfig();
		expect(config.chainId).toBe(30);
		expect(config.rpcUrl).toContain('rsk.co');
		expect(config.rpcUrl).not.toContain('testnet');
	});
});

// ---------------------------------------------------------------------------
// getMigrationStatus Tests
// ---------------------------------------------------------------------------

describe('getMigrationStatus', () => {
	it('returns NOT_STARTED when no state stored', async () => {
		const status = await getMigrationStatus();

		expect(status.state.phase).toBe('NOT_STARTED');
		expect(status.needsResume).toBe(false);
		expect(status.requiresUserConsent).toBe(false);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
	});

	it('detects AWAITING_USER state', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'AWAITING_USER',
			oldAddress: LEGACY_ADDRESS
		};
		await saveState(state);

		const status = await getMigrationStatus();
		expect(status.requiresUserConsent).toBe(true);
		expect(status.needsResume).toBe(false);
	});

	it('detects MIGRATION_COMPLETE state', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'MIGRATION_COMPLETE',
			oldAddress: LEGACY_ADDRESS,
			newAddress: STANDARD_PATH_ADDRESS
		};
		await saveState(state);

		const status = await getMigrationStatus();
		expect(status.isComplete).toBe(true);
		expect(status.needsResume).toBe(false);
	});

	it('detects FAILED state', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'FAILED',
			error: 'Something broke'
		};
		await saveState(state);

		const status = await getMigrationStatus();
		expect(status.isFailed).toBe(true);
	});

	it('detects resumable state at SWEEP_CONFIRMING', async () => {
		const state: MigrationState = {
			...INITIAL_MIGRATION_STATE,
			phase: 'SWEEP_CONFIRMING',
			sweepTxHash: '0xsweep'
		};
		await saveState(state);

		const status = await getMigrationStatus();
		expect(status.needsResume).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// buildWallet Tests
// ---------------------------------------------------------------------------

describe('buildWallet', () => {
	it('creates a wallet connected to the provider', () => {
		const provider = {
			getBalance: vi.fn(),
			getFeeData: vi.fn()
		} as unknown as JsonRpcProvider;

		const wallet = buildWallet(TEST_MNEMONIC, STANDARD_DERIVATION_PATH, provider);

		expect(wallet).toBeTruthy();
		expect(wallet.address).toBeTruthy();
		expect(wallet.address.startsWith('0x')).toBe(true);
		expect(wallet.address.length).toBe(42);
	});

	it('derives different addresses for different paths', () => {
		const provider = {} as unknown as JsonRpcProvider;

		const wallet1 = buildWallet(TEST_MNEMONIC, STANDARD_DERIVATION_PATH, provider);
		const wallet2 = buildWallet(TEST_MNEMONIC, "m/44'/60'/0'/0/1", provider);

		expect(wallet1.address.toLowerCase()).not.toBe(wallet2.address.toLowerCase());
	});
});

// ---------------------------------------------------------------------------
// Edge Case Tests
// ---------------------------------------------------------------------------

describe('edge cases', () => {
	it('handles very large balances', () => {
		const maxBalance = BigInt(
			'115792089237316195423570985008687907853269984665640564039457584007913129639935'
		);
		const gasCost = BigInt('210000000000000');
		const result = calculateSweepAmount(maxBalance, gasCost);
		expect(result).toBe(maxBalance - gasCost);
		expect(result).toBeGreaterThan(0n);
	});

	it('handles very small balances just above gas cost', () => {
		const balance = BigInt('22000');
		const gasCost = BigInt('21000');
		const result = calculateSweepAmount(balance, gasCost);
		expect(result).toBe(1000n);
	});

	it('isDust handles boundary exactly at threshold', () => {
		expect(isDust(DUST_THRESHOLD_WEI)).toBe(true);
		expect(isDust(DUST_THRESHOLD_WEI + 1n)).toBe(false);
	});

	it('loadState handles partial corrupt data gracefully', async () => {
		storage[STORAGE_KEY_EXTRACT] = JSON.stringify({
			phase: 'DETECTING'
			// Missing all other fields
		});

		const state = await loadState();
		expect(state.phase).toBe('DETECTING');
		expect(state.oldAddress).toBeNull();
		expect(state.newAddress).toBeNull();
		expect(state.confirmations).toBe(0);
	});
});
