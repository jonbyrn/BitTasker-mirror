import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	formatCurrency,
	formatCurrencyWithUsd,
	convertCurrency,
	formatConvertedAmount
} from '$lib/utils/helpers/currencyFormatter';

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
			expect(formatCurrency(null as unknown as number, 'BTC')).toBe('-');
			expect(formatCurrency(undefined as unknown as number, 'USD')).toBe('-');
		});

		it('should handle other currencies (default: amount + currency)', () => {
			expect(formatCurrency(100, 'EUR')).toBe('100 EUR');
		});

		it('should format BTC in sats when isAmountInSats is true', () => {
			expect(formatCurrency(100_000_000, 'BTC', true)).toBe('BTC 1.00000000');
		});
	});

	describe('formatCurrencyWithUsd', () => {
		it('should show sats for BTC when isAmountInSats is true', () => {
			expect(formatCurrencyWithUsd(50_000, 'BTC', true)).toBe('50,000 sats');
		});

		it('should return dash for null or undefined amount', () => {
			expect(formatCurrencyWithUsd(null as unknown as number, 'BTC')).toBe('-');
			expect(formatCurrencyWithUsd(undefined as unknown as number, 'USD')).toBe('-');
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

	describe('formatConvertedAmount', () => {
		const btcPrice = 100_000;

		it('formats USD to USD with default $ prefix and USD suffix', () => {
			expect(formatConvertedAmount(10.53, 'USD')).toBe('$10.53 USD');
			expect(formatConvertedAmount('10.54', 'USD')).toBe('$10.54 USD');
		});

		it('formats SATS to SATS with grouping and default suffix', () => {
			expect(formatConvertedAmount(123400, 'SATS')).toBe('123,400 Sats');
			expect(formatConvertedAmount('123400', 'SATS')).toBe('123,400 Sats');
			expect(formatConvertedAmount(12345, 'SATS')).toBe('12,345 Sats');
		});

		it('formats BTC to BTC with trimmed decimals and default suffix', () => {
			expect(formatConvertedAmount(0.00123, 'BTC')).toBe('0.00123 BTC');
			expect(formatConvertedAmount('0.00123', 'BTC')).toBe('0.00123 BTC');
		});

		it('converts USD to SATS using btcPrice', () => {
			// 1 USD / 100k * 1e8 = 1000 sats
			expect(formatConvertedAmount(1, 'USD', { toCurrency: 'SATS', btcPrice })).toBe('1,000 Sats');
		});

		it('converts SATS to USD using btcPrice', () => {
			// 100_000 sats = 0.001 BTC * 100k = 100 USD
			expect(formatConvertedAmount(100_000, 'SATS', { toCurrency: 'USD', btcPrice })).toBe(
				'$100.00 USD'
			);
		});

		it('converts BTC to USD using btcPrice', () => {
			expect(formatConvertedAmount(0.5, 'BTC', { toCurrency: 'USD', btcPrice })).toBe(
				'$50,000.00 USD'
			);
		});

		it('converts between SATS and BTC without btcPrice', () => {
			expect(formatConvertedAmount(100_000_000, 'SATS', { toCurrency: 'BTC' })).toBe('1 BTC');
			expect(formatConvertedAmount(1, 'BTC', { toCurrency: 'SATS' })).toBe('100,000,000 Sats');
		});

		it('returns zero output when USD conversion is requested without btcPrice', () => {
			expect(formatConvertedAmount(10, 'USD', { toCurrency: 'SATS' })).toBe('0 Sats');
			expect(formatConvertedAmount(1000, 'SATS', { toCurrency: 'USD' })).toBe('$0.00 USD');
		});

		it('allows custom prefix and suffix', () => {
			expect(formatConvertedAmount(10, 'USD', { prefix: '≈ ', suffix: ' (fiat)' })).toBe(
				'≈ 10.00 (fiat)'
			);
			expect(formatConvertedAmount(1000, 'SATS', { prefix: '', suffix: ' satoshis' })).toBe(
				'1,000 satoshis'
			);
		});

		it('allows omitting suffix with empty string', () => {
			expect(formatConvertedAmount(10.54, 'USD', { suffix: '' })).toBe('$10.54');
		});

		it('uses locale for number formatting', () => {
			expect(formatConvertedAmount(1234.56, 'USD', { locale: 'de-DE' })).toBe('$1.234,56 USD');
		});

		it('returns dash for invalid currency or amount', () => {
			expect(formatConvertedAmount(1, 'EUR')).toBe('-');
			expect(formatConvertedAmount('x', 'USD')).toBe('-');
			expect(formatConvertedAmount(1, 'USD', { toCurrency: 'XYZ' as 'USD' })).toBe('-');
		});

		it('accepts case-insensitive currency codes', () => {
			expect(formatConvertedAmount(1, 'usd')).toBe('$1.00 USD');
			expect(formatConvertedAmount(1_000_000, 'sats')).toBe('1,000,000 Sats');
			expect(formatConvertedAmount(0.1, 'btc')).toBe('0.1 BTC');
		});

		it('formats USD and BTC with fixed fractionDigits', () => {
			expect(formatConvertedAmount(10.53, 'USD', { fractionDigits: 0 })).toBe('$11 USD');
			expect(formatConvertedAmount(10.5, 'USD', { fractionDigits: 4 })).toBe('$10.5000 USD');
			expect(formatConvertedAmount(0.00123, 'BTC', { fractionDigits: 6 })).toBe('0.001230 BTC');
		});

		it('formats USD and BTC with minimumFractionDigits / maximumFractionDigits', () => {
			expect(
				formatConvertedAmount(10, 'USD', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
			).toBe('$10 USD');
			expect(
				formatConvertedAmount(0.00123, 'BTC', {
					minimumFractionDigits: 6,
					maximumFractionDigits: 6
				})
			).toBe('0.001230 BTC');
			expect(formatConvertedAmount(0.001234567, 'BTC', { maximumFractionDigits: 4 })).toBe(
				'0.0012 BTC'
			);
		});

		it('ignores fraction options for SATS output', () => {
			expect(formatConvertedAmount(1234, 'SATS', { fractionDigits: 4 })).toBe('1,234 Sats');
		});
	});
});
