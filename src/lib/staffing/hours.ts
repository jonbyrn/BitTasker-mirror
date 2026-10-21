const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function roundHours(value: number): number {
	return Math.round(value * 100) / 100;
}

export function roundUsd(value: number): number {
	return Math.round(value * 100) / 100;
}

export function clockMinutes(value: string): number {
	const match = CLOCK.exec(value.trim());
	if (!match) throw new Error('clock');
	return Number(match[1]) * 60 + Number(match[2]);
}

/** Hours from the start clock to the end clock, times the number of days. */
export function expectedHours(startTime: string, endTime: string, days: number): number {
	const start = clockMinutes(startTime);
	const end = clockMinutes(endTime);
	if (end <= start) throw new Error('end-time');
	const count = Math.floor(days);
	if (!Number.isFinite(count) || count < 1) throw new Error('days');
	return roundHours(((end - start) / 60) * count);
}

/** Hours between a check-in and a check-out timestamp. */
export function hoursWorked(checkInAt: string, checkOutAt: string): number {
	const start = Date.parse(checkInAt);
	const end = Date.parse(checkOutAt);
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('end-time');
	return roundHours((end - start) / 3_600_000);
}

/** Dollars to fund before the shift, rounded to cents. */
export function escrowUsd(hourlyRateUsd: number, hours: number): number {
	if (!(hourlyRateUsd > 0) || !(hours > 0)) throw new Error('amount');
	return roundUsd(hourlyRateUsd * hours);
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function isIsoDate(value: string): boolean {
	if (!DATE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
