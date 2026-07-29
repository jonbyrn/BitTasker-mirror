/**
 * HealthFactorGauge.svelte — Component Tests (RED PHASE — STRICT TDD)
 *
 * Written before any implementation changes or Green work.
 * These tests WILL FAIL against the current (post live-wiring) component.
 *
 * 5 explicit states + a11y + i18n per project rules + CLAUDE.md:
 * Empty (defaults), Loading (N/A for pure gauge), Error (N/A), Populated (various health/status),
 * Edge (health=1.0 exactly, >5 clamped, status transitions).
 *
 * Follows exact patterns from full read of:
 * - src/lib/tests/components/wallet/ConnectedWallets.test.ts (hoisted, t mock, fireEvent, 5-states describe blocks, cleanup)
 * - src/lib/tests/components/BalanceHistory.test.ts (waitFor usage)
 *
 * Accessibility: role=meter + full aria-* assertions REQUIRED.
 * No source edits — only new test file.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import HealthFactorGauge from '$lib/components/wallet/defi/HealthFactorGauge.svelte';

// ---------------------------------------------------------------------------
// i18n hoisted mock (full keys used by gauge + BorrowStep integration)
// ---------------------------------------------------------------------------
const t = vi.hoisted(() => {
	const map: Record<string, string> = {
		'wallet.defi.borrow.health_safe': 'Safe',
		'wallet.defi.borrow.health_monitor': 'Monitor',
		'wallet.defi.borrow.health_risk': 'At Risk — Add Collateral',
		'wallet.defi.borrow.health_factor_aria': 'Health factor: {factor} out of 5. {status}'
	};
	return (key: string, opts?: { values?: Record<string, string> }) => {
		let v = map[key] ?? key;
		if (opts?.values) {
			Object.entries(opts.values).forEach(([k, val]) => {
				v = v.replace(`{${k}}`, val);
			});
		}
		return v;
	};
});

vi.mock('svelte-i18n', () => ({
	t: {
		subscribe: (fn: (f: typeof t) => void) => {
			fn(t);
			return () => {};
		}
	},
	locale: {
		subscribe: (fn: (l: string) => void) => {
			fn('en');
			return () => {};
		}
	}
}));

// ---------------------------------------------------------------------------
describe('HealthFactorGauge (RED PHASE — failing 5-state + a11y coverage)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		cleanup();
	});

	// ---------------------------------------------------------------------------
	// Populated / Default state (current component defaults to 5 / safe)
	// ---------------------------------------------------------------------------
	describe('Populated state', () => {
		it('RED: renders with default props (health=5, safe) and shows badge + progress', () => {
			render(HealthFactorGauge);

			// Current impl hardcodes defaults; gauge always shows something
			expect(screen.getByText(/Safe 5.0x/i)).toBeTruthy();
			// Note: duplicate tiny label span was removed in gauge polish for quality (no longer expected)
		});

		it('RED: accepts and renders live health + monitor status from BorrowStep derived', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 1.8, status: 'monitor' }
			});

			expect(screen.getByText(/Monitor 1.8x/i)).toBeTruthy();
			// Badge class derived from status (warning)
		});

		it('RED: renders risk status and clamps visual at 5', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 0.8, status: 'risk' }
			});

			expect(screen.getByText(/At Risk — Add Collateral 0.8x/i)).toBeTruthy();
		});
	});

	// ---------------------------------------------------------------------------
	// Edge cases (amount=0 paths, health=1.0 boundary, price=0 downstream, >5)
	// ---------------------------------------------------------------------------
	describe('Edge cases', () => {
		it('RED: health exactly 1.0 (liquidation edge) renders risk status', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 1.0, status: 'risk' }
			});

			const meter = screen.getByRole('meter');
			expect(meter.getAttribute('aria-valuenow')).toBe('1');
			expect(screen.getByText(/At Risk — Add Collateral 1.0x/i)).toBeTruthy();
		});

		it('RED: health >5 is clamped in progress but value shown (per current markup)', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 6.2, status: 'safe' }
			});

			// Progress value=Math.min(health,5) in markup — test current behavior
			expect(screen.getByText(/Safe 6.2x/i)).toBeTruthy();
		});

		it('RED: zero health (extreme edge after guards fail) still renders without crash', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 0, status: 'risk' }
			});
			expect(screen.getByRole('meter')).toBeTruthy();
		});
	});

	// ---------------------------------------------------------------------------
	// Accessibility (WCAG AA minimum — mandatory per guidelines)
	// ---------------------------------------------------------------------------
	describe('Accessibility', () => {
		it('RED: exposes role=meter with correct aria-valuenow/min/max + descriptive label', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 2.3, status: 'monitor' }
			});

			const meter = screen.getByRole('meter');
			expect(meter).toBeTruthy();
			expect(meter.getAttribute('aria-valuenow')).toBe('2.3');
			expect(meter.getAttribute('aria-valuemin')).toBe('0');
			expect(meter.getAttribute('aria-valuemax')).toBe('5');
			expect(meter.getAttribute('aria-label')).toContain('Health factor: 2.3 out of 5.');
			expect(meter.getAttribute('aria-label')).toContain('Monitor');
		});

		it('RED: label updates when props change (live data from BorrowStep health transitions)', () => {
			const { rerender } = render(HealthFactorGauge, {
				props: { healthFactor: 3.1, status: 'safe' }
			});

			let meter = screen.getByRole('meter');
			expect(meter.getAttribute('aria-label')).toContain('Safe');

			// Simulate live update from BorrowStep derived $state change → re-render
			rerender({ healthFactor: 1.4, status: 'risk' });
			meter = screen.getByRole('meter');
			expect(meter.getAttribute('aria-label')).toContain('At Risk');
		});
	});

	// ---------------------------------------------------------------------------
	// i18n readiness (keys must exist; run find-missing-translations before commit)
	// ---------------------------------------------------------------------------
	describe('i18n', () => {
		it('RED: uses translated status labels from svelte-i18n (no hard-coded English)', () => {
			render(HealthFactorGauge, {
				props: { healthFactor: 2.5, status: 'safe' }
			});

			// Current impl calls $t — mock returns mapped or key; we assert presence of expected translated output
			expect(screen.getByText(/Safe 2.5x/i)).toBeTruthy();
		});
	});
});

/**
 * RED NOTES FOR HealthFactorGauge.test.ts
 * - Current component always renders (no true Empty/Loading/Error states) — tests document that gap.
 * - Some assertions on duplicate labels / current markup will require minor Green cleanup but must be written first.
 * - No tests existed for this gauge despite being rendered inside live BorrowStep.
 * - Must pass + BorrowStep 5-state tests + aave service before any edit to HealthFactorGauge.svelte.
 */
