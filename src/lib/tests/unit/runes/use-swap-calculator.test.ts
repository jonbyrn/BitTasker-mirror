/**
 * use-swap-calculator.svelte.ts — Pure Helper Unit Tests
 *
 * Tests exported pure helpers: parseAmount(), satsUsd().
 * Tests isBtcSourceType() indirectly through parseAmount behavior.
 *
 * Coverage targets:
 * - parseAmount: BTC sats→BTC conversion, USDT floor, empty/NaN/negative/boundary
 * - satsUsd: formatted string output, zero price guard, boundary values
 * - isBtcSourceType: BTC vs non-BTC source type classification (via parseAmount)
 *
 * No mocking needed for parseAmount (pure). satsUsd needs formatSats/formatUsd mocks.
 */

import { describe, it, expect, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Module mocks — formatSats/formatUsd are imported by the module under test
// ---------------------------------------------------------------------------

vi.mock('$lib/stores/wallet.store', () => ({
	formatSats: (sats: number) => new Intl.NumberFormat('en-US').format(sats),
	formatUsd: (amount: number) =>
		new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}));

vi.mock('$lib/utils/debug', () => ({
	createDebug: () => ({
		log: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		extend: () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })
	})
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { parseAmount, satsUsd } from '$lib/runes/use-swap-calculator.svelte';
import type { SwapSourceType } from '$lib/runes/use-swap-calculator.svelte';

// ===========================================================================
// parseAmount — pure helper
// ===========================================================================

describe('parseAmount', () => {
	// --- BTC source types (sats → BTC conversion) --------------------------

	describe('BTC source types (sats-to-BTC conversion)', () => {
		it('converts "100000" sats to 0.001 BTC for rbtc', () => {
			expect(parseAmount('100000', 'rbtc')).toBe(0.001);
		});

		it('converts "100000" sats to 0.001 BTC for btc-onchain', () => {
			expect(parseAmount('100000', 'btc-onchain')).toBe(0.001);
		});

		it('converts "100000" sats to 0.001 BTC for wbtc-arb', () => {
			expect(parseAmount('100000', 'wbtc-arb')).toBe(0.001);
		});

		it('converts "100000" sats to 0.001 BTC for tbtc-arb', () => {
			expect(parseAmount('100000', 'tbtc-arb')).toBe(0.001);
		});

		it('converts 1 sat to 0.00000001 BTC', () => {
			expect(parseAmount('1', 'rbtc')).toBe(0.00000001);
		});

		it('converts 100000000 sats (1 BTC) correctly', () => {
			expect(parseAmount('100000000', 'rbtc')).toBe(1);
		});

		it('converts very large sats amount correctly', () => {
			expect(parseAmount('2100000000000000', 'rbtc')).toBe(21_000_000);
		});
	});

	// --- USDT/USD source types (floor to 2 decimals) -----------------------

	describe('USDT/USD source types (floor to 2 decimals)', () => {
		it('floors "123.456" to 123.45 for usdt-bsc', () => {
			expect(parseAmount('123.456', 'usdt-bsc')).toBe(123.45);
		});

		it('floors "123.456" to 123.45 for usdt0-arb', () => {
			expect(parseAmount('123.456', 'usdt0-arb')).toBe(123.45);
		});

		it('floors "123.456" to 123.45 for usdt0-rsk', () => {
			expect(parseAmount('123.456', 'usdt0-rsk')).toBe(123.45);
		});

		it('floors "123.456" to 123.45 for doc-rsk', () => {
			expect(parseAmount('123.456', 'doc-rsk')).toBe(123.45);
		});

		it('floors "99.999" to 99.99 (sub-penny truncation)', () => {
			expect(parseAmount('99.999', 'usdt-bsc')).toBe(99.99);
		});

		it('preserves exact 2-decimal value "50.25"', () => {
			expect(parseAmount('50.25', 'usdt-bsc')).toBe(50.25);
		});

		it('floors "0.009" to 0 (below penny)', () => {
			expect(parseAmount('0.009', 'usdt-bsc')).toBe(0);
		});

		it('handles large USD value "999999.99"', () => {
			expect(parseAmount('999999.99', 'usdt-bsc')).toBe(999999.99);
		});
	});

	// --- Zero / empty / invalid inputs ------------------------------------

	describe('zero, empty, and invalid inputs', () => {
		it('returns 0 for BTC source with "0"', () => {
			expect(parseAmount('0', 'rbtc')).toBe(0);
		});

		it('returns 0 for USDT source with "0"', () => {
			expect(parseAmount('0', 'usdt-bsc')).toBe(0);
		});

		it('returns 0 for empty string', () => {
			expect(parseAmount('', 'rbtc')).toBe(0);
		});

		it('returns 0 for empty string with USDT source', () => {
			expect(parseAmount('', 'usdt-bsc')).toBe(0);
		});

		it('returns 0 for NaN input ("abc")', () => {
			expect(parseAmount('abc', 'rbtc')).toBe(0);
		});

		it('returns 0 for NaN input with USDT source', () => {
			expect(parseAmount('abc', 'usdt-bsc')).toBe(0);
		});

		it('returns 0 for negative BTC amount', () => {
			expect(parseAmount('-100000', 'rbtc')).toBe(0);
		});

		it('returns 0 for negative USDT amount', () => {
			expect(parseAmount('-50.25', 'usdt-bsc')).toBe(0);
		});
	});
});

// ===========================================================================
// isBtcSourceType — tested indirectly through parseAmount
// ===========================================================================

describe('isBtcSourceType (via parseAmount behavior)', () => {
	// BTC source types → sats/1e8 conversion
	const btcTypes: SwapSourceType[] = ['rbtc', 'btc-onchain', 'wbtc-arb', 'tbtc-arb'];

	for (const sourceType of btcTypes) {
		it(`"${sourceType}" is a BTC source type (parseAmount divides by 1e8)`, () => {
			// If it's a BTC type, parseAmount('100000', ...) → 0.001 (sats/1e8)
			expect(parseAmount('100000', sourceType)).toBe(0.001);
		});
	}

	// Non-BTC source types → floor to 2 decimals
	const nonBtcTypes: SwapSourceType[] = ['usdt-bsc', 'usdt0-arb', 'usdt0-rsk', 'doc-rsk'];

	for (const sourceType of nonBtcTypes) {
		it(`"${sourceType}" is NOT a BTC source type (parseAmount floors to 2 decimals)`, () => {
			// If it's NOT a BTC type, parseAmount('123.456', ...) → 123.45 (floor to 2 dec)
			expect(parseAmount('123.456', sourceType)).toBe(123.45);
		});
	}
});

// ===========================================================================
// satsUsd — pure helper (with mocked formatters)
// ===========================================================================

describe('satsUsd', () => {
	it('formats 100000 sats at $70000 BTC price', () => {
		// 100000 / 1e8 * 70000 = $70.00
		const result = satsUsd(100000, 70000);
		expect(result).toContain('100,000 sats');
		expect(result).toContain('$70.00');
	});

	it('formats 0 sats at any price', () => {
		const result = satsUsd(0, 70000);
		expect(result).toContain('0 sats');
		expect(result).toContain('$0.00');
	});

	it('returns "sats" only when btcPrice is 0 (division guard)', () => {
		const result = satsUsd(100000, 0);
		expect(result).toBe('100,000 sats');
		expect(result).not.toContain('$');
	});

	it('returns "sats" only when btcPrice is negative', () => {
		const result = satsUsd(100000, -1);
		expect(result).toBe('100,000 sats');
		expect(result).not.toContain('$');
	});

	it('returns "sats" only when btcPrice is NaN', () => {
		const result = satsUsd(100000, NaN);
		expect(result).toBe('100,000 sats');
	});

	it('formats 1 sat at $70000 (very small USD)', () => {
		// 1 / 1e8 * 70000 = $0.0007 → formatted as $0.00
		const result = satsUsd(1, 70000);
		expect(result).toContain('1 sats');
		expect(result).toContain('$0.00');
	});

	it('formats 1 BTC (100M sats) at $70000', () => {
		// 100000000 / 1e8 * 70000 = $70,000
		const result = satsUsd(100_000_000, 70000);
		expect(result).toContain('100,000,000 sats');
		expect(result).toContain('$70,000.00');
	});

	it('formats large sats amount', () => {
		// 2100000000000000 / 1e8 * 70000 = $1,470,000,000,000
		const result = satsUsd(2_100_000_000_000_000, 70000);
		expect(result).toContain('sats');
		expect(result).toContain('$1,470,000,000,000.00');
	});
});
