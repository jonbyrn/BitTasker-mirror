import { describe, expect, it } from 'vitest';
import {
	defaultBookedHours,
	hourlyBookingAmountUsd,
	normalizeBookedHours
} from '$lib/utils/service-instant-buy/hourly-booking';

describe('hourly booking hours', () => {
	it('books a $10/h service as rate times whole hours', () => {
		expect(hourlyBookingAmountUsd(10, 3)).toBe(30);
		expect(hourlyBookingAmountUsd(10.5, 2)).toBe(21);
	});

	it('defaults an empty estimate to 1 hour and ignores fractions', () => {
		expect(defaultBookedHours(undefined)).toBe(1);
		expect(defaultBookedHours(null)).toBe(1);
		expect(normalizeBookedHours(2.9)).toBe(2);
		expect(normalizeBookedHours(0)).toBe(1);
		expect(normalizeBookedHours(5000)).toBe(1000);
	});

	it('uses the seller estimate when the buyer has not chosen hours yet', () => {
		expect(defaultBookedHours(5)).toBe(5);
	});
});
