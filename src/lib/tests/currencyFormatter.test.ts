import { describe, it, expect } from 'vitest';
import { formatCurrency, convertCurrency } from '$lib/utils/helpers/currencyFormatter';

describe('Currency Formatter', () => {
	describe('formatCurrency', () => {
		it('should format BTC correctly', () => {
			expect(formatCurrency(1.23456789, 'BTC')).toBe('BTC 1.23456789');
			expect(formatCurrency(0.00000001, 'BTC')).toBe('BTC 0.00000001');
		});

		it('should format L-BTC correctly', () => {
			expect(formatCurrency(1.23456789, 'L-BTC')).toBe('L-BTC 1.23456789');
		});

		it('should format LN correctly', () => {
			expect(formatCurrency(1.23456789, 'LN')).toBe('LN 1.23456789');
		});

		it('should format USD correctly', () => {
			expect(formatCurrency(1.23, 'USD')).toBe('$1.23');
			expect(formatCurrency(1000, 'USD')).toBe('$1000.00');
		});

		it('should handle null and undefined values', () => {
			expect(formatCurrency(null as any, 'BTC')).toBe('-');
			expect(formatCurrency(undefined as any, 'USD')).toBe('-');
		});

		it('should handle other currencies', () => {
			expect(formatCurrency(100, 'EUR')).toBe('EUR 100');
		});
	});

	describe('convertCurrency', () => {
		const testRates = {
			BTC: 1,
			'L-BTC': 1,
			LN: 1,
			USD: 50000
		};

		it('should convert from BTC to USD', () => {
			expect(convertCurrency(2, 'BTC', 'USD', testRates)).toBe(100000);
		});

		it('should convert from USD to BTC', () => {
			expect(convertCurrency(50000, 'USD', 'BTC', testRates)).toBe(1);
		});

		it('should convert between non-BTC currencies', () => {
			expect(convertCurrency(50000, 'USD', 'L-BTC', testRates)).toBe(1);
		});

		it('should handle same currency conversion', () => {
			expect(convertCurrency(5, 'BTC', 'BTC', testRates)).toBe(5);
		});

		it('should use default rates if not provided', () => {
			// This test depends on the default rates in the implementation
			const result = convertCurrency(1, 'BTC', 'USD');
			expect(typeof result).toBe('number');
			expect(result).toBeGreaterThan(0);
		});
	});
});
