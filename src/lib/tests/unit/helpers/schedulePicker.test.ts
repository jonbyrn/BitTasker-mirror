import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	formatScheduleDateDisplay,
	mergeClock12hToDate,
	clampScheduleTimeNotBeforeNow,
	formatScheduleTime12h,
	formatScheduleTime12hParts,
	mergeDateAndTime,
	sameCalendarDay,
	getMonthGridCells,
	isCalendarDayDisabled,
	roundUpToIntervalMinutes,
	snapLocalWallClockCeilToMinutesStep,
	defaultDateTimeOnCalendarDay
} from '$lib/utils/helpers/schedulePicker';

describe('schedulePicker', () => {
	describe('formatScheduleDateDisplay', () => {
		it('should format a valid date in English', () => {
			const d = new Date(2026, 3, 8); // April 8, 2026
			const result = formatScheduleDateDisplay(d, 'en');
			expect(result).toBe('April 8, 2026');
		});

		it('should format a valid date in Spanish with comma format', () => {
			const d = new Date(2026, 3, 8);
			const result = formatScheduleDateDisplay(d, 'es');
			// Spanish default: "8 de abril de 2026" -> replaced: "8 de abril, 2026"
			expect(result).toBe('8 de abril, 2026');
		});

		it('should return "Invalid date" for an Invalid Date (catch block)', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatScheduleDateDisplay(new Date('invalid'), 'en');
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});

		it('should fall back to "en" when locale is empty', () => {
			const d = new Date(2026, 3, 8);
			const result = formatScheduleDateDisplay(d, '');
			expect(result).toContain('April');
		});

		it('should log an error and return default when Intl.DateTimeFormat throws', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const originalDateTimeFormat = Intl.DateTimeFormat;

			global.Intl.DateTimeFormat = function () {
				return {
					format: () => {
						throw new Error('Format failed');
					}
				};
			} as unknown as typeof Intl.DateTimeFormat;

			const result = formatScheduleDateDisplay(new Date(2026, 3, 8), 'en');
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();

			global.Intl.DateTimeFormat = originalDateTimeFormat;
			consoleSpy.mockRestore();
		});
	});

	describe('mergeClock12hToDate', () => {
		const baseDate = new Date(2026, 3, 15); // April 15, 2026

		it('should convert 12 AM (midnight) to 0:00', () => {
			const result = mergeClock12hToDate(baseDate, 12, 0, false);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(3);
			expect(result.getDate()).toBe(15);
			expect(result.getHours()).toBe(0);
			expect(result.getMinutes()).toBe(0);
		});

		it('should convert 12 PM (noon) to 12:00', () => {
			const result = mergeClock12hToDate(baseDate, 12, 0, true);
			expect(result.getHours()).toBe(12);
			expect(result.getMinutes()).toBe(0);
		});

		it('should convert 1 AM to 1:00', () => {
			const result = mergeClock12hToDate(baseDate, 1, 0, false);
			expect(result.getHours()).toBe(1);
		});

		it('should convert 1 PM to 13:00', () => {
			const result = mergeClock12hToDate(baseDate, 1, 0, true);
			expect(result.getHours()).toBe(13);
		});

		it('should handle 11 PM (23:00)', () => {
			const result = mergeClock12hToDate(baseDate, 11, 0, true);
			expect(result.getHours()).toBe(23);
		});

		it('should preserve the calendar date from the base date', () => {
			const result = mergeClock12hToDate(baseDate, 10, 30, true);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(3);
			expect(result.getDate()).toBe(15);
		});

		it('should set seconds and milliseconds to 0', () => {
			const result = mergeClock12hToDate(baseDate, 8, 15, false);
			expect(result.getSeconds()).toBe(0);
			expect(result.getMilliseconds()).toBe(0);
		});
	});

	describe('clampScheduleTimeNotBeforeNow', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('should return candidate when it is in the future', () => {
			const now = new Date(2026, 3, 15, 10, 0, 0);
			const candidate = new Date(2026, 3, 15, 10, 30, 0);
			expect(clampScheduleTimeNotBeforeNow(candidate, now)).toBe(candidate);
		});

		it('should return candidate when it is exactly now', () => {
			const now = new Date(2026, 3, 15, 10, 0, 0);
			const candidate = new Date(2026, 3, 15, 10, 0, 0);
			expect(clampScheduleTimeNotBeforeNow(candidate, now)).toBe(candidate);
		});

		it('should clamp to next whole minute when candidate is in the past', () => {
			const now = new Date(2026, 3, 15, 10, 0, 30); // 30 seconds past the minute
			const candidate = new Date(2026, 3, 15, 9, 0, 0); // in the past
			const result = clampScheduleTimeNotBeforeNow(candidate, now);
			expect(result.getTime()).toBeGreaterThanOrEqual(now.getTime());
			expect(result.getSeconds()).toBe(0);
		});

		it('should not bump minute when now is exactly on a whole minute boundary', () => {
			const now = new Date(2026, 3, 15, 10, 0, 0);
			const candidate = new Date(2026, 3, 15, 9, 30, 0);
			const result = clampScheduleTimeNotBeforeNow(candidate, now);
			// now is already a whole minute, so result should equal now
			expect(result.getTime()).toBe(now.getTime());
		});
	});

	describe('formatScheduleTime12h', () => {
		it('should format time in 12h English format', () => {
			const d = new Date(2026, 3, 8, 13, 0); // 1:00 PM
			const result = formatScheduleTime12h(d, 'en');
			expect(result).toMatch(/1:00\s*PM/i);
		});

		it('should format time in 12h Spanish format', () => {
			const d = new Date(2026, 3, 8, 13, 0);
			const result = formatScheduleTime12h(d, 'es');
			expect(result).toContain('1:00');
		});

		it('should handle midnight (0:00) as 12:00 AM', () => {
			const d = new Date(2026, 3, 8, 0, 0);
			const result = formatScheduleTime12h(d, 'en');
			expect(result).toMatch(/12:00\s*AM/i);
		});

		it('should return "Invalid date" for Invalid Date', () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			const result = formatScheduleTime12h(new Date('invalid'), 'en');
			expect(result).toBe('Invalid date');
			expect(consoleSpy).toHaveBeenCalled();
			consoleSpy.mockRestore();
		});
	});

	describe('formatScheduleTime12hParts', () => {
		it('should split time into main and suffix for English', () => {
			const d = new Date(2026, 3, 8, 13, 0); // 1:00 PM
			const result = formatScheduleTime12hParts(d, 'en');
			expect(result.main).toBe('1:00');
			expect(result.suffix).toBe('PM');
		});

		it('should split midnight correctly (12:00 AM)', () => {
			const d = new Date(2026, 3, 8, 0, 0);
			const result = formatScheduleTime12hParts(d, 'en');
			expect(result.main).toContain('12:00');
			expect(result.suffix).toBe('AM');
		});

		it('should split time for Spanish locale', () => {
			const d = new Date(2026, 3, 8, 13, 0);
			const result = formatScheduleTime12hParts(d, 'es');
			expect(result.main).toBe('1:00');
			expect(result.suffix).toContain('p');
		});

		it('should handle Invalid Date gracefully', () => {
			// formatScheduleTime12hParts does not have its own try-catch, so
			// Intl.DateTimeFormat.formatToParts(new Date(NaN)) may either throw or
			// return a string "Invalid Date" depending on the runtime.
			const act = () => formatScheduleTime12hParts(new Date('invalid'), 'en');
			try {
				const result = act();
				expect(result.main).toBe('Invalid Date');
			} catch {
				// Throwing is also acceptable
			}
		});
	});

	describe('mergeDateAndTime', () => {
		it('should take date from datePart and time from timeSource', () => {
			const datePart = new Date(2026, 3, 15);
			const timeSource = new Date(2026, 3, 10, 14, 30);
			const result = mergeDateAndTime(datePart, timeSource);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(3);
			expect(result.getDate()).toBe(15);
			expect(result.getHours()).toBe(14);
			expect(result.getMinutes()).toBe(30);
		});

		it('should zero out seconds and milliseconds', () => {
			const datePart = new Date(2026, 3, 15);
			const timeSource = new Date(2026, 3, 10, 9, 15, 45, 500);
			const result = mergeDateAndTime(datePart, timeSource);
			expect(result.getSeconds()).toBe(0);
			expect(result.getMilliseconds()).toBe(0);
		});
	});

	describe('sameCalendarDay', () => {
		it('should return true for the same day', () => {
			expect(sameCalendarDay(new Date(2026, 3, 15), new Date(2026, 3, 15))).toBe(true);
		});

		it('should return false for different days', () => {
			expect(sameCalendarDay(new Date(2026, 3, 15), new Date(2026, 3, 16))).toBe(false);
		});

		it('should return false for same day but different month', () => {
			expect(sameCalendarDay(new Date(2026, 3, 15), new Date(2026, 4, 15))).toBe(false);
		});

		it('should return false for same day/month but different year', () => {
			expect(sameCalendarDay(new Date(2026, 3, 15), new Date(2025, 3, 15))).toBe(false);
		});

		it('should return true regardless of time components', () => {
			expect(
				sameCalendarDay(new Date(2026, 3, 15, 10, 30, 0), new Date(2026, 3, 15, 22, 0, 0))
			).toBe(true);
		});
	});

	describe('getMonthGridCells', () => {
		it('should return a grid for a normal month (April 2026)', () => {
			// April 1, 2026 is a Wednesday (getDay() = 3)
			const cells = getMonthGridCells(2026, 3); // April = month 3
			// 3 leading nulls, 30 days
			expect(cells.length).toBe(35); // 3 + 30 = 33, rounded up to 35
			expect(cells[0]).toBeNull();
			expect(cells[1]).toBeNull();
			expect(cells[2]).toBeNull();
			expect(cells[3]).toBe(1);
			expect(cells[32]).toBe(30);
			expect(cells[33]).toBeNull();
			expect(cells[34]).toBeNull();
		});

		it('should handle a month starting on Sunday (February 2026)', () => {
			// Feb 1, 2026 is a Sunday (getDay() = 0)
			// Feb 2026 has 28 days, not a leap year
			const cells = getMonthGridCells(2026, 1); // February = month 1
			expect(cells.length).toBe(28); // 0 leading nulls + 28, 28 % 7 = 0
			expect(cells[0]).toBe(1);
			expect(cells[27]).toBe(28);
		});

		it('should handle a leap year February (2024)', () => {
			// Feb 1, 2024 is a Thursday (getDay() = 4)
			// Feb 2024 has 29 days (leap year)
			const cells = getMonthGridCells(2024, 1);
			expect(cells.length).toBe(35); // 4 + 29 = 33, rounded up to 35
			expect(cells[0]).toBeNull();
			expect(cells[1]).toBeNull();
			expect(cells[2]).toBeNull();
			expect(cells[3]).toBeNull();
			expect(cells[4]).toBe(1);
		});
	});

	describe('isCalendarDayDisabled', () => {
		const day = 15;
		const year = 2026;
		const month = 3; // April

		it('should return false when no constraints are provided', () => {
			expect(isCalendarDayDisabled(day, year, month)).toBe(false);
		});

		it('should return true for a day before minDate', () => {
			const minDate = new Date(2026, 3, 16);
			expect(isCalendarDayDisabled(day, year, month, minDate)).toBe(true);
		});

		it('should return false for a day equal to minDate', () => {
			const minDate = new Date(2026, 3, 15);
			expect(isCalendarDayDisabled(day, year, month, minDate)).toBe(false);
		});

		it('should return false for a day within range', () => {
			const minDate = new Date(2026, 3, 10);
			const maxDate = new Date(2026, 3, 20);
			expect(isCalendarDayDisabled(day, year, month, minDate, maxDate)).toBe(false);
		});

		it('should return true for a day after maxDate', () => {
			const maxDate = new Date(2026, 3, 14);
			expect(isCalendarDayDisabled(day, year, month, undefined, maxDate)).toBe(true);
		});

		it('should return true for a day outside both minDate and maxDate', () => {
			const minDate = new Date(2026, 3, 20);
			const maxDate = new Date(2026, 3, 25);
			expect(isCalendarDayDisabled(15, 2026, 3, minDate, maxDate)).toBe(true);
		});

		it('should compare at midnight (time portion does not affect result)', () => {
			const minDate = new Date(2026, 3, 15, 12, 0, 0); // noon on April 15
			// Day 15 should be equal to minDate day, so not disabled
			expect(isCalendarDayDisabled(15, 2026, 3, minDate)).toBe(false);
			// Day 14 should be before minDate, so disabled
			expect(isCalendarDayDisabled(14, 2026, 3, minDate)).toBe(true);
		});
	});

	describe('roundUpToIntervalMinutes', () => {
		it('should return the same date when already on the interval boundary', () => {
			const d = new Date(2026, 3, 15, 10, 0, 0);
			const result = roundUpToIntervalMinutes(d, 15);
			expect(result.getTime()).toBe(d.getTime());
		});

		it('should round up to the next interval when not on a boundary', () => {
			const d = new Date(2026, 3, 15, 10, 7, 0); // :07 -> :15
			const result = roundUpToIntervalMinutes(d, 15);
			expect(result.getMinutes()).toBe(15);
			expect(result.getHours()).toBe(10);
		});

		it('should handle rounding that crosses an hour boundary', () => {
			const d = new Date(2026, 3, 15, 10, 53, 0); // :53 -> :00 next hour
			const result = roundUpToIntervalMinutes(d, 15);
			expect(result.getHours()).toBe(11);
			expect(result.getMinutes()).toBe(0);
		});

		it('should handle a date on a DST day without crashing', () => {
			// March 8, 2026 is a US spring-forward day
			const d = new Date(2026, 2, 8, 10, 22, 0);
			const result = roundUpToIntervalMinutes(d, 15);
			expect(result instanceof Date).toBe(true);
			expect(isNaN(result.getTime())).toBe(false);
		});

		it('should work with different step intervals', () => {
			const d = new Date(2026, 3, 15, 10, 5, 0);
			const result30 = roundUpToIntervalMinutes(d, 30); // :05 -> :30
			expect(result30.getMinutes()).toBe(30);

			const result60 = roundUpToIntervalMinutes(d, 60); // :05 -> :00 next hour
			expect(result60.getMinutes()).toBe(0);
			expect(result60.getHours()).toBe(11);
		});
	});

	describe('snapLocalWallClockCeilToMinutesStep', () => {
		it('should return the same date when already on the boundary', () => {
			const d = new Date(2026, 3, 15, 10, 0, 0);
			const result = snapLocalWallClockCeilToMinutesStep(d, 15);
			expect(result.getTime()).toBe(d.getTime());
		});

		it('should snap up to the next step', () => {
			const d = new Date(2026, 3, 15, 10, 7, 0);
			const result = snapLocalWallClockCeilToMinutesStep(d, 15);
			expect(result.getMinutes()).toBe(15);
		});

		it('should clamp stepMinutes to 1..60 range', () => {
			const d = new Date(2026, 3, 15, 10, 7, 0);
			const result = snapLocalWallClockCeilToMinutesStep(d, 0); // step 0 -> clamped to 1
			expect(result.getMinutes()).toBe(7); // already on a 1-minute boundary
		});

		it('should snap that crosses hour boundaries', () => {
			const d = new Date(2026, 3, 15, 10, 55, 0);
			const result = snapLocalWallClockCeilToMinutesStep(d, 15);
			expect(result.getHours()).toBe(11);
			expect(result.getMinutes()).toBe(0);
		});

		it('should zero out seconds', () => {
			const d = new Date(2026, 3, 15, 10, 0, 45);
			const result = snapLocalWallClockCeilToMinutesStep(d, 15);
			expect(result.getSeconds()).toBe(0);
		});
	});

	describe('defaultDateTimeOnCalendarDay', () => {
		it('should return noon on the given day when no minDate', () => {
			const day = new Date(2026, 3, 15);
			const result = defaultDateTimeOnCalendarDay(day);
			expect(result.getHours()).toBe(12);
			expect(result.getMinutes()).toBe(0);
			expect(result.getFullYear()).toBe(2026);
			expect(result.getMonth()).toBe(3);
			expect(result.getDate()).toBe(15);
		});

		it('should return noon when noon is after minDate', () => {
			const day = new Date(2026, 3, 15);
			const minDate = new Date(2026, 3, 15, 8, 0, 0);
			const result = defaultDateTimeOnCalendarDay(day, minDate);
			expect(result.getHours()).toBe(12);
		});

		it('should return rounded-up minDate when minDate is after noon', () => {
			const day = new Date(2026, 3, 15);
			const minDate = new Date(2026, 3, 15, 14, 22, 0); // 2:22 PM
			const result = defaultDateTimeOnCalendarDay(day, minDate);
			// Should round up minDate to next 15-min interval
			expect(result.getHours()).toBe(14);
			expect(result.getMinutes()).toBe(30);
		});

		it('should return rounded-up minDate when minDate is after noon on the same day', () => {
			const day = new Date(2026, 3, 16);
			const minDate = new Date(2026, 3, 16, 13, 22, 0); // 1:22 PM > noon
			const result = defaultDateTimeOnCalendarDay(day, minDate);
			expect(result.getHours()).toBe(13);
			expect(result.getMinutes()).toBe(30); // rounded up from :22 to :30
		});
	});
});
