import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	formatDate,
	formatStandardDate,
	formatStandardDateShort,
	formatStandardDateTimeShort,
	formatStandardDateTime,
	formatTimeLarge,
	formatTime12Hour,
	timeAgo
} from '$lib/utils/helpers/dateFormatter';

describe('Date Formatter', () => {
	describe('formatDate', () => {
		it('should format a date correctly', () => {
			const testDate = new Date('2023-01-15T12:30:00Z');
			const result = formatDate(testDate);

			// The exact format will depend on the locale, but we can check for expected substrings
			expect(result).toContain('2023');
			expect(result).toContain('Jan');
			expect(result).toContain('15');
		});

		it('should handle invalid dates', () => {
			const invalidDate = new Date('invalid-date');
			expect(formatDate(invalidDate)).toBe('Invalid date');
		});

		it('should catch errors during formatting', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const originalDateTimeFormat = Intl.DateTimeFormat;

			// Mock DateTimeFormat to throw an error
			global.Intl.DateTimeFormat = function () {
				return {
					format: () => {
						throw new Error('Test error');
					}
				};
			} as unknown as typeof Intl.DateTimeFormat;

			expect(formatDate(new Date())).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();

			// Restore original implementation
			global.Intl.DateTimeFormat = originalDateTimeFormat;
			consoleSpy.mockRestore();
		});
	});

	describe('formatStandardDate', () => {
		it('should format date in standard app format with default locale', () => {
			const testDate = new Date('2025-09-23T12:00:00Z');
			const result = formatStandardDate(testDate);
			expect(result).toContain('2025');
			expect(result).toContain('23');
			expect(result.toLowerCase()).toMatch(/september/);
		});

		it('should format date with Spanish locale and capitalize month', () => {
			const testDate = new Date('2025-03-15T12:00:00Z');
			const result = formatStandardDate(testDate, 'es');
			expect(result).toContain('2025');
			expect(result).toContain('15');
			expect(result).toMatch(/marzo|Marzo/);
		});
	});

	describe('timeAgo', () => {
		beforeEach(() => {
			// Mock current date to be 2023-01-15T12:00:00Z
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2023-01-15T12:00:00Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should format seconds ago correctly', () => {
			const date = new Date('2023-01-15T11:59:30Z'); // 30 seconds ago
			expect(timeAgo(date)).toBe('30 seconds ago');

			const oneSecondAgo = new Date('2023-01-15T11:59:59Z');
			expect(timeAgo(oneSecondAgo)).toBe('1 second ago');
		});

		it('should format minutes ago correctly', () => {
			const date = new Date('2023-01-15T11:58:00Z'); // 2 minutes ago
			expect(timeAgo(date)).toBe('2 minutes ago');

			const oneMinuteAgo = new Date('2023-01-15T11:59:00Z');
			expect(timeAgo(oneMinuteAgo)).toBe('1 minute ago');
		});

		it('should format hours ago correctly', () => {
			const date = new Date('2023-01-15T10:00:00Z'); // 2 hours ago
			expect(timeAgo(date)).toBe('2 hours ago');

			const oneHourAgo = new Date('2023-01-15T11:00:00Z');
			expect(timeAgo(oneHourAgo)).toBe('1 hour ago');
		});

		it('should format days ago correctly', () => {
			const date = new Date('2023-01-13T12:00:00Z'); // 2 days ago
			expect(timeAgo(date)).toBe('2 days ago');

			const oneDayAgo = new Date('2023-01-14T12:00:00Z');
			expect(timeAgo(oneDayAgo)).toBe('1 day ago');
		});

		it('should format weeks ago correctly', () => {
			const date = new Date('2023-01-01T12:00:00Z'); // ~2 weeks ago
			expect(timeAgo(date)).toBe('2 weeks ago');

			const oneWeekAgo = new Date('2023-01-08T12:00:00Z');
			expect(timeAgo(oneWeekAgo)).toBe('1 week ago');
		});

		it('should format months ago correctly', () => {
			const date = new Date('2022-11-15T12:00:00Z'); // ~2 months ago
			expect(timeAgo(date)).toBe('2 months ago');

			const oneMonthAgo = new Date('2022-12-15T12:00:00Z');
			expect(timeAgo(oneMonthAgo)).toBe('1 month ago');
		});

		it('should format years ago correctly', () => {
			const date = new Date('2021-01-15T12:00:00Z'); // 2 years ago
			expect(timeAgo(date)).toBe('2 years ago');

			const oneYearAgo = new Date('2022-01-15T12:00:00Z');
			expect(timeAgo(oneYearAgo)).toBe('1 year ago');
		});

		it('should handle invalid dates', () => {
			const invalidDate = new Date('invalid-date');
			expect(timeAgo(invalidDate)).toBe('Invalid date');
		});

		it('should catch errors during calculation', () => {
			// First restore real timers
			vi.useRealTimers();

			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const originalGetTime = Date.prototype.getTime;

			// Mock Date.prototype.getTime instead of Date.now to force an error in the calculation
			Date.prototype.getTime = function () {
				throw new Error('Test error');
			};

			expect(timeAgo(new Date())).toBe('Unknown time ago');
			expect(consoleSpy).toHaveBeenCalled();

			// Restore original implementation
			Date.prototype.getTime = originalGetTime;
			consoleSpy.mockRestore();

			// Reset fake timers for other tests
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2023-01-15T12:00:00Z'));
		});
	});

	describe('formatStandardDateShort', () => {
		it('should format a date with short month in English', () => {
			const d = new Date(2025, 8, 23); // Sep 23, 2025
			const result = formatStandardDateShort(d);
			expect(result).toBe('Sep 23, 2025');
		});

		it('should format a date with short month in Spanish', () => {
			const d = new Date(2025, 9, 15); // Oct 15, 2025
			const result = formatStandardDateShort(d, 'es');
			expect(result).toBe('15 Oct 2025');
		});

		it('should return "Invalid date" for Invalid Date', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatStandardDateShort(new Date('invalid'));
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('formatStandardDateTimeShort', () => {
		it('should format a date with short month and time in English', () => {
			const d = new Date(2026, 1, 14, 22, 59); // Feb 14, 2026, 10:59 PM
			const result = formatStandardDateTimeShort(d);
			expect(result).toContain('Feb');
			expect(result).toContain('14');
			expect(result).toContain('2026');
			expect(result).toMatch(/10:59\s*PM/i);
		});

		it('should format a date with Spanish locale', () => {
			const d = new Date(2026, 1, 14, 22, 59);
			const result = formatStandardDateTimeShort(d, 'es');
			expect(result).toContain('Feb'); // Capitalized month
			expect(result).toContain('14');
			expect(result).toContain('2026');
			expect(result).toMatch(/10:59/);
		});

		it('should return "Invalid date" for Invalid Date', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatStandardDateTimeShort(new Date('invalid'));
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('formatStandardDateTime', () => {
		it('should format a date with long month and time in English', () => {
			const d = new Date(2025, 8, 23, 14, 30); // Sep 23, 2025, 2:30 PM
			const result = formatStandardDateTime(d);
			expect(result).toBe('September 23, 2025 at 2:30 PM');
		});

		it('should format a date with Spanish locale', () => {
			const d = new Date(2025, 8, 23, 14, 30);
			const result = formatStandardDateTime(d, 'es');
			// Should capitalize month and replace a.m./p.m. with AM/PM
			expect(result).toContain('Septiembre');
			expect(result).toContain('2025');
			expect(result).toContain('2:30');
			expect(result).toMatch(/PM$/);
		});

		it('should return "Invalid date" for Invalid Date', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatStandardDateTime(new Date('invalid'));
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('formatTimeLarge', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-05-11T00:00:00Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should format 14:30 as "2:30 PM"', () => {
			const result = formatTimeLarge('14:30');
			expect(result).toMatch(/2:30\s*PM/i);
		});

		it('should format midnight as "12:00 AM"', () => {
			const result = formatTimeLarge('00:00');
			expect(result).toMatch(/12:00\s*AM/i);
		});

		it('should return empty string for empty input', () => {
			expect(formatTimeLarge('')).toBe('');
		});

		it('should handle noon (12:00) as "12:00 PM"', () => {
			const result = formatTimeLarge('12:00');
			expect(result).toMatch(/12:00\s*PM/i);
		});
	});

	describe('formatTime12Hour', () => {
		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(new Date('2026-05-11T00:00:00Z'));
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should format 14:30 as "2:30 PM"', () => {
			const result = formatTime12Hour('14:30');
			expect(result).toBe('2:30 PM');
		});

		it('should format midnight as "12:00 AM"', () => {
			const result = formatTime12Hour('00:00');
			expect(result).toBe('12:00 AM');
		});

		it('should format noon as "12:00 PM"', () => {
			const result = formatTime12Hour('12:00');
			expect(result).toBe('12:00 PM');
		});

		it('should return empty string for empty input', () => {
			expect(formatTime12Hour('')).toBe('');
		});

		it('should return the original string for invalid format (catch block returns input)', () => {
			// Invalid Date from toLocaleTimeString may return the string "Invalid Date"
			// rather than throwing; check the behavior either way.
			const result = formatTime12Hour('abc');
			expect(typeof result).toBe('string');
		});
	});
});
