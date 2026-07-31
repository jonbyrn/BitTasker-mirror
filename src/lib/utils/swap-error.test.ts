import { describe, it, expect } from 'vitest';
import { sanitizeSwapError } from '$lib/utils/swap-error';

describe('sanitizeSwapError', () => {
	describe('Fix: "Insufficient RBTC for gas" mapping', () => {
		it('should map "Insufficient RBTC for gas" to insufficient_rsk_gas key', () => {
			const result = sanitizeSwapError(
				'Insufficient RBTC for gas: need 50000 sats (swap 40000 + gas 10000), have 35000 sats. Shortfall: 15000 sats.'
			);
			expect(result).toBe('wallet.swap.error.insufficient_rsk_gas');
		});

		it('should map case-insensitive "insufficient rbtc for gas" variations', () => {
			expect(sanitizeSwapError('insufficient rbtc for gas')).toBe(
				'wallet.swap.error.insufficient_rsk_gas'
			);
			expect(sanitizeSwapError('INSUFFICIENT RBTC FOR GAS')).toBe(
				'wallet.swap.error.insufficient_rsk_gas'
			);
			expect(sanitizeSwapError('Insufficient Rbtc For Gas: details here')).toBe(
				'wallet.swap.error.insufficient_rsk_gas'
			);
		});

		it('should map "Insufficient RBTC for gas" with transaction hex stripped', () => {
			const result = sanitizeSwapError(
				'Insufficient RBTC for gas (transaction="0xabcdef1234567890")'
			);
			expect(result).toBe('wallet.swap.error.insufficient_rsk_gas');
		});
	});

	describe('existing behavior preserved', () => {
		it('should still map generic "insufficient funds" to insufficient_funds', () => {
			expect(sanitizeSwapError('insufficient funds for gas')).toBe(
				'wallet.swap.error.insufficient_funds'
			);
		});

		it('should map "nonce too low" to nonce_conflict', () => {
			expect(sanitizeSwapError('nonce too low')).toBe('wallet.swap.error.nonce_conflict');
		});

		it('should map "user rejected" to user_rejected', () => {
			expect(sanitizeSwapError('user rejected the request')).toBe(
				'wallet.swap.error.user_rejected'
			);
		});

		it('should return empty string for null/undefined input', () => {
			expect(sanitizeSwapError(null)).toBe('');
			expect(sanitizeSwapError(undefined)).toBe('');
		});

		it('should truncate unknown errors to 120 chars', () => {
			const longError = 'a'.repeat(200);
			const result = sanitizeSwapError(longError);
			expect(result.length).toBeLessThanOrEqual(120);
			expect(result).toBe('a'.repeat(117) + '...');
		});
	});
});
