import { describe, it, expect } from 'vitest';
import { parseDecimalToSmallestUnit, satsToWei } from '$lib/utils/amount-conversion';

// ─── parseDecimalToSmallestUnit ────────────────────────────────────

describe('parseDecimalToSmallestUnit', () => {
	describe('basic whole number conversions', () => {
		it('converts "1" with 18 decimals (ETH)', () => {
			expect(parseDecimalToSmallestUnit('1', 18)).toBe(1_000_000_000_000_000_000n);
		});

		it('converts "1" with 8 decimals (BTC sats)', () => {
			expect(parseDecimalToSmallestUnit('1', 8)).toBe(100_000_000n);
		});

		it('converts "1" with 6 decimals (USDT)', () => {
			expect(parseDecimalToSmallestUnit('1', 6)).toBe(1_000_000n);
		});

		it('converts "100" with 18 decimals', () => {
			expect(parseDecimalToSmallestUnit('100', 18)).toBe(100_000_000_000_000_000_000n);
		});

		it('converts "0" to 0n', () => {
			expect(parseDecimalToSmallestUnit('0', 18)).toBe(0n);
		});
	});

	describe('fractional conversions', () => {
		it('converts "0.001" with 18 decimals', () => {
			expect(parseDecimalToSmallestUnit('0.001', 18)).toBe(1_000_000_000_000_000n);
		});

		it('converts "0.00000001" with 8 decimals (1 sat)', () => {
			expect(parseDecimalToSmallestUnit('0.00000001', 8)).toBe(1n);
		});

		it('converts "0.5" with 18 decimals', () => {
			expect(parseDecimalToSmallestUnit('0.5', 18)).toBe(500_000_000_000_000_000n);
		});

		it('converts "0.000001" with 6 decimals (1 micro-USDT)', () => {
			expect(parseDecimalToSmallestUnit('0.000001', 6)).toBe(1n);
		});

		it('converts "1.5" with 18 decimals', () => {
			expect(parseDecimalToSmallestUnit('1.5', 18)).toBe(1_500_000_000_000_000_000n);
		});
	});

	describe('large amounts without precision loss', () => {
		it('handles 100 BTC in 18 decimals (exceeds Number.MAX_SAFE_INTEGER)', () => {
			const result = parseDecimalToSmallestUnit('100', 18);
			expect(result).toBe(100_000_000_000_000_000_000n);
		});

		it('handles 1000 ETH in 18 decimals', () => {
			const result = parseDecimalToSmallestUnit('1000', 18);
			expect(result).toBe(1_000_000_000_000_000_000_000n);
		});

		it('handles 21000000 BTC in 8 decimals (max supply)', () => {
			const result = parseDecimalToSmallestUnit('21000000', 8);
			expect(result).toBe(2_100_000_000_000_000n);
		});
	});

	describe('whitespace handling', () => {
		it('trims leading and trailing whitespace', () => {
			expect(parseDecimalToSmallestUnit(' 1.5 ', 18)).toBe(1_500_000_000_000_000_000n);
		});

		it('trims leading whitespace only', () => {
			expect(parseDecimalToSmallestUnit('   100', 8)).toBe(10_000_000_000n);
		});

		it('trims trailing whitespace only', () => {
			expect(parseDecimalToSmallestUnit('100   ', 8)).toBe(10_000_000_000n);
		});
	});

	describe('truncation of excess fractional digits', () => {
		it('truncates 19 fractional digits to 18 for 18-decimal token', () => {
			// "0.1234567890123456789" → keep 18 frac digits → "0123456789012345678"
			expect(parseDecimalToSmallestUnit('0.1234567890123456789', 18)).toBe(
				123_456_789_012_345_678n
			);
		});

		it('truncates 10 fractional digits to 8 for 8-decimal token', () => {
			// "0.1234567890" → keep 8 frac digits → "12345678"
			expect(parseDecimalToSmallestUnit('0.1234567890', 8)).toBe(12_345_678n);
		});

		it('pads fractional digits shorter than decimals', () => {
			// "0.1" with 8 decimals → "10000000"
			expect(parseDecimalToSmallestUnit('0.1', 8)).toBe(10_000_000n);
		});
	});

	describe('negative amounts', () => {
		it('handles negative whole number', () => {
			expect(parseDecimalToSmallestUnit('-1', 18)).toBe(-1_000_000_000_000_000_000n);
		});

		it('handles negative fractional', () => {
			expect(parseDecimalToSmallestUnit('-0.5', 8)).toBe(-50_000_000n);
		});

		it('handles -0', () => {
			expect(parseDecimalToSmallestUnit('-0', 18)).toBe(0n);
		});
	});

	describe('no fractional part (integer string without dot)', () => {
		it('converts "42" with 18 decimals', () => {
			expect(parseDecimalToSmallestUnit('42', 18)).toBe(42_000_000_000_000_000_000n);
		});
	});

	describe('trailing dot', () => {
		it('rejects "1." as invalid format', () => {
			expect(() => parseDecimalToSmallestUnit('1.', 18)).toThrow();
		});
	});

	describe('error cases', () => {
		it('throws for empty string', () => {
			expect(() => parseDecimalToSmallestUnit('', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for non-numeric string', () => {
			expect(() => parseDecimalToSmallestUnit('abc', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for "NaN"', () => {
			expect(() => parseDecimalToSmallestUnit('NaN', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for "Infinity"', () => {
			expect(() => parseDecimalToSmallestUnit('Infinity', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for string with spaces inside number', () => {
			expect(() => parseDecimalToSmallestUnit('1 000', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for scientific notation', () => {
			expect(() => parseDecimalToSmallestUnit('1e18', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for multiple dots', () => {
			expect(() => parseDecimalToSmallestUnit('1.2.3', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for just a dot', () => {
			expect(() => parseDecimalToSmallestUnit('.', 18)).toThrow('Invalid decimal amount');
		});

		it('throws for just a minus sign', () => {
			expect(() => parseDecimalToSmallestUnit('-', 18)).toThrow('Invalid decimal amount');
		});
	});

	describe('edge case: zero decimals', () => {
		it('converts "5" with 0 decimals', () => {
			expect(parseDecimalToSmallestUnit('5', 0)).toBe(5n);
		});

		it('truncates fractional part with 0 decimals', () => {
			expect(parseDecimalToSmallestUnit('5.9', 0)).toBe(5n);
		});
	});

	describe('return type', () => {
		it('returns a bigint', () => {
			const result = parseDecimalToSmallestUnit('1', 18);
			expect(typeof result).toBe('bigint');
		});
	});
});

// ─── satsToWei ─────────────────────────────────────────────────────

describe('satsToWei', () => {
	it('converts 1 sat to 10^10 wei', () => {
		expect(satsToWei(1)).toBe(10_000_000_000n);
	});

	it('converts 100_000_000 sats (1 BTC) to 10^18 wei', () => {
		expect(satsToWei(100_000_000)).toBe(1_000_000_000_000_000_000n);
	});

	it('converts 0 sats to 0 wei', () => {
		expect(satsToWei(0)).toBe(0n);
	});

	it('accepts string input', () => {
		expect(satsToWei('50000')).toBe(500_000_000_000_000n);
	});

	it('accepts string "1"', () => {
		expect(satsToWei('1')).toBe(10_000_000_000n);
	});

	it('string and number produce same result', () => {
		expect(satsToWei(1000)).toBe(satsToWei('1000'));
	});

	it('returns a bigint', () => {
		const result = satsToWei(1);
		expect(typeof result).toBe('bigint');
	});

	it('deterministic for same input', () => {
		expect(satsToWei(42)).toBe(satsToWei(42));
	});

	it('handles large sat values (21M BTC supply)', () => {
		// 2_100_000_000_000_000 sats = 21M BTC
		const result = satsToWei(2_100_000_000_000_000);
		expect(result).toBe(21_000_000_000_000_000_000_000_000n);
	});
});
