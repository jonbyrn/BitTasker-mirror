import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatTimeAgo } from '$lib/utils/helpers/date';

describe('date', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('formatTimeAgo', () => {
		it('should return "now" for dates within the last minute', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			const date = new Date('2025-02-15T11:59:30Z');
			expect(formatTimeAgo(date)).toBe('now');
		});

		it('should return minutes for dates within the last hour', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2025-02-15T11:55:00Z'))).toBe('5m');
			expect(formatTimeAgo(new Date('2025-02-15T11:30:00Z'))).toBe('30m');
		});

		it('should return hours for dates within the last day', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2025-02-15T10:00:00Z'))).toBe('2h');
			expect(formatTimeAgo(new Date('2025-02-14T13:00:00Z'))).toBe('23h');
		});

		it('should return days for dates within the last week', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2025-02-14T12:00:00Z'))).toBe('1d');
			expect(formatTimeAgo(new Date('2025-02-10T12:00:00Z'))).toBe('5d');
		});

		it('should return weeks for dates within the last month', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2025-02-08T12:00:00Z'))).toBe('1w');
			expect(formatTimeAgo(new Date('2025-02-01T12:00:00Z'))).toBe('2w');
		});

		it('should return months for dates within the last year', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2025-01-15T12:00:00Z'))).toBe('1mo');
			expect(formatTimeAgo(new Date('2024-06-15T12:00:00Z'))).toBe('8mo');
		});

		it('should return years for older dates', () => {
			vi.setSystemTime(new Date('2025-02-15T12:00:00Z'));
			expect(formatTimeAgo(new Date('2024-02-15T12:00:00Z'))).toBe('1y');
			expect(formatTimeAgo(new Date('2023-02-15T12:00:00Z'))).toBe('2y');
		});

		it('should return "Invalid" for invalid dates', () => {
			expect(formatTimeAgo(new Date('invalid'))).toBe('Invalid');
		});
	});
});
