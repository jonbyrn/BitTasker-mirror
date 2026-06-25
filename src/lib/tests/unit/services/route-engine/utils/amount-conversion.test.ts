/**
 * Route Engine — Amount Conversion Unit Tests
 *
 * Tests satsToTokenAmount() and tokenAmountToSats() for common
 * decimal configurations (18, 8, 6) and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
	satsToTokenAmount,
	tokenAmountToSats
} from '$lib/services/route-engine/utils/amount-conversion';

describe('satsToTokenAmount()', () => {
	it('18 decimals: sats × 1e10', () => {
		expect(satsToTokenAmount(100_000, 18)).toBe('1000000000000000');
	});

	it('8 decimals: sats are already the smallest unit', () => {
		expect(satsToTokenAmount(100_000, 8)).toBe('100000');
	});

	it('6 decimals: sats / 100', () => {
		expect(satsToTokenAmount(100_000, 6)).toBe('1000');
	});

	it('0 sats returns "0" for 18 decimals', () => {
		expect(satsToTokenAmount(0, 18)).toBe('0');
	});
});

describe('tokenAmountToSats()', () => {
	it('returns 0 for "NaN" input', () => {
		expect(tokenAmountToSats('NaN', 18)).toBe(0);
	});

	it('returns 0 for "invalid" input', () => {
		expect(tokenAmountToSats('invalid', 8)).toBe(0);
	});
});

describe('round-trip: satsToTokenAmount → tokenAmountToSats', () => {
	it('18 decimals round-trip', () => {
		const sats = 100_000;
		const token = satsToTokenAmount(sats, 18);
		expect(tokenAmountToSats(token, 18)).toBe(sats);
	});

	it('8 decimals round-trip', () => {
		const sats = 100_000;
		const token = satsToTokenAmount(sats, 8);
		expect(tokenAmountToSats(token, 8)).toBe(sats);
	});

	it('6 decimals round-trip', () => {
		const sats = 100_000;
		const token = satsToTokenAmount(sats, 6);
		expect(tokenAmountToSats(token, 6)).toBe(sats);
	});

	it('9 decimals (generic) round-trip', () => {
		const sats = 100_000;
		const token = satsToTokenAmount(sats, 9);
		expect(tokenAmountToSats(token, 9)).toBe(sats);
	});
});
