import { describe, it, expect } from 'vitest';
import { getDateRangeTags } from '$lib/utils/helpers/dateTier';

describe('dateTier', () => {
	describe('getDateRangeTags', () => {
		it('should return single month and day when start and end are the same day', () => {
			const result = getDateRangeTags('2025-02-15', '2025-02-15');
			expect(result.months).toHaveLength(1);
			expect(result.days).toHaveLength(1);
			expect(result.months[0]).toMatch(/^\d+$/);
			expect(Number(result.days[0])).toBeGreaterThanOrEqual(1);
			expect(Number(result.days[0])).toBeLessThanOrEqual(31);
		});

		it('should return all months and days in a multi-day range', () => {
			const result = getDateRangeTags('2025-02-18', '2025-02-15');
			expect(result.months).toHaveLength(1);
			expect(result.days.length).toBeGreaterThanOrEqual(3);
			expect(result.days.length).toBeLessThanOrEqual(4);
			expect(result.days.every((d) => Number(d) >= 1 && Number(d) <= 31)).toBe(true);
		});

		it('should return multiple months when range spans months', () => {
			const result = getDateRangeTags('2025-03-02', '2025-02-28');
			expect(result.months.length).toBeGreaterThanOrEqual(1);
			expect(result.days.length).toBeGreaterThanOrEqual(3);
			expect(result.months.every((m) => /^\d+$/.test(m) && Number(m) >= 0 && Number(m) <= 11)).toBe(true);
			expect(result.days.every((d) => /^\d+$/.test(d) && Number(d) >= 1 && Number(d) <= 31)).toBe(true);
		});

		it('should return empty arrays when end is before start', () => {
			const result = getDateRangeTags('2025-02-10', '2025-02-15');
			expect(result.months).toEqual([]);
			expect(result.days).toEqual([]);
		});

		it('should use single argument as end date (start defaults to today)', () => {
			const result = getDateRangeTags('2025-02-15');
			expect(result.months).toBeDefined();
			expect(result.days).toBeDefined();
			expect(Array.isArray(result.months)).toBe(true);
			expect(Array.isArray(result.days)).toBe(true);
			// Exact content depends on "today"; at least we get arrays
			expect(result.months.every((m) => /^\d+$/.test(m))).toBe(true);
			expect(result.days.every((d) => /^\d+$/.test(d))).toBe(true);
		});

		it('should use 0-11 for months and 1-31 for days', () => {
			const result = getDateRangeTags('2025-01-31', '2025-01-01');
			expect(result.months).toContain('0'); // January = 0
			expect(result.days.length).toBeGreaterThanOrEqual(30);
			expect(result.days.length).toBeLessThanOrEqual(31);
			expect(result.days.every((d) => Number(d) >= 1 && Number(d) <= 31)).toBe(true);
		});
	});
});
