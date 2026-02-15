import { describe, it, expect, vi, beforeEach } from 'vitest';
import { decode } from 'bolt11';
import {
	detectLightningType,
	parseLightningInvoice,
	isLightningInvoice,
	isBolt11Invoice,
	isBolt12Invoice,
	isLightningAddress
} from '$lib/utils/helpers/lightningInvoice';

vi.mock('bolt11', () => ({
	decode: vi.fn()
}));

describe('lightningInvoice', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('detectLightningType', () => {
		it('should return unknown for empty or non-string input', () => {
			expect(detectLightningType('')).toBe('unknown');
			expect(detectLightningType(undefined as unknown as string)).toBe('unknown');
			expect(detectLightningType(null as unknown as string)).toBe('unknown');
		});

		it('should return lightning-address for email format', () => {
			expect(detectLightningType('user@domain.com')).toBe('lightning-address');
			expect(detectLightningType('  alice@getalby.com  ')).toBe('lightning-address');
		});

		it('should return bolt12 for lno, lnr, lni prefixes', () => {
			expect(detectLightningType('lno1pg...')).toBe('bolt12');
			expect(detectLightningType('lnr1pg...')).toBe('bolt12');
			expect(detectLightningType('lni1abc...')).toBe('bolt12');
		});

		it('should return bolt11 for lnbc, lntb, lnbcrt, ln prefixes', () => {
			expect(detectLightningType('lnbc1000n1...')).toBe('bolt11');
			expect(detectLightningType('lntb1000n1...')).toBe('bolt11');
			expect(detectLightningType('lnbcrt1000n1...')).toBe('bolt11');
			expect(detectLightningType('ln1000n1...')).toBe('bolt11');
		});

		it('should be case-insensitive', () => {
			expect(detectLightningType('LNBC1000n1...')).toBe('bolt11');
			expect(detectLightningType('LNO1pg...')).toBe('bolt12');
		});

		it('should return unknown for unrelated strings', () => {
			expect(detectLightningType('hello')).toBe('unknown');
			expect(detectLightningType('bitcoin:bc1...')).toBe('unknown');
		});
	});

	describe('parseLightningInvoice', () => {
		it('should return invalid for empty or non-string', () => {
			const invalid = { isValid: false, amountSats: null, hasAmount: false, description: null };
			expect(parseLightningInvoice('')).toEqual(invalid);
			expect(parseLightningInvoice(undefined as unknown as string)).toEqual(invalid);
		});

		it('should return invalid for non-BOLT11 types', () => {
			const invalid = { isValid: false, amountSats: null, hasAmount: false, description: null };
			expect(parseLightningInvoice('user@domain.com')).toEqual(invalid);
			expect(parseLightningInvoice('lno1pg...')).toEqual(invalid);
		});

		it('should return valid with amount when bolt11 decode returns satoshis', () => {
			vi.mocked(decode).mockReturnValue({
				satoshis: 1000,
				millisatoshis: null,
				tags: []
			} as unknown as ReturnType<typeof decode>);
			const result = parseLightningInvoice('lnbc1000n1...');
			expect(result).toEqual({
				isValid: true,
				amountSats: 1000,
				hasAmount: true,
				description: null
			});
		});

		it('should convert millisatoshis to sats when bolt11 returns millisatoshis', () => {
			vi.mocked(decode).mockReturnValue({
				satoshis: null,
				millisatoshis: 2500,
				tags: []
			} as unknown as ReturnType<typeof decode>);
			const result = parseLightningInvoice('lnbc...');
			expect(result.amountSats).toBe(2);
			expect(result.hasAmount).toBe(true);
		});

		it('should extract description from tags', () => {
			vi.mocked(decode).mockReturnValue({
				satoshis: 100,
				millisatoshis: null,
				tags: [{ tagName: 'description', data: 'Coffee' }]
			} as unknown as ReturnType<typeof decode>);
			const result = parseLightningInvoice('lnbc...');
			expect(result.description).toBe('Coffee');
		});

		it('should return invalid when bolt11 decode throws', () => {
			vi.mocked(decode).mockImplementation(() => {
				throw new Error('Invalid invoice');
			});
			const result = parseLightningInvoice('lnbcinvalid...');
			expect(result.isValid).toBe(false);
			expect(result.amountSats).toBeNull();
			expect(result.description).toBeNull();
		});
	});

	describe('isLightningInvoice', () => {
		it('should return true for bolt11 and bolt12', () => {
			expect(isLightningInvoice('lnbc1000n1...')).toBe(true);
			expect(isLightningInvoice('lno1pg...')).toBe(true);
		});

		it('should return false for lightning-address and unknown', () => {
			expect(isLightningInvoice('user@domain.com')).toBe(false);
			expect(isLightningInvoice('hello')).toBe(false);
			expect(isLightningInvoice('')).toBe(false);
		});
	});

	describe('isBolt11Invoice', () => {
		it('should return true only for bolt11 prefix', () => {
			expect(isBolt11Invoice('lnbc1000n1...')).toBe(true);
			expect(isBolt11Invoice('lno1pg...')).toBe(false);
		});
	});

	describe('isBolt12Invoice', () => {
		it('should return true only for bolt12 prefixes', () => {
			expect(isBolt12Invoice('lno1pg...')).toBe(true);
			expect(isBolt12Invoice('lnbc1000n1...')).toBe(false);
		});
	});

	describe('isLightningAddress', () => {
		it('should return true for valid email format', () => {
			expect(isLightningAddress('user@domain.com')).toBe(true);
			expect(isLightningAddress('alice@getalby.com')).toBe(true);
		});

		it('should return false for empty or non-email', () => {
			expect(isLightningAddress('')).toBe(false);
			expect(isLightningAddress('not-an-email')).toBe(false);
			expect(isLightningAddress('missing@tld')).toBe(false);
		});
	});
});
