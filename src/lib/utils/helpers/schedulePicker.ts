/** Helpers for schedule date/time picker UI (local calendar + typed time). */

export const SCHEDULE_TIME_STEP_MINUTES = 15;

/**
 * Long date for schedule triggers. Spanish uses "8 de abril, 2026" instead of "8 de abril de 2026".
 */
export function formatScheduleDateDisplay(date: Date, locale: string): string {
	try {
		const loc = locale || 'en';
		const s = new Intl.DateTimeFormat(loc, { dateStyle: 'long' }).format(date);
		if (/^es/i.test(loc)) {
			return s.replace(/ de (\d{4})$/, ', $1');
		}
		return s;
	} catch (error) {
		console.error('Error formatting schedule date display:', error);
		return 'Invalid date';
	}
}

/**
 * Builds a local Date on baseDate's calendar day with 12h clock + AM/PM.
 * 12 AM → 0:00, 12 PM → 12:00, 1 AM → 1:00, 1 PM → 13:00.
 */
export function mergeClock12hToDate(
	baseDate: Date,
	hour12: number,
	minute: number,
	isPm: boolean
): Date {
	const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 0, 0, 0, 0);
	let h24: number;
	if (hour12 === 12) {
		h24 = isPm ? 12 : 0;
	} else {
		h24 = isPm ? hour12 + 12 : hour12;
	}
	d.setHours(h24, minute, 0, 0);
	return d;
}

/** If `candidate` is before `now`, returns the next whole minute at or after `now` on the same calendar day (or bumps day if needed — here we only bump time). */
export function clampScheduleTimeNotBeforeNow(candidate: Date, now: Date): Date {
	if (candidate.getTime() >= now.getTime()) {
		return candidate;
	}
	const n = new Date(now.getTime());
	n.setSeconds(0, 0);
	if (n.getTime() < now.getTime()) {
		n.setMinutes(n.getMinutes() + 1, 0, 0);
	}
	return n;
}

const scheduleTime12hOptions: Intl.DateTimeFormatOptions = {
	hour: 'numeric',
	minute: '2-digit',
	hour12: true
};

/** 12-hour clock with locale-appropriate AM/PM (used in schedule pickers and triggers). */
export function formatScheduleTime12h(date: Date, locale: string): string {
	try {
		return new Intl.DateTimeFormat(locale || 'en', scheduleTime12hOptions).format(date);
	} catch (error) {
		console.error('Error formatting schedule time:', error);
		return 'Invalid date';
	}
}

/**
 * Splits 12h time into clock + day period for layout (e.g. baseline-align "1:00" with "PM").
 */
export function formatScheduleTime12hParts(
	date: Date,
	locale: string
): { main: string; suffix: string } {
	try {
		const parts = new Intl.DateTimeFormat(locale || 'en', scheduleTime12hOptions).formatToParts(
			date
		);
		let main = '';
		let suffix = '';
		for (const p of parts) {
			if (p.type === 'dayPeriod') {
				suffix += p.value;
			} else {
				main += p.value;
			}
		}
		return { main: main.trim(), suffix: suffix.trim() };
	} catch (error) {
		console.error('Error formatting schedule time parts:', error);
		return { main: '', suffix: '' };
	}
}

export function mergeDateAndTime(datePart: Date, timeSource: Date): Date {
	const d = new Date(datePart.getTime());
	d.setHours(timeSource.getHours(), timeSource.getMinutes(), 0, 0);
	return d;
}

export function sameCalendarDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function getMonthGridCells(year: number, month: number): (number | null)[] {
	const first = new Date(year, month, 1);
	const lastDay = new Date(year, month + 1, 0).getDate();
	const startPad = first.getDay();
	const cells: (number | null)[] = [];
	for (let i = 0; i < startPad; i++) {
		cells.push(null);
	}
	for (let d = 1; d <= lastDay; d++) {
		cells.push(d);
	}
	// Always pad to 42 cells (6 rows × 7) to prevent layout shift between months
	while (cells.length < 42) {
		cells.push(null);
	}
	return cells;
}

export function isCalendarDayDisabled(
	day: number,
	year: number,
	month: number,
	minDate?: Date,
	maxDate?: Date
): boolean {
	if (minDate) {
		const minDay = new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate());
		const cDay = new Date(year, month, day);
		if (cDay < minDay) return true;
	}
	if (maxDate) {
		const maxDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
		const cDay = new Date(year, month, day);
		if (cDay > maxDay) return true;
	}
	return false;
}

export function roundUpToIntervalMinutes(date: Date, stepMinutes: number): Date {
	const d = new Date(date.getTime());
	const ms = stepMinutes * 60 * 1000;
	const t = d.getTime();
	const remainder = t % ms;
	if (remainder === 0) {
		return d;
	}
	d.setTime(t + (ms - remainder));
	return d;
}

/**
 * Snap a local date/time up to the next boundary on the same calendar day (e.g. :00, :15, :30, :45).
 */
export function snapLocalWallClockCeilToMinutesStep(date: Date, stepMinutes: number): Date {
	const d = new Date(date.getTime());
	d.setSeconds(0, 0);
	const step = Math.max(1, Math.min(60, Math.floor(stepMinutes)));
	const stepMs = step * 60 * 1000;
	// Use wall-clock time components directly to avoid DST offset skew
	// between the UTC epoch and local midnight on transition days.
	const msFromDayStart =
		d.getHours() * 3_600_000 +
		d.getMinutes() * 60_000 +
		d.getSeconds() * 1_000 +
		d.getMilliseconds();
	const remainder = msFromDayStart % stepMs;
	if (remainder === 0) {
		return d;
	}
	d.setTime(d.getTime() + (stepMs - remainder));
	return d;
}

/** Default time when user picks a day and there was no previous value (noon, or first allowed instant on/after minDate). */
export function defaultDateTimeOnCalendarDay(day: Date, minDate?: Date): Date {
	const candidate = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 12, 0, 0, 0);
	if (minDate && candidate < minDate) {
		return roundUpToIntervalMinutes(new Date(minDate.getTime()), SCHEDULE_TIME_STEP_MINUTES);
	}
	return candidate;
}
