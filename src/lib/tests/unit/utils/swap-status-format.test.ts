/**
 * Swap Status Formatting — Unit Tests
 *
 * Tests the pure formatting functions from `src/lib/utils/swap-status-format.ts`:
 * - getReverseSwapStatusInfo
 * - getChainSwapStatusInfo
 * - fmtSats
 * - fmtTime
 *
 * All functions are pure with no side effects — only a mock translation
 * function is needed.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	getReverseSwapStatusInfo,
	getChainSwapStatusInfo,
	fmtSats,
	fmtTime
} from '$lib/utils/swap-status-format';
import type { TranslateFn, ChainSwapStatusInput } from '$lib/utils/swap-status-format';

// ---------------------------------------------------------------------------
// Mock translation function — returns the key (identity translator)
// ---------------------------------------------------------------------------

const t: TranslateFn = (key: string, _opts?: Record<string, unknown>) => key;

// ===========================================================================
// getReverseSwapStatusInfo
// ===========================================================================

describe('getReverseSwapStatusInfo', () => {
	it('returns waiting-for-payment info for "pending"', () => {
		const result = getReverseSwapStatusInfo('pending', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_waiting');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_waiting');
		expect(result.color).toBe('badge-warning');
		expect(result.icon).toBe('bg-warning');
	});

	it('returns ready-to-claim info for "claimable"', () => {
		const result = getReverseSwapStatusInfo('claimable', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_claimable');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_claimable');
		expect(result.color).toBe('badge-success');
		expect(result.icon).toBe('bg-success');
	});

	it('returns claiming info for "claiming"', () => {
		const result = getReverseSwapStatusInfo('claiming', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_claiming');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_claiming');
		expect(result.color).toBe('badge-info');
		expect(result.icon).toBe('bg-info');
	});

	it('returns claimed info for "claimed"', () => {
		const result = getReverseSwapStatusInfo('claimed', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_claimed');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_claimed');
		expect(result.color).toBe('badge-success');
		expect(result.icon).toBe('bg-success');
	});

	it('returns expired info for "expired"', () => {
		const result = getReverseSwapStatusInfo('expired', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_expired');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_expired');
		expect(result.color).toBe('badge-error');
		expect(result.icon).toBe('bg-error');
	});

	it('returns failed info for "failed"', () => {
		const result = getReverseSwapStatusInfo('failed', t);
		expect(result.label).toBe('wallet.swap.pending_swaps.status_failed');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_failed_generic');
		expect(result.color).toBe('badge-error');
		expect(result.icon).toBe('bg-error');
	});

	it('returns unknown info for unrecognized status (default case)', () => {
		const result = getReverseSwapStatusInfo('unknown_status', t);
		expect(result.label).toBe('wallet.pending_swaps.status_unknown');
		expect(result.message).toBe('wallet.swap.pending_swaps.msg_unknown');
		expect(result.color).toBe('badge-ghost');
		expect(result.icon).toBe('bg-base-content/30');
	});

	it('returns unknown info for empty string', () => {
		const result = getReverseSwapStatusInfo('', t);
		expect(result.label).toBe('wallet.pending_swaps.status_unknown');
		expect(result.color).toBe('badge-ghost');
	});

	// Verify all fields are non-empty strings for every known status
	it('always returns non-empty label, message, color, and icon', () => {
		const statuses = ['pending', 'claimable', 'claiming', 'claimed', 'expired', 'failed', 'xyz'];
		for (const status of statuses) {
			const result = getReverseSwapStatusInfo(status, t);
			expect(result.label, `label for status "${status}"`).toBeTruthy();
			expect(result.message, `message for status "${status}"`).toBeTruthy();
			expect(result.color, `color for status "${status}"`).toBeTruthy();
			expect(result.icon, `icon for status "${status}"`).toBeTruthy();
		}
	});
});

// ===========================================================================
// getChainSwapStatusInfo
// ===========================================================================

describe('getChainSwapStatusInfo', () => {
	function makeChainState(overrides: Partial<ChainSwapStatusInput> = {}): ChainSwapStatusInput {
		return {
			phase: 'IDLE',
			isFailed: false,
			isPartial: false,
			error: null,
			...overrides
		};
	}

	// ── Failed state ────────────────────────────────────────────────────

	it('returns failed label with error message when isFailed and error provided', () => {
		const state = makeChainState({ isFailed: true, error: 'Timeout waiting for lockup' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_failed');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_failed');
		expect(result.color).toBe('badge-error');
		expect(result.icon).toBe('bg-error');
	});

	it('returns failed label with generic message when isFailed but no error', () => {
		const state = makeChainState({ isFailed: true, error: null });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_failed');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_failed_generic');
		expect(result.color).toBe('badge-error');
		expect(result.icon).toBe('bg-error');
	});

	it('returns failed label when isFailed is true even if isPartial is also true', () => {
		const state = makeChainState({ isFailed: true, isPartial: true, error: 'err' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_failed');
	});

	// ── Partial state ───────────────────────────────────────────────────

	it('returns partial label when isPartial is true', () => {
		const state = makeChainState({ isPartial: true });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_partial');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_partial');
		expect(result.color).toBe('badge-warning');
		expect(result.icon).toBe('bg-warning');
	});

	// ── Phase-based statuses ────────────────────────────────────────────

	it('returns locking label for SWAP_1_PENDING phase', () => {
		const state = makeChainState({ phase: 'SWAP_1_PENDING' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_locking');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_swap_1_pending');
		expect(result.color).toBe('badge-warning');
		expect(result.icon).toContain('animate-pulse');
	});

	it('returns processing label for SWAP_1_CONFIRMED phase', () => {
		const state = makeChainState({ phase: 'SWAP_1_CONFIRMED' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_processing');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_swap_1_confirmed');
		expect(result.color).toBe('badge-info');
		expect(result.icon).toContain('animate-pulse');
	});

	it('returns claiming label for SWAP_2_PENDING phase', () => {
		const state = makeChainState({ phase: 'SWAP_2_PENDING' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_claiming');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_swap_2_pending');
		expect(result.color).toBe('badge-warning');
		expect(result.icon).toContain('animate-pulse');
	});

	it('returns swapping label for SWAP_2_CONFIRMED phase', () => {
		const state = makeChainState({ phase: 'SWAP_2_CONFIRMED' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_swapping');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_swap_2_confirmed');
		expect(result.color).toBe('badge-info');
		expect(result.icon).toContain('animate-pulse');
	});

	it('returns in-progress label for unknown/IDLE phase (default)', () => {
		const state = makeChainState({ phase: 'IDLE' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_in_progress');
		expect(result.message).toBe('wallet.swap.pending_swaps.chain_msg_processing');
		expect(result.color).toBe('badge-info');
		expect(result.icon).toContain('animate-pulse');
	});

	it('returns in-progress label for COMPLETE phase (default case)', () => {
		const state = makeChainState({ phase: 'COMPLETE' });
		const result = getChainSwapStatusInfo(state, t);
		expect(result.label).toBe('wallet.swap.pending_swaps.chain_status_in_progress');
	});

	// ── All fields non-empty ────────────────────────────────────────────

	it('always returns non-empty label, message, color, and icon', () => {
		const scenarios: ChainSwapStatusInput[] = [
			{ phase: 'SWAP_1_PENDING', isFailed: false, isPartial: false },
			{ phase: 'SWAP_1_CONFIRMED', isFailed: false, isPartial: false },
			{ phase: 'SWAP_2_PENDING', isFailed: false, isPartial: false },
			{ phase: 'SWAP_2_CONFIRMED', isFailed: false, isPartial: false },
			{ phase: 'IDLE', isFailed: false, isPartial: false },
			{ phase: 'X', isFailed: true, isPartial: false, error: 'e' },
			{ phase: 'X', isFailed: false, isPartial: true }
		];
		for (const state of scenarios) {
			const result = getChainSwapStatusInfo(state, t);
			expect(
				result.label,
				`label for phase "${state.phase}" failed=${state.isFailed} partial=${state.isPartial}`
			).toBeTruthy();
			expect(result.message, `message for phase "${state.phase}"`).toBeTruthy();
			expect(result.color, `color for phase "${state.phase}"`).toBeTruthy();
			expect(result.icon, `icon for phase "${state.phase}"`).toBeTruthy();
		}
	});
});

// ===========================================================================
// fmtSats
// ===========================================================================

describe('fmtSats', () => {
	it('formats zero sats', () => {
		const result = fmtSats(0, t);
		expect(result).toBe('0 wallet.pending_swaps.sats_unit');
	});

	it('formats small amount without commas', () => {
		const result = fmtSats(500, t);
		expect(result).toBe('500 wallet.pending_swaps.sats_unit');
	});

	it('formats amount with commas (thousands)', () => {
		const result = fmtSats(1000, t);
		expect(result).toBe('1,000 wallet.pending_swaps.sats_unit');
	});

	it('formats large amount with commas', () => {
		const result = fmtSats(1234567, t);
		expect(result).toBe('1,234,567 wallet.pending_swaps.sats_unit');
	});

	it('formats negative amount', () => {
		const result = fmtSats(-500, t);
		expect(result).toBe('-500 wallet.pending_swaps.sats_unit');
	});

	it('formats negative large amount with commas', () => {
		const result = fmtSats(-1000000, t);
		expect(result).toBe('-1,000,000 wallet.pending_swaps.sats_unit');
	});
});

// ===========================================================================
// fmtTime
// ===========================================================================

describe('fmtTime', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns "just now" for timestamps less than 1 minute ago', () => {
		const now = Date.now();
		expect(fmtTime(now, t)).toBe('wallet.swap.pending_swaps.just_now');
		expect(fmtTime(now - 30_000, t)).toBe('wallet.swap.pending_swaps.just_now');
		expect(fmtTime(now - 59_000, t)).toBe('wallet.swap.pending_swaps.just_now');
	});

	it('returns minutes ago for 1-59 minutes', () => {
		const now = Date.now();
		// 1 minute ago
		expect(fmtTime(now - 60_000, t)).toBe('wallet.swap.pending_swaps.time_m_ago');
		// 5 minutes ago
		expect(fmtTime(now - 300_000, t)).toBe('wallet.swap.pending_swaps.time_m_ago');
		// 59 minutes ago
		expect(fmtTime(now - 3_540_000, t)).toBe('wallet.swap.pending_swaps.time_m_ago');
	});

	it('returns hours ago for 1-23 hours', () => {
		const now = Date.now();
		// 1 hour ago
		expect(fmtTime(now - 3_600_000, t)).toBe('wallet.swap.pending_swaps.time_h_ago');
		// 12 hours ago
		expect(fmtTime(now - 43_200_000, t)).toBe('wallet.swap.pending_swaps.time_h_ago');
		// 23 hours ago
		expect(fmtTime(now - 82_800_000, t)).toBe('wallet.swap.pending_swaps.time_h_ago');
	});

	it('returns days ago for 24+ hours', () => {
		const now = Date.now();
		// 1 day ago (24 hours)
		expect(fmtTime(now - 86_400_000, t)).toBe('wallet.swap.pending_swaps.time_d_ago');
		// 3 days ago
		expect(fmtTime(now - 259_200_000, t)).toBe('wallet.swap.pending_swaps.time_d_ago');
	});

	it('passes correct min value to translation function', () => {
		const spy = vi.fn((key: string) => key);
		const now = Date.now();
		fmtTime(now - 120_000, spy); // 2 minutes
		expect(spy).toHaveBeenCalledWith('wallet.swap.pending_swaps.time_m_ago', { min: '2' });
	});

	it('passes correct hr value to translation function', () => {
		const spy = vi.fn((key: string) => key);
		const now = Date.now();
		fmtTime(now - 7_200_000, spy); // 2 hours
		expect(spy).toHaveBeenCalledWith('wallet.swap.pending_swaps.time_h_ago', { hr: '2' });
	});

	it('passes correct day value to translation function', () => {
		const spy = vi.fn((key: string) => key);
		const now = Date.now();
		fmtTime(now - 172_800_000, spy); // 2 days
		expect(spy).toHaveBeenCalledWith('wallet.swap.pending_swaps.time_d_ago', { day: '2' });
	});
});
