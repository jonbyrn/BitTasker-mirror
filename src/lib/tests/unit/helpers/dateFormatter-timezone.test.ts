import { describe, it, expect } from 'vitest';
import {
	toUnixSeconds,
	coerceUnixSeconds,
	normalizeDateToUTC,
	normalizeDeadlineToEndOfDay
} from '$lib/utils/helpers/dateFormatter';

describe('dateFormatter - timezone/normalization', () => {
	describe('toUnixSeconds', () => {
		it('should convert a valid Date to Unix seconds', () => {
			const d = new Date(Date.UTC(2025, 8, 23, 12, 0, 0)); // Sep 23, 2025 12:00 UTC
			const result = toUnixSeconds(d);
			// 2025-09-23T12:00:00Z = 1758628800
			expect(result).toBe(1758628800);
		});

		it('should return null for null input', () => {
			expect(toUnixSeconds(null)).toBeNull();
		});

		it('should return null for undefined input', () => {
			expect(toUnixSeconds(undefined)).toBeNull();
		});

		it('should return null for an Invalid Date', () => {
			expect(toUnixSeconds(new Date('invalid'))).toBeNull();
		});
	});

	describe('coerceUnixSeconds', () => {
		it('should return null for null input', () => {
			expect(coerceUnixSeconds(null)).toBeNull();
		});

		it('should return null for undefined input', () => {
			expect(coerceUnixSeconds(undefined)).toBeNull();
		});

		it('should return 0 for the number 0', () => {
			expect(coerceUnixSeconds(0)).toBe(0);
		});

		it('should return -1 for a negative number', () => {
			expect(coerceUnixSeconds(-1)).toBe(-1);
		});

		it('should pass through a value that is already seconds (< 1e12)', () => {
			expect(coerceUnixSeconds(1700000000)).toBe(1700000000);
		});

		it('should convert milliseconds (> 1e12) to seconds', () => {
			expect(coerceUnixSeconds(1700000000000)).toBe(1700000000);
		});

		it('should return null for NaN', () => {
			expect(coerceUnixSeconds(NaN)).toBeNull();
		});

		it('should return null for Infinity', () => {
			expect(coerceUnixSeconds(Infinity)).toBeNull();
		});

		it('should return null for an empty string', () => {
			expect(coerceUnixSeconds('')).toBeNull();
		});

		it('should handle a numeric string in seconds', () => {
			expect(coerceUnixSeconds('1700000000')).toBe(1700000000);
		});

		it('should handle an ISO string with Z', () => {
			const result = coerceUnixSeconds('2025-09-23T12:00:00Z');
			expect(result).toBe(1758628800);
		});

		it('should handle a local-time string "YYYY-MM-DDTHH:mm:ss"', () => {
			// This gets parsed as local time; the exact number depends on system timezone offset.
			// For a system at UTC, 2025-09-23T12:00:00 = 1758628800.
			// Just verify it returns a number.
			const result = coerceUnixSeconds('2025-09-23T12:00:00');
			expect(result).toBeTypeOf('number');
			expect(result).toBeGreaterThan(0);
		});
	});

	describe('normalizeDateToUTC', () => {
		it('should normalize a YYYY-MM-DD string to UTC midnight', () => {
			const result = normalizeDateToUTC('2025-09-23');
			expect(result).toBe('2025-09-23T00:00:00.000Z');
		});

		it('should normalize a Date object with local time to UTC midnight', () => {
			// Sep 23, 2025 at midnight local time
			const d = new Date(2025, 8, 23);
			const result = normalizeDateToUTC(d);
			expect(result).toBe('2025-09-23T00:00:00.000Z');
		});

		it('should handle an ISO string with time portion', () => {
			const result = normalizeDateToUTC('2025-09-23T12:30:00.000Z');
			expect(result).toBe('2025-09-23T00:00:00.000Z');
		});

		it('should return undefined for null input', () => {
			expect(normalizeDateToUTC(null)).toBeUndefined();
		});

		it('should return undefined for undefined input', () => {
			expect(normalizeDateToUTC(undefined)).toBeUndefined();
		});
	});

	describe('normalizeDeadlineToEndOfDay', () => {
		it('should normalize a YYYY-MM-DD string to end of day UTC', () => {
			const result = normalizeDeadlineToEndOfDay('2025-09-23');
			expect(result).toBe('2025-09-23T23:59:59.999Z');
		});

		it('should normalize a Date object with local time to end of day UTC', () => {
			const d = new Date(2025, 8, 23);
			const result = normalizeDeadlineToEndOfDay(d);
			expect(result).toBe('2025-09-23T23:59:59.999Z');
		});

		it('should handle an ISO string with time portion', () => {
			const result = normalizeDeadlineToEndOfDay('2025-09-23T12:30:00.000Z');
			expect(result).toBe('2025-09-23T23:59:59.999Z');
		});

		it('should return undefined for null input', () => {
			expect(normalizeDeadlineToEndOfDay(null)).toBeUndefined();
		});

		it('should return undefined for undefined input', () => {
			expect(normalizeDeadlineToEndOfDay(undefined)).toBeUndefined();
		});
	});
});
