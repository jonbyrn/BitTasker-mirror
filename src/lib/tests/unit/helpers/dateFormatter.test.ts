import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, formatStandardDate, timeAgo } from '$lib/utils/helpers/dateFormatter';

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
});
