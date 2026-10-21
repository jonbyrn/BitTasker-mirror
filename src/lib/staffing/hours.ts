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

/** Dollars to fund before the shift, rounded to cents. No agency fee is added. */
export function escrowUsd(hourlyRateUsd: number, hours: number): number {
	if (!(hourlyRateUsd > 0) || !(hours > 0)) throw new Error('amount');
	return roundUsd(hourlyRateUsd * hours);
}

/** Approved pay. The hourly rate times the hours, with no agency fee. */
export function payoutUsd(hourlyRateUsd: number, hours: number): number {
	return escrowUsd(hourlyRateUsd, hours);
}

/** Inclusive day count from a start date through an end date. */
export function inclusiveDays(startDate: string, endDate: string): number {
	if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) throw new Error('days');
	const start = Date.parse(`${startDate}T00:00:00Z`);
	const end = Date.parse(`${endDate}T00:00:00Z`);
	const days = Math.round((end - start) / 86_400_000) + 1;
	if (days < 1 || days > 31) throw new Error('days');
	return days;
}

export function endDateFor(startDate: string, days: number): string {
	const count = Math.floor(days);
	if (!isIsoDate(startDate) || count < 1 || count > 31) throw new Error('days');
	const start = Date.parse(`${startDate}T00:00:00Z`);
	return new Date(start + (count - 1) * 86_400_000).toISOString().slice(0, 10);
}

export function shiftSpan(job: {
	date: string;
	endDate?: string;
	startTime: string;
	endTime: string;
}): string {
	const end = job.endDate && job.endDate !== job.date ? `–${job.endDate}` : '';
	return `${job.date}${end} · ${job.startTime}–${job.endTime}`;
}

/**
 * Wallet units for an approved payout.
 * USDT uses 6-decimal base units of the dollar amount.
 * Bitcoin uses the same share of the funded sats. Nothing is added on top.
 */
export function releaseUnits(input: {
	asset: 'usdt' | 'btc';
	releaseUsd: number;
	escrowUsd: number;
	escrowSats: number;
}): number {
	if (!(input.releaseUsd > 0) || !(input.escrowUsd > 0)) throw new Error('amount');
	if (input.releaseUsd > input.escrowUsd + 0.001) throw new Error('hours');
	if (input.asset === 'btc') {
		const sats = Math.floor(input.escrowSats);
		if (!(sats > 0)) throw new Error('amount');
		return Math.max(1, Math.round(sats * (input.releaseUsd / input.escrowUsd)));
	}
	return Math.max(1, Math.round(input.releaseUsd * 1_000_000));
}

export function nowIso(): string {
	return new Date().toISOString();
}

export function isIsoDate(value: string): boolean {
	if (!DATE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
