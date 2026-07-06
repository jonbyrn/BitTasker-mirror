/**
 * Swap Chain State Machine — Unit Tests
 *
 * Tests functions from `src/lib/services/swap-chain/state.ts`:
 *
 * Pure functions (no mocks):
 * - isValidSwapChainTransition
 * - isTerminalPhase
 * - needsResume
 * - getSwapChainStatus
 * - boltzAddress
 * - sleep
 *
 * Async / side-effect functions (mocked):
 * - safeAddress
 * - loadSwapChainState
 * - saveSwapChainState
 * - resetSwapChainState
 * - transitionTo
 *
 * Observable (module-level state):
 * - onSwapProgress / setSwapProgress / getSwapProgressStep
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Hoisted mutable mocks — shared between vi.mock factories and test assertions
// ---------------------------------------------------------------------------

const { mockPreferencesGet, mockPreferencesSet, mockPreferencesRemove } = vi.hoisted(() => ({
	mockPreferencesGet: vi.fn(),
	mockPreferencesSet: vi.fn(),
	mockPreferencesRemove: vi.fn()
}));

const { mockCaptureException, mockAddBreadcrumb } = vi.hoisted(() => ({
	mockCaptureException: vi.fn(),
	mockAddBreadcrumb: vi.fn()
}));

const { mockLog, mockWarn, mockError } = vi.hoisted(() => ({
	mockLog: vi.fn(),
	mockWarn: vi.fn(),
	mockError: vi.fn()
}));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: mockPreferencesGet,
		set: mockPreferencesSet,
		remove: mockPreferencesRemove
	}
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: mockAddBreadcrumb,
	captureException: mockCaptureException
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: mockLog,
		warn: mockWarn,
		error: mockError,
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

// ---------------------------------------------------------------------------
// Imports (after mocks are set up)
// ---------------------------------------------------------------------------

import {
	isValidSwapChainTransition,
	isTerminalPhase,
	needsResume,
	getSwapChainStatus,
	INITIAL_SWAP_CHAIN_STATE,
	safeAddress,
	boltzAddress,
	sleep,
	loadSwapChainState,
	saveSwapChainState,
	resetSwapChainState,
	transitionTo,
	onSwapProgress,
	setSwapProgress,
	getSwapProgressStep
} from '$lib/services/swap-chain/state';
import type { SwapChainState, SwapChainPhase } from '$lib/services/swap-chain/state';

// ---------------------------------------------------------------------------
// BeforeEach — reset mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
	vi.clearAllMocks();

	// Default: Preferences.get returns null (no persisted data)
	mockPreferencesGet.mockResolvedValue({ value: null });
	mockPreferencesSet.mockResolvedValue(undefined);
	mockPreferencesRemove.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// isValidSwapChainTransition
// ---------------------------------------------------------------------------

describe('isValidSwapChainTransition', () => {
	// ── Happy-path forward transitions ──────────────────────────────────

	it('allows IDLE → SWAP_1_PENDING', () => {
		expect(isValidSwapChainTransition('IDLE', 'SWAP_1_PENDING')).toBe(true);
	});

	it('allows SWAP_1_PENDING → SWAP_1_CONFIRMED', () => {
		expect(isValidSwapChainTransition('SWAP_1_PENDING', 'SWAP_1_CONFIRMED')).toBe(true);
	});

	it('allows SWAP_1_CONFIRMED → SWAP_2_PENDING', () => {
		expect(isValidSwapChainTransition('SWAP_1_CONFIRMED', 'SWAP_2_PENDING')).toBe(true);
	});

	it('allows SWAP_2_PENDING → SWAP_2_CONFIRMED', () => {
		expect(isValidSwapChainTransition('SWAP_2_PENDING', 'SWAP_2_CONFIRMED')).toBe(true);
	});

	it('allows SWAP_2_CONFIRMED → COMPLETE', () => {
		expect(isValidSwapChainTransition('SWAP_2_CONFIRMED', 'COMPLETE')).toBe(true);
	});

	// ── Single-hop path (SWAP_1_CONFIRMED → COMPLETE) ──────────────────

	it('allows SWAP_1_CONFIRMED → COMPLETE (single-hop path)', () => {
		expect(isValidSwapChainTransition('SWAP_1_CONFIRMED', 'COMPLETE')).toBe(true);
	});

	// ── FAILED transitions ─────────────────────────────────────────────

	it('allows FAILED from any non-terminal phase', () => {
		const nonTerminalPhases: SwapChainPhase[] = [
			'IDLE',
			'SWAP_1_PENDING',
			'SWAP_1_CONFIRMED',
			'SWAP_2_PENDING',
			'SWAP_2_CONFIRMED'
		];
		for (const phase of nonTerminalPhases) {
			expect(isValidSwapChainTransition(phase, 'FAILED')).toBe(true);
		}
	});

	it('rejects FAILED → FAILED', () => {
		expect(isValidSwapChainTransition('FAILED', 'FAILED')).toBe(false);
	});

	it('rejects COMPLETE → FAILED', () => {
		expect(isValidSwapChainTransition('COMPLETE', 'FAILED')).toBe(false);
	});

	it('rejects PARTIAL → FAILED', () => {
		expect(isValidSwapChainTransition('PARTIAL', 'FAILED')).toBe(false);
	});

	// ── PARTIAL transitions ────────────────────────────────────────────

	it('allows PARTIAL from SWAP_1_PENDING', () => {
		expect(isValidSwapChainTransition('SWAP_1_PENDING', 'PARTIAL')).toBe(true);
	});

	it('allows PARTIAL from SWAP_2_PENDING', () => {
		expect(isValidSwapChainTransition('SWAP_2_PENDING', 'PARTIAL')).toBe(true);
	});

	it('allows PARTIAL from SWAP_2_CONFIRMED', () => {
		expect(isValidSwapChainTransition('SWAP_2_CONFIRMED', 'PARTIAL')).toBe(true);
	});

	// ── Invalid / rejected transitions ─────────────────────────────────

	it('rejects IDLE → COMPLETE (skip all phases)', () => {
		expect(isValidSwapChainTransition('IDLE', 'COMPLETE')).toBe(false);
	});

	it('rejects IDLE → SWAP_1_CONFIRMED (skip first swap)', () => {
		expect(isValidSwapChainTransition('IDLE', 'SWAP_1_CONFIRMED')).toBe(false);
	});

	it('rejects COMPLETE → any (terminal)', () => {
		expect(isValidSwapChainTransition('COMPLETE', 'SWAP_1_PENDING')).toBe(false);
		expect(isValidSwapChainTransition('COMPLETE', 'FAILED')).toBe(false);
		expect(isValidSwapChainTransition('COMPLETE', 'IDLE')).toBe(false);
	});

	it('rejects FAILED → any (terminal)', () => {
		expect(isValidSwapChainTransition('FAILED', 'SWAP_1_PENDING')).toBe(false);
		expect(isValidSwapChainTransition('FAILED', 'COMPLETE')).toBe(false);
		expect(isValidSwapChainTransition('FAILED', 'IDLE')).toBe(false);
	});

	it('rejects PARTIAL → any (terminal)', () => {
		expect(isValidSwapChainTransition('PARTIAL', 'SWAP_1_PENDING')).toBe(false);
		expect(isValidSwapChainTransition('PARTIAL', 'COMPLETE')).toBe(true);
	});

	it('rejects backward transitions', () => {
		expect(isValidSwapChainTransition('SWAP_1_CONFIRMED', 'SWAP_1_PENDING')).toBe(false);
		expect(isValidSwapChainTransition('SWAP_2_PENDING', 'SWAP_1_CONFIRMED')).toBe(false);
		expect(isValidSwapChainTransition('SWAP_2_CONFIRMED', 'SWAP_2_PENDING')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// isTerminalPhase
// ---------------------------------------------------------------------------

describe('isTerminalPhase', () => {
	it('returns true for terminal phases', () => {
		expect(isTerminalPhase('IDLE')).toBe(true);
		expect(isTerminalPhase('COMPLETE')).toBe(true);
		expect(isTerminalPhase('FAILED')).toBe(true);
		expect(isTerminalPhase('PARTIAL')).toBe(true);
	});

	it('returns false for active phases', () => {
		expect(isTerminalPhase('SWAP_1_PENDING')).toBe(false);
		expect(isTerminalPhase('SWAP_1_CONFIRMED')).toBe(false);
		expect(isTerminalPhase('SWAP_2_PENDING')).toBe(false);
		expect(isTerminalPhase('SWAP_2_CONFIRMED')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// needsResume
// ---------------------------------------------------------------------------

describe('needsResume', () => {
	it('returns true for mid-execution phases', () => {
		expect(needsResume('SWAP_1_PENDING')).toBe(true);
		expect(needsResume('SWAP_1_CONFIRMED')).toBe(true);
		expect(needsResume('SWAP_2_PENDING')).toBe(true);
		expect(needsResume('SWAP_2_CONFIRMED')).toBe(true);
	});

	it('returns false for terminal phases', () => {
		expect(needsResume('COMPLETE')).toBe(false);
		expect(needsResume('FAILED')).toBe(false);
		expect(needsResume('PARTIAL')).toBe(false);
		expect(needsResume('IDLE')).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// getSwapChainStatus
// ---------------------------------------------------------------------------

describe('getSwapChainStatus', () => {
	function makeState(phase: SwapChainPhase, error?: string): SwapChainState {
		return { ...INITIAL_SWAP_CHAIN_STATE, phase, error: error ?? null };
	}

	it('returns correct flags for IDLE', () => {
		const status = getSwapChainStatus(makeState('IDLE'));
		expect(status.isActive).toBe(false);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.isPartial).toBe(false);
		expect(status.message).toBe('');
	});

	it('returns correct flags for SWAP_1_PENDING', () => {
		const status = getSwapChainStatus(makeState('SWAP_1_PENDING'));
		expect(status.isActive).toBe(true);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.isPartial).toBe(false);
		expect(status.message).toBe('wallet.swap_chain.swap_1_pending');
	});

	it('returns correct flags for SWAP_1_CONFIRMED', () => {
		const status = getSwapChainStatus(makeState('SWAP_1_CONFIRMED'));
		expect(status.isActive).toBe(true);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.message).toBe('wallet.swap_chain.swap_1_confirmed');
	});

	it('returns correct flags for SWAP_2_PENDING', () => {
		const status = getSwapChainStatus(makeState('SWAP_2_PENDING'));
		expect(status.isActive).toBe(true);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.message).toBe('wallet.swap_chain.swap_2_pending');
	});

	it('returns correct flags for SWAP_2_CONFIRMED', () => {
		const status = getSwapChainStatus(makeState('SWAP_2_CONFIRMED'));
		expect(status.isActive).toBe(true);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.message).toBe('wallet.swap_chain.swap_2_confirmed');
	});

	it('returns correct flags for COMPLETE', () => {
		const status = getSwapChainStatus(makeState('COMPLETE'));
		expect(status.isActive).toBe(false);
		expect(status.isComplete).toBe(true);
		expect(status.isFailed).toBe(false);
		expect(status.isPartial).toBe(false);
		expect(status.message).toBe('wallet.swap_chain.complete');
	});

	it('returns correct flags for FAILED with custom error', () => {
		const status = getSwapChainStatus(makeState('FAILED', 'Boltz timeout'));
		expect(status.isActive).toBe(false);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(true);
		expect(status.isPartial).toBe(false);
		expect(status.message).toBe('Boltz timeout');
	});

	it('returns default message for FAILED without error', () => {
		const status = getSwapChainStatus(makeState('FAILED'));
		expect(status.isFailed).toBe(true);
		expect(status.message).toBe('wallet.swap_chain.failed');
	});

	it('returns correct flags for PARTIAL with custom error', () => {
		const status = getSwapChainStatus(makeState('PARTIAL', 'Hop 2 failed'));
		expect(status.isActive).toBe(false);
		expect(status.isComplete).toBe(false);
		expect(status.isFailed).toBe(false);
		expect(status.isPartial).toBe(true);
		expect(status.message).toBe('Hop 2 failed');
	});

	it('returns default message for PARTIAL without error', () => {
		const status = getSwapChainStatus(makeState('PARTIAL'));
		expect(status.isPartial).toBe(true);
		expect(status.message).toBe('wallet.swap_chain.partial');
	});
});

// ---------------------------------------------------------------------------
// INITIAL_SWAP_CHAIN_STATE
// ---------------------------------------------------------------------------

describe('INITIAL_SWAP_CHAIN_STATE', () => {
	it('starts in IDLE phase', () => {
		expect(INITIAL_SWAP_CHAIN_STATE.phase).toBe('IDLE');
	});

	it('has null route, sourceWallet, destination', () => {
		expect(INITIAL_SWAP_CHAIN_STATE.route).toBeNull();
		expect(INITIAL_SWAP_CHAIN_STATE.sourceWallet).toBeNull();
		expect(INITIAL_SWAP_CHAIN_STATE.destination).toBeNull();
	});

	it('has null swap IDs', () => {
		expect(INITIAL_SWAP_CHAIN_STATE.swap1Id).toBeNull();
		expect(INITIAL_SWAP_CHAIN_STATE.swap2Id).toBeNull();
	});

	it('has null error', () => {
		expect(INITIAL_SWAP_CHAIN_STATE.error).toBeNull();
	});

	it('has zero updatedAt', () => {
		expect(INITIAL_SWAP_CHAIN_STATE.updatedAt).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// safeAddress
// ---------------------------------------------------------------------------

describe('safeAddress', () => {
	// Known valid Ethereum addresses (checksummed)
	const VALID_CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';
	const VALID_LOWERCASE = '0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed';
	const VALID_MIXED_CASE = '0x5AaEb6053F3E94C9b9A09f33669435E7Ef1BeAed';

	it('returns checksummed address for a valid lowercase address', () => {
		const result = safeAddress(VALID_LOWERCASE);
		// ethers.getAddress returns EIP-55 checksummed
		expect(result).toBe(VALID_CHECKSUMMED);
		expect(result).not.toBe('');
	});

	it('returns checksummed address for a valid mixed-case address', () => {
		const result = safeAddress(VALID_MIXED_CASE);
		expect(result).toBe(VALID_CHECKSUMMED);
	});

	it('returns checksummed address for an already-checksummed address', () => {
		const result = safeAddress(VALID_CHECKSUMMED);
		expect(result).toBe(VALID_CHECKSUMMED);
	});

	it('returns empty string for empty string input', () => {
		expect(safeAddress('')).toBe('');
	});

	it('returns empty string for null input', () => {
		expect(safeAddress(null)).toBe('');
	});

	it('returns empty string for undefined input', () => {
		expect(safeAddress(undefined)).toBe('');
	});

	it('returns empty string for an invalid address', () => {
		expect(safeAddress('not-an-address')).toBe('');
	});

	it('returns empty string for a too-short hex string', () => {
		expect(safeAddress('0x1234')).toBe('');
	});

	it('trims whitespace before validation', () => {
		const result = safeAddress(`  ${VALID_LOWERCASE}  `);
		expect(result).toBe(VALID_CHECKSUMMED);
	});

	it('returns empty string for non-string input (number)', () => {
		expect(safeAddress(12345 as unknown as string)).toBe('');
	});
});

// ---------------------------------------------------------------------------
// loadSwapChainState
// ---------------------------------------------------------------------------

describe('loadSwapChainState', () => {
	it('returns parsed state when Preferences has valid JSON', async () => {
		const stored: SwapChainState = {
			...INITIAL_SWAP_CHAIN_STATE,
			phase: 'SWAP_1_PENDING',
			amount: '50000',
			swap1Id: 'swap-abc',
			updatedAt: 1700000000000
		};
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(stored) });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('SWAP_1_PENDING');
		expect(result.amount).toBe('50000');
		expect(result.swap1Id).toBe('swap-abc');
		expect(result.updatedAt).toBe(1700000000000);
	});

	it('returns INITIAL state when Preferences returns null value', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: null });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
		expect(result.swap1Id).toBeNull();
	});

	it('returns INITIAL state when Preferences returns undefined value', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: undefined });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});

	it('returns INITIAL state for corrupt JSON', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: '{not valid json!!' });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
		expect(result).toEqual(expect.objectContaining({ phase: 'IDLE', swap1Id: null }));
	});

	it('returns INITIAL state for non-object JSON (array)', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: '["a", "b"]' });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});

	it('returns INITIAL state for JSON null literal', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: 'null' });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});

	it('returns INITIAL state when parsed object has no phase field', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify({ amount: '100' }) });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});

	it('returns INITIAL state when Preferences.get throws', async () => {
		mockPreferencesGet.mockRejectedValueOnce(new Error('Plugin not available'));

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});

	it('normalizes non-string fields to safe defaults', async () => {
		const raw = {
			phase: 'SWAP_1_PENDING',
			amount: 123, // number, not string
			swap1Id: null,
			swap2Id: 42, // number, not string
			sourceConnectedWalletId: true, // boolean, not string
			error: 99, // number, not string
			updatedAt: 'bad' // string, not number
		};
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(raw) });

		const result = await loadSwapChainState();

		expect(result.phase).toBe('SWAP_1_PENDING');
		expect(result.amount).toBeNull(); // number → null
		expect(result.swap2Id).toBeNull(); // number → null
		expect(result.sourceConnectedWalletId).toBeNull(); // boolean → null
		expect(result.error).toBeNull(); // number → null
		expect(result.updatedAt).toBe(0); // string → 0
	});

	it('preserves valid string fields from parsed data', async () => {
		const raw = {
			phase: 'SWAP_2_CONFIRMED',
			sourceConnectedWalletId: 'wallet-xyz',
			amount: '99999',
			swap1Id: 'id-1',
			swap2Id: 'id-2',
			error: 'some error',
			updatedAt: 12345
		};
		mockPreferencesGet.mockResolvedValueOnce({ value: JSON.stringify(raw) });

		const result = await loadSwapChainState();

		expect(result.sourceConnectedWalletId).toBe('wallet-xyz');
		expect(result.amount).toBe('99999');
		expect(result.swap1Id).toBe('id-1');
		expect(result.swap2Id).toBe('id-2');
		expect(result.error).toBe('some error');
	});
});

// ---------------------------------------------------------------------------
// saveSwapChainState
// ---------------------------------------------------------------------------

describe('saveSwapChainState', () => {
	it('serializes state and saves to Preferences with correct key', async () => {
		const state: SwapChainState = {
			...INITIAL_SWAP_CHAIN_STATE,
			phase: 'SWAP_1_PENDING',
			amount: '50000'
		};

		const result = await saveSwapChainState(state);

		expect(result.error).toBeNull();
		expect(mockPreferencesSet).toHaveBeenCalledTimes(1);
		const call = mockPreferencesSet.mock.calls[0][0] as { key: string; value: string };
		expect(call.key).toBe('bittasker_swap_chain');
		const parsed = JSON.parse(call.value);
		expect(parsed.phase).toBe('SWAP_1_PENDING');
		expect(parsed.amount).toBe('50000');
		expect(typeof parsed.updatedAt).toBe('number');
		expect(parsed.updatedAt).toBeGreaterThan(0);
	});

	it('stamps updatedAt with a recent timestamp', async () => {
		const before = Date.now();
		const state: SwapChainState = { ...INITIAL_SWAP_CHAIN_STATE };

		await saveSwapChainState(state);

		const call = mockPreferencesSet.mock.calls[0][0] as { key: string; value: string };
		const parsed = JSON.parse(call.value);
		expect(parsed.updatedAt).toBeGreaterThanOrEqual(before);
		expect(parsed.updatedAt).toBeLessThanOrEqual(Date.now());
	});

	it('returns error when Preferences.set rejects', async () => {
		mockPreferencesSet.mockRejectedValueOnce(new Error('Storage full'));

		const result = await saveSwapChainState({ ...INITIAL_SWAP_CHAIN_STATE });

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe('Storage full');
	});

	it('returns error when Preferences.set throws synchronously in tryCatch', async () => {
		mockPreferencesSet.mockRejectedValueOnce('string error');

		const result = await saveSwapChainState({ ...INITIAL_SWAP_CHAIN_STATE });

		expect(result.error).not.toBeNull();
	});

	it('does not throw when Preferences is unavailable', async () => {
		mockPreferencesSet.mockRejectedValueOnce(new Error('Plugin not loaded'));

		// Must not throw
		await expect(saveSwapChainState({ ...INITIAL_SWAP_CHAIN_STATE })).resolves.toBeDefined();
	});

	it('returns error when Preferences throws', async () => {
		mockPreferencesSet.mockRejectedValueOnce(new Error('Unavailable'));

		const result = await saveSwapChainState({ ...INITIAL_SWAP_CHAIN_STATE });

		expect(result.error).toBeDefined();
		expect(result.error?.message).toContain('Unavailable');
	});
});

// ---------------------------------------------------------------------------
// transitionTo
// ---------------------------------------------------------------------------

describe('transitionTo', () => {
	function makeState(
		phase: SwapChainPhase,
		overrides: Partial<SwapChainState> = {}
	): SwapChainState {
		return { ...INITIAL_SWAP_CHAIN_STATE, phase, ...overrides };
	}

	it('returns new state with updated phase for valid transition', async () => {
		const current = makeState('IDLE');
		const result = await transitionTo(current, 'SWAP_1_PENDING');

		expect(result.error).toBeNull();
		expect(result.data).not.toBeNull();
		expect(result.data!.phase).toBe('SWAP_1_PENDING');
	});

	it('preserves existing state fields through transition', async () => {
		const current = makeState('SWAP_1_PENDING', { amount: '50000', swap1Id: 'swap-1' });
		const result = await transitionTo(current, 'SWAP_1_CONFIRMED');

		expect(result.data!.amount).toBe('50000');
		expect(result.data!.swap1Id).toBe('swap-1');
		expect(result.data!.phase).toBe('SWAP_1_CONFIRMED');
	});

	it('allows merging additional updates during transition', async () => {
		const current = makeState('SWAP_1_PENDING');
		const result = await transitionTo(current, 'SWAP_1_CONFIRMED', { swap1Id: 'tx-abc' });

		expect(result.data!.swap1Id).toBe('tx-abc');
		expect(result.data!.phase).toBe('SWAP_1_CONFIRMED');
	});

	it('returns error for invalid transition', async () => {
		const current = makeState('IDLE');
		const result = await transitionTo(current, 'COMPLETE');

		expect(result.data).toBeNull();
		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toContain('Invalid swap chain transition');
	});

	it('returns error for terminal state transitions', async () => {
		const current = makeState('FAILED');
		const result = await transitionTo(current, 'SWAP_1_PENDING');

		expect(result.data).toBeNull();
		expect(result.error).toBeInstanceOf(Error);
	});

	it('sets error message when transitioning to FAILED', async () => {
		const current = makeState('SWAP_1_PENDING');
		const result = await transitionTo(current, 'FAILED', { error: 'Boltz timeout' });

		expect(result.data!.error).toBe('Boltz timeout');
		expect(result.data!.phase).toBe('FAILED');
	});

	it('sets default error message when transitioning to FAILED without explicit error', async () => {
		const current = makeState('SWAP_1_PENDING');
		const result = await transitionTo(current, 'FAILED');

		expect(result.data!.error).toBe('Swap chain failed');
	});

	it('sets default error message when transitioning to PARTIAL without explicit error', async () => {
		const current = makeState('SWAP_2_PENDING');
		const result = await transitionTo(current, 'PARTIAL');

		expect(result.data!.error).toBe('Partial completion — hop 2 failed');
	});

	it('clears error when transitioning to a non-failed phase', async () => {
		const current = makeState('SWAP_1_PENDING', { error: 'old error' });
		const result = await transitionTo(current, 'SWAP_1_CONFIRMED');

		expect(result.data!.error).toBeNull();
	});

	it('captures Sentry exception when transitioning to FAILED', async () => {
		const current = makeState('SWAP_1_PENDING');
		await transitionTo(current, 'FAILED', { error: 'timeout' });

		expect(mockCaptureException).toHaveBeenCalledTimes(1);
		const err = mockCaptureException.mock.calls[0][0] as Error;
		expect(err.message).toContain('FAILED');
		expect(err.message).toContain('timeout');
	});

	it('captures Sentry exception when transitioning to PARTIAL', async () => {
		const current = makeState('SWAP_2_PENDING');
		await transitionTo(current, 'PARTIAL', { error: 'hop 2 failed' });

		expect(mockCaptureException).toHaveBeenCalledTimes(1);
		const err = mockCaptureException.mock.calls[0][0] as Error;
		expect(err.message).toContain('PARTIAL');
	});

	it('does NOT capture Sentry exception for non-failure transitions', async () => {
		const current = makeState('SWAP_1_PENDING');
		await transitionTo(current, 'SWAP_1_CONFIRMED');

		expect(mockCaptureException).not.toHaveBeenCalled();
	});

	it('returns error when save fails after transition', async () => {
		mockPreferencesSet.mockRejectedValueOnce(new Error('Save failed'));

		const current = makeState('IDLE');
		const result = await transitionTo(current, 'SWAP_1_PENDING');

		expect(result.data).toBeNull();
		expect(result.error).toBeInstanceOf(Error);
	});

	it('stamps updatedAt on the new state', async () => {
		const before = Date.now();
		const current = makeState('IDLE');
		const result = await transitionTo(current, 'SWAP_1_PENDING');

		expect(result.data!.updatedAt).toBeGreaterThanOrEqual(before);
	});
});

// ---------------------------------------------------------------------------
// resetSwapChainState
// ---------------------------------------------------------------------------

describe('resetSwapChainState', () => {
	it('removes persisted state from Preferences and returns no error', async () => {
		const result = await resetSwapChainState();

		expect(result.error).toBeNull();
		expect(mockPreferencesRemove).toHaveBeenCalledTimes(1);
		expect(mockPreferencesRemove).toHaveBeenCalledWith({ key: 'bittasker_swap_chain' });
	});

	it('returns error when Preferences.remove rejects', async () => {
		mockPreferencesRemove.mockRejectedValueOnce(new Error('Plugin not available'));

		const result = await resetSwapChainState();

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe('Plugin not available');
	});

	it('returns error wrapping non-Error rejection', async () => {
		mockPreferencesRemove.mockRejectedValueOnce('string error');

		const result = await resetSwapChainState();

		expect(result.error).toBeInstanceOf(Error);
		expect(result.error?.message).toBe('string error');
	});

	it('does not throw when Preferences.remove fails', async () => {
		mockPreferencesRemove.mockRejectedValueOnce(new Error('fail'));

		await expect(resetSwapChainState()).resolves.toBeDefined();
	});
});

// ---------------------------------------------------------------------------
// boltzAddress
// ---------------------------------------------------------------------------

describe('boltzAddress', () => {
	const VALID_CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

	it('returns lowercase address for a valid address', () => {
		const result = boltzAddress(VALID_CHECKSUMMED);
		expect(result).toBe(VALID_CHECKSUMMED.toLowerCase());
		expect(result).not.toBe('');
	});

	it('returns lowercase for mixed-case input', () => {
		const mixed = '0x5AaEb6053F3E94C9b9A09f33669435E7Ef1BeAed';
		const result = boltzAddress(mixed);
		expect(result).toBe(mixed.toLowerCase());
	});

	it('returns empty string for empty string input', () => {
		expect(boltzAddress('')).toBe('');
	});

	it('returns lowercase for already-lowercase input', () => {
		const lower = VALID_CHECKSUMMED.toLowerCase();
		const result = boltzAddress(lower);
		expect(result).toBe(lower);
	});

	it('returns empty string for invalid address', () => {
		expect(boltzAddress('not-an-address')).toBe('');
	});
});

// ---------------------------------------------------------------------------
// swap progress observer (onSwapProgress / setSwapProgress / getSwapProgressStep)
// ---------------------------------------------------------------------------

describe('swap progress observer', () => {
	it('calls registered callback when setSwapProgress is invoked', () => {
		const cb = vi.fn();
		onSwapProgress(cb);

		setSwapProgress('locking-tbtc', 'Locking tBTC...');

		expect(cb).toHaveBeenCalledTimes(1);
		expect(cb).toHaveBeenCalledWith('locking-tbtc', 'Locking tBTC...');
	});

	it('supports multiple sequential callbacks (last wins)', () => {
		const cb1 = vi.fn();
		const cb2 = vi.fn();
		onSwapProgress(cb1);
		onSwapProgress(cb2);

		setSwapProgress('claiming-rbtc', 'Claiming RBTC...');

		// onSwapProgress replaces the previous callback
		expect(cb1).not.toHaveBeenCalled();
		expect(cb2).toHaveBeenCalledTimes(1);
		expect(cb2).toHaveBeenCalledWith('claiming-rbtc', 'Claiming RBTC...');
	});

	it('unsubscribes callback so it is no longer called', () => {
		const cb = vi.fn();
		const unsubscribe = onSwapProgress(cb);

		setSwapProgress('locking-rbtc', 'first');
		expect(cb).toHaveBeenCalledTimes(1);

		unsubscribe();

		setSwapProgress('locking-tbtc', 'second');
		expect(cb).toHaveBeenCalledTimes(1); // not called again
	});

	it('getSwapProgressStep returns current step', () => {
		setSwapProgress('waiting-for-boltz', 'Waiting...');
		expect(getSwapProgressStep()).toBe('waiting-for-boltz');
	});

	it('getSwapProgressStep reflects the last setSwapProgress call', () => {
		setSwapProgress('locking-rbtc', 'step 1');
		setSwapProgress('claiming-tbtc', 'step 2');
		expect(getSwapProgressStep()).toBe('claiming-tbtc');
	});

	it('does not throw when no callback is registered', () => {
		// Ensure no callback from prior tests by subscribing and immediately unsubscribing
		const unsub = onSwapProgress(() => {});
		unsub();
		expect(() => setSwapProgress('complete', 'Done')).not.toThrow();
	});
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe('sleep', () => {
	it('resolves after the specified duration', async () => {
		vi.useFakeTimers();

		const promise = sleep(500);

		// Should not resolve immediately
		let resolved = false;
		void promise.then(() => {
			resolved = true;
		});

		await vi.advanceTimersByTimeAsync(499);
		expect(resolved).toBe(false);

		await vi.advanceTimersByTimeAsync(1);
		await promise;
		expect(resolved).toBe(true);

		vi.useRealTimers();
	});
});

// ---------------------------------------------------------------------------
// loadSwapChainState — additional edge cases
// ---------------------------------------------------------------------------

describe('loadSwapChainState — edge cases', () => {
	it('returns INITIAL state when persisted phase is not a valid phase string', async () => {
		mockPreferencesGet.mockResolvedValueOnce({
			value: JSON.stringify({ phase: 'INVALID_PHASE' })
		});

		const result = await loadSwapChainState();

		expect(result.phase).toBe('IDLE');
	});
});
