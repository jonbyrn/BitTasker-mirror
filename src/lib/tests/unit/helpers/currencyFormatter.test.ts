import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatCurrency, convertCurrency } from '$lib/utils/helpers/currencyFormatter';

vi.mock('$lib/api/services/crypto-price.service', () => ({
	default: {
		getExchangeRate: vi.fn()
	}
}));

import cryptoPriceService from '$lib/api/services/crypto-price.service';

describe('Currency Formatter', () => {
	beforeEach(() => {
		vi.mocked(cryptoPriceService.getExchangeRate).mockReset();
	});

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

		it('should handle other currencies (default: amount + currency)', () => {
			expect(formatCurrency(100, 'EUR')).toBe('100 EUR');
		});
	});

	describe('convertCurrency', () => {
		it('should convert from BTC to USD', async () => {
			vi.mocked(cryptoPriceService.getExchangeRate).mockResolvedValue(50000);
			expect(await convertCurrency(2, 'BTC', 'USD')).toBe(100000);
		});

		it('should convert from USD to BTC', async () => {
			vi.mocked(cryptoPriceService.getExchangeRate).mockResolvedValue(1 / 50000);
			expect(await convertCurrency(50000, 'USD', 'BTC')).toBe(1);
		});

		it('should convert between non-BTC currencies', async () => {
			// Rate: 1 L-BTC = 50000 USD => 1 USD = 1/50000 L-BTC
			vi.mocked(cryptoPriceService.getExchangeRate).mockResolvedValue(1 / 50000);
			expect(await convertCurrency(50000, 'USD', 'L-BTC')).toBe(1);
		});

		it('should handle same currency conversion', async () => {
			expect(await convertCurrency(5, 'BTC', 'BTC')).toBe(5);
			expect(cryptoPriceService.getExchangeRate).not.toHaveBeenCalled();
		});

		it('should use exchange rate from service when not same currency', async () => {
			vi.mocked(cryptoPriceService.getExchangeRate).mockResolvedValue(60000);
			const result = await convertCurrency(1, 'BTC', 'USD');
			expect(result).toBe(60000);
			expect(cryptoPriceService.getExchangeRate).toHaveBeenCalledWith('BTC', 'USD');
		});
	});
});
