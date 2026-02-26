import { describe, it, expect, vi } from 'vitest';
import {
	parseDateToLocalMidnight,
	formatStandardDateShort
} from '$lib/utils/helpers/dateFormatter';
import { TASKS_PER_PAGE } from '$lib/stores/task.store';
import type { SearchTasksParams } from '$lib/types/task.d';

/**
 * Unit tests for /tasks page pure functions
 * These test functions that can be tested in isolation
 */

// Mock svelte-i18n locale
vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		locale: readable('en'),
		t: readable((key: string) => key)
	};
});

// Helper function to create initial search params (extracted from component logic)
function getInitialSearchParams(): SearchTasksParams {
	return {
		taskType: undefined,
		categories: [],
		skills: [],
		page: 1,
		limit: TASKS_PER_PAGE,
		budget: {
			tier: undefined,
			currency: undefined,
			type: undefined
		},
		search: ''
	};
}

// Helper function to format date (extracted from component logic)
function formatDateTimeReactive(dateString: string, locale: string = 'en'): string {
	if (!dateString) return '';

	const date = parseDateToLocalMidnight(dateString);
	if (!date) return '';

	return formatStandardDateShort(date, locale);
}

// Helper function to format date range (extracted from component logic)
function formatDateRangeReactive(
	startDateString: string,
	endDateString: string,
	locale: string = 'en'
): string {
	const formatValue = (value: string) => {
		const date = parseDateToLocalMidnight(value);
		if (!date) return '';
		return formatStandardDateShort(date, locale);
	};

	const startFormatted = formatValue(startDateString);
	const endFormatted = formatValue(endDateString);

	if (startFormatted && endFormatted) {
		return `${startFormatted} - ${endFormatted}`;
	}

	return startFormatted || endFormatted || '';
}

describe('Tasks Page - Unit Tests', () => {
	describe('getInitialSearchParams', () => {
		it('should return default search parameters', () => {
			const params = getInitialSearchParams();

			expect(params).toEqual({
				taskType: undefined,
				categories: [],
				skills: [],
				page: 1,
				limit: TASKS_PER_PAGE,
				budget: {
					tier: undefined,
					currency: undefined,
					type: undefined
				},
				search: ''
			});
		});

		it('should have correct default page value', () => {
			const params = getInitialSearchParams();
			expect(params.page).toBe(1);
		});

		it('should have correct default limit value', () => {
			const params = getInitialSearchParams();
			expect(params.limit).toBe(TASKS_PER_PAGE);
		});

		it('should have empty arrays for categories and skills', () => {
			const params = getInitialSearchParams();
			expect(params.categories).toEqual([]);
			expect(params.skills).toEqual([]);
		});
	});

	describe('formatDateTimeReactive', () => {
		it('should return empty string for empty input', () => {
			expect(formatDateTimeReactive('')).toBe('');
		});

		it('should return empty string for null input', () => {
			expect(formatDateTimeReactive(null as unknown as string)).toBe('');
		});

		it('should format valid date string', () => {
			const dateString = '2024-01-15T10:00:00Z';
			const result = formatDateTimeReactive(dateString);
			expect(result).toBeTruthy();
			expect(result.length).toBeGreaterThan(0);
		});

		it('should handle invalid date string', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatDateTimeReactive('invalid-date');
			expect(result).toBe('');
			consoleErrorSpy.mockRestore();
		});

		it('should format date with different locales', () => {
			const dateString = '2024-01-15T10:00:00Z';
			const enResult = formatDateTimeReactive(dateString, 'en');
			const esResult = formatDateTimeReactive(dateString, 'es');

			expect(enResult).toBeTruthy();
			expect(esResult).toBeTruthy();
		});
	});

	describe('formatDateRangeReactive', () => {
		it('should format date range with both dates', () => {
			const start = '2024-01-15T10:00:00Z';
			const end = '2024-01-20T10:00:00Z';
			const result = formatDateRangeReactive(start, end);

			expect(result).toContain(' - ');
			expect(result.length).toBeGreaterThan(0);
		});

		it('should handle missing end date', () => {
			const start = '2024-01-15T10:00:00Z';
			const end = '';
			const result = formatDateRangeReactive(start, end);

			expect(result).toBeTruthy();
			expect(result).not.toContain(' - ');
		});

		it('should handle missing start date', () => {
			const start = '';
			const end = '2024-01-20T10:00:00Z';
			const result = formatDateRangeReactive(start, end);

			expect(result).toBeTruthy();
			expect(result).not.toContain(' - ');
		});

		it('should return empty string when both dates are invalid', () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatDateRangeReactive('invalid', 'invalid');
			expect(result).toBe('');
			consoleErrorSpy.mockRestore();
		});

		it('should format date range with different locales', () => {
			const start = '2024-01-15T10:00:00Z';
			const end = '2024-01-20T10:00:00Z';
			const enResult = formatDateRangeReactive(start, end, 'en');
			const esResult = formatDateRangeReactive(start, end, 'es');

			expect(enResult).toContain(' - ');
			expect(esResult).toContain(' - ');
		});
	});
});
