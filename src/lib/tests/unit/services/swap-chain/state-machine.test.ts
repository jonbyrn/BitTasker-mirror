/**
 * Swap Chain State Machine — Unit Tests
 *
 * Tests the pure state-machine functions from `src/lib/services/swap-chain/state.ts`:
 * - isValidSwapChainTransition
 * - isTerminalPhase
 * - needsResume
 * - getSwapChainStatus
 *
 * These are all pure functions with no side effects — no mocks needed.
 */

import { describe, it, expect } from 'vitest';
import {
	isValidSwapChainTransition,
	isTerminalPhase,
	needsResume,
	getSwapChainStatus,
	INITIAL_SWAP_CHAIN_STATE
} from '$lib/services/swap-chain/state';
import type { SwapChainState, SwapChainPhase } from '$lib/services/swap-chain/state';

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
		expect(isValidSwapChainTransition('PARTIAL', 'COMPLETE')).toBe(false);
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
