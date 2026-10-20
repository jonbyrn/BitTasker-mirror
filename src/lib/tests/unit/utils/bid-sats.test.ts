import { describe, expect, it } from 'vitest';
import { currencyCache } from '$lib/utils/cache/bid-cache';

describe('currencyCache', () => {
	it('does not turn a missing BTC price into Infinity sats', () => {
		currencyCache.clear();
		expect(currencyCache.setConversion(1, 0)).toBeNull();
		expect(currencyCache.getConversion(1, 0)).toBeNull();
		expect(currencyCache.batchConvert([1], Number.NaN)).toEqual([null]);
	});

	it('converts a dollar amount when the price is known', () => {
		currencyCache.clear();
		expect(currencyCache.setConversion(1, 100_000)).toBe(1_000);
		expect(currencyCache.getConversion(1, 100_000)).toBe(1_000);
	});
});
