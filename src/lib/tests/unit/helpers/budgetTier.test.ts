import { describe, it, expect } from 'vitest';
import {
	getBudgetBucket,
	getBudgetTiersForRange,
	getBudgetTiersForCurrency
} from '$lib/utils/helpers/budgetTier';

describe('budgetTier', () => {
	describe('getBudgetBucket', () => {
		it('should return micro for zero or falsy amount', () => {
			expect(getBudgetBucket(0, 'USD')).toBe('micro');
			expect(getBudgetBucket(0, 'SATS')).toBe('micro');
		});

		it('should return correct USD tiers', () => {
			expect(getBudgetBucket(50, 'USD')).toBe('micro');
			expect(getBudgetBucket(99, 'USD')).toBe('micro');
			expect(getBudgetBucket(100, 'USD')).toBe('small');
			expect(getBudgetBucket(499, 'USD')).toBe('small');
			expect(getBudgetBucket(500, 'USD')).toBe('medium');
			expect(getBudgetBucket(999, 'USD')).toBe('medium');
			expect(getBudgetBucket(1000, 'USD')).toBe('large');
			expect(getBudgetBucket(4999, 'USD')).toBe('large');
			expect(getBudgetBucket(5000, 'USD')).toBe('enterprise');
			expect(getBudgetBucket(100000, 'USD')).toBe('enterprise');
		});

		it('should be case-insensitive for USD', () => {
			expect(getBudgetBucket(200, 'usd')).toBe('small');
			expect(getBudgetBucket(200, 'Usd')).toBe('small');
		});

		it('should return correct SATS tiers', () => {
			expect(getBudgetBucket(1, 'SATS')).toBe('micro');
			expect(getBudgetBucket(999, 'SATS')).toBe('micro');
			expect(getBudgetBucket(1000, 'SATS')).toBe('small');
			expect(getBudgetBucket(9999, 'SATS')).toBe('small');
			expect(getBudgetBucket(10000, 'SATS')).toBe('medium');
			expect(getBudgetBucket(99999, 'SATS')).toBe('medium');
			expect(getBudgetBucket(100000, 'SATS')).toBe('large');
			expect(getBudgetBucket(999999, 'SATS')).toBe('large');
			expect(getBudgetBucket(1000000, 'SATS')).toBe('enterprise');
			expect(getBudgetBucket(5000000, 'SATS')).toBe('enterprise');
		});

		it('should treat non-SATS currency as USD (e.g. BTC)', () => {
			expect(getBudgetBucket(200, 'BTC')).toBe('small');
			expect(getBudgetBucket(100, 'EUR')).toBe('small');
		});
	});

	describe('getBudgetTiersForRange', () => {
		it('should return null when both min and max are missing', () => {
			expect(getBudgetTiersForRange()).toBeNull();
			expect(getBudgetTiersForRange(undefined, undefined)).toBeNull();
		});

		it('should return tier that encompasses range (USD)', () => {
			expect(getBudgetTiersForRange(0, 50, 'USD')).toBe('micro');
			expect(getBudgetTiersForRange(100, 400, 'USD')).toBe('small');
			expect(getBudgetTiersForRange(500, 800, 'USD')).toBe('medium');
			expect(getBudgetTiersForRange(1000, 3000, 'USD')).toBe('large');
			expect(getBudgetTiersForRange(5000, 10000, 'USD')).toBe('enterprise');
		});

		it('should return tier that encompasses range (SATS)', () => {
			expect(getBudgetTiersForRange(0, 500, 'SATS')).toBe('micro');
			expect(getBudgetTiersForRange(1000, 5000, 'SATS')).toBe('small');
			expect(getBudgetTiersForRange(10000, 50000, 'SATS')).toBe('medium');
			expect(getBudgetTiersForRange(100000, 500000, 'SATS')).toBe('large');
			expect(getBudgetTiersForRange(1000000, 2000000, 'SATS')).toBe('enterprise');
		});

		it('should work with only min or only max', () => {
			// Only min: range [250, Infinity]; enterprise (5000–∞) has unbounded overlap → enterprise
			expect(getBudgetTiersForRange(250, undefined, 'USD')).toBe('enterprise');
			// Only max: range [0, 250]; small (100–500) has overlap 150 → small
			expect(getBudgetTiersForRange(undefined, 250, 'USD')).toBe('small');
		});

		it('should default currency to USD', () => {
			expect(getBudgetTiersForRange(200, 300)).toBe('small');
		});

		it('should return best overlapping tier when range spans multiple tiers', () => {
			// Range 80-120: micro (0-100) and small (100-500) both have overlap 20; first in list wins
			expect(getBudgetTiersForRange(80, 120, 'USD')).toBe('micro');
			// Range 50-300: small (100-500) has overlap 200, micro (0-100) has 50 → small wins
			expect(getBudgetTiersForRange(50, 300, 'USD')).toBe('small');
		});
	});

	describe('getBudgetTiersForCurrency', () => {
		it('should return empty array for falsy currency', () => {
			expect(getBudgetTiersForCurrency('')).toEqual([]);
			expect(getBudgetTiersForCurrency(undefined as unknown as string)).toEqual([]);
		});

		it('should return USD tiers by default', () => {
			const tiers = getBudgetTiersForCurrency('USD');
			expect(tiers).toHaveLength(5);
			expect(tiers.map((t) => t.tier)).toEqual(['micro', 'small', 'medium', 'large', 'enterprise']);
			expect(tiers[0]).toEqual({ tier: 'micro', min: 0, max: 100, label: 'Under $100' });
			expect(tiers[4].label).toBe('$5K+');
			expect(tiers[4].max).toBe(Infinity);
		});

		it('should return SATS tiers for SATS currency', () => {
			const tiers = getBudgetTiersForCurrency('SATS');
			expect(tiers).toHaveLength(5);
			expect(tiers[0].label).toBe('< 1,000 sats (~$40)');
			expect(tiers[0].min).toBe(0);
			expect(tiers[0].max).toBe(1000);
			expect(tiers[4].tier).toBe('enterprise');
			expect(tiers[4].min).toBe(1000000);
			expect(tiers[4].max).toBe(Infinity);
		});

		it('should be case-insensitive for currency', () => {
			const tiers = getBudgetTiersForCurrency('sats');
			expect(tiers).toHaveLength(5);
			expect(tiers[0].max).toBe(1000);
		});
	});
});
