import {
	canonicalEnd,
	endFromTags,
	isLatestEndExpired,
	isUtcDayPast,
	latestKnownEnd
} from '$lib/utils/helpers/listing-end.js';

export {
	canonicalEnd,
	endFromTags,
	isLatestEndExpired,
	latestKnownEnd
} from '$lib/utils/helpers/listing-end.js';

/** A deadline lasts through its UTC calendar day. The next UTC day is expired. */
export function isTaskDeadlineExpired(deadline?: string | null, now: Date = new Date()): boolean {
	return isUtcDayPast(deadline, now);
}

/** Unix seconds, unix milliseconds, or an ISO date. A day-of-month is not a timestamp. */
export function deadlineInstant(value: string | number | null | undefined): number | null {
	const canonical = canonicalEnd(value);
	if (!canonical) return null;
	const instant = new Date(canonical).getTime();
	return Number.isNaN(instant) ? null : instant;
}

/** Homepage time-left. Numeric deadlines are seconds or milliseconds, not `new Date(seconds)`. */
export function timeLeftLabel(
	value: string | number | null | undefined,
	now: Date = new Date()
): string {
	const instant = deadlineInstant(value);
	if (instant == null) return 'No deadline';
	const diffMs = instant - now.getTime();
	if (diffMs <= 0) return 'Expired';
	const hours = Math.floor(diffMs / 3600000);
	const days = Math.floor(hours / 24);
	if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
	if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
	const minutes = Math.max(1, Math.floor(diffMs / 60000));
	return `${minutes} minute${minutes > 1 ? 's' : ''}`;
}

export function isListingExpired(
	end: string | number | null | undefined,
	now: Date = new Date()
): boolean {
	return isUtcDayPast(end, now);
}

type TaskEndSource = {
	deadline?: string | null;
	dateRange?: { end?: string | null } | null;
	tags?: ReadonlyArray<readonly string[]>;
};

/**
 * Latest deadline or schedule end. The stored status is left unchanged.
 * A later schedule end keeps a task open past an earlier deadline, and the reverse.
 */
export function taskEnd(task: TaskEndSource): string | null {
	return latestKnownEnd(task);
}

/** OPEN stays on the event. A past latest end displays as EXPIRED. */
export function displayTaskStatus(
	task: TaskEndSource & { status?: string | null },
	now: Date = new Date()
): string {
	const stored = String(task.status || '');
	if (stored.toUpperCase() === 'OPEN' && isLatestEndExpired(task, now)) return 'EXPIRED';
	return stored;
}

export function isShiftExpired(
	job: { status?: string | null; endDate?: string | null; date?: string | null },
	now: Date = new Date()
): boolean {
	if (String(job.status || '').toLowerCase() !== 'open') return false;
	return isListingExpired(job.endDate || job.date, now);
}

type ServiceEndSource = {
	status?: string | null;
	endsAt?: string | null;
	endDate?: string | null;
	deadline?: string | null;
	expiresAt?: string | number | null;
	tags?: ReadonlyArray<readonly string[]>;
};

export function serviceEnd(service: ServiceEndSource): string | null {
	return (
		canonicalEnd(service.endsAt) ||
		canonicalEnd(service.endDate) ||
		canonicalEnd(service.deadline) ||
		canonicalEnd(service.expiresAt) ||
		endFromTags(service.tags)
	);
}

export function isServiceExpired(service: ServiceEndSource, now: Date = new Date()): boolean {
	if (String(service.status || '').toLowerCase() !== 'active') return false;
	const end = serviceEnd(service);
	if (!end) return false;
	return isListingExpired(end, now);
}

export function displayServiceStatus(service: ServiceEndSource, now: Date = new Date()): string {
	if (isServiceExpired(service, now)) return 'expired';
	return String(service.status || '');
}
