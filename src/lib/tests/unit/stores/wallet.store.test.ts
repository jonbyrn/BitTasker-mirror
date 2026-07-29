import { describe, it, expect, vi } from 'vitest';

// Mock the SDK before importing wallet.store
vi.mock('@bittasker/wallet-core', () => ({
	WalletManager: vi.fn(),
	ARB_TOKEN_ADDRESSES: {
		USDT0: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
		WBTC: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f',
		TBTC: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40'
	}
}));

import { formatSats, formatUsd, formatAddress } from '$lib/stores/wallet.store';

describe('Wallet Store Utilities', () => {
	describe('formatSats', () => {
		it('should format zero sats', () => {
			expect(formatSats(0)).toBe('0');
		});

		it('should format small amounts', () => {
			expect(formatSats(1)).toBe('1');
			expect(formatSats(100)).toBe('100');
			expect(formatSats(1000)).toBe('1,000');
		});

		it('should format large amounts with commas', () => {
			expect(formatSats(1000000)).toBe('1,000,000');
			expect(formatSats(100000000)).toBe('100,000,000');
		});

		it('should handle negative amounts', () => {
			expect(formatSats(-1000)).toBe('-1,000');
		});

		it('should handle decimal amounts', () => {
			// formatSats uses toLocaleString which formats decimals
			expect(formatSats(1000.5)).toBe('1,000.5');
			expect(formatSats(1000.9)).toBe('1,000.9');
		});
	});

	describe('formatUsd', () => {
		it('should format zero dollars', () => {
			expect(formatUsd(0)).toBe('$0.00');
		});

		it('should format small amounts', () => {
			expect(formatUsd(0.01)).toBe('$0.01');
			expect(formatUsd(1)).toBe('$1.00');
			expect(formatUsd(10.5)).toBe('$10.50');
		});

		it('should format large amounts with commas', () => {
			expect(formatUsd(1000)).toBe('$1,000.00');
			expect(formatUsd(1000000)).toBe('$1,000,000.00');
		});

		it('should handle negative amounts', () => {
			expect(formatUsd(-10.5)).toBe('-$10.50');
		});

		it('should round to 2 decimal places', () => {
			expect(formatUsd(10.999)).toBe('$11.00');
			expect(formatUsd(10.994)).toBe('$10.99');
		});
	});

	describe('formatAddress', () => {
		it('should truncate long addresses', () => {
			const address = '0x1234567890123456789012345678901234567890';
			const result = formatAddress(address);
			expect(result).toBe('0x1234...7890');
		});

		it('should use custom start and end characters', () => {
			const address = '0x1234567890123456789012345678901234567890';
			const result = formatAddress(address, 4, 4);
			expect(result).toBe('0x12...7890');
		});

		it('should handle short addresses', () => {
			const address = '0x1234';
			const result = formatAddress(address, 6, 4);
			// If address is shorter than start + end, should return as-is or handle gracefully
			expect(result.length).toBeLessThanOrEqual(address.length + 3); // +3 for '...'
		});

		it('should handle empty string', () => {
			expect(formatAddress('')).toBe('');
		});
	});
});
