import { TaskStatusEnum } from '$lib/utils/enums/task.enum';

/**
 * Display-only status. It is never written to a kind 31000 event.
 * The poster's stored status stays OPEN until they republish a new one.
 */
export const EFFECTIVE_TASK_STATUS_EXPIRED = 'EXPIRED';

export type TaskExpiryFields = {
	status?: string | null;
	deadline?: string | null;
};

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/**
 * Date-only deadlines are stored as UTC midnight or as the end of that UTC
 * calendar day (`normalizeDeadlineToEndOfDay`). Both mean "this calendar day",
 * not an instant the bidder's clock should cut off early.
 */
const UTC_DATE_BOUNDARY =
	/^(\d{4})-(\d{2})-(\d{2})T(?:00:00:00(?:\.0+)?|23:59:59\.999)(?:Z|\+00:00)$/;
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function localEndOfCalendarDay(year: number, month: number, day: number): number | null {
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const end = new Date(year, month - 1, day, 23, 59, 59, 999);
	if (end.getFullYear() !== year || end.getMonth() !== month - 1 || end.getDate() !== day) {
		return null;
	}
	return end.getTime();
}

/**
 * Instant after which a deadline has passed.
 * Date-only values stay open through the end of that calendar day in local time.
 * A value with a real time expires at that instant.
 * Missing or unparseable values never expire.
 */
export function deadlineExpiresAt(deadline: string | null | undefined): number | null {
	if (typeof deadline !== 'string') return null;
	const trimmed = deadline.trim();
	if (!trimmed) return null;

	const dateOnly = DATE_ONLY.exec(trimmed) ?? UTC_DATE_BOUNDARY.exec(trimmed);
	if (dateOnly) {
		return localEndOfCalendarDay(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]));
	}

	if (!ISO_DATETIME.test(trimmed)) return null;
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.getTime();
}

export function isDeadlinePassed(
	deadline: string | null | undefined,
	now: Date = new Date()
): boolean {
	const expiresAt = deadlineExpiresAt(deadline);
	if (expiresAt == null) return false;
	return now.getTime() > expiresAt;
}

/**
 * Effective status for display and bidding.
 * Only an OPEN task whose deadline has passed becomes EXPIRED.
 * Assigned, in progress, completed, cancelled, and every other stored status stay as published.
 */
export function getEffectiveStatus(
	task: TaskExpiryFields | null | undefined,
	now: Date = new Date()
): string {
	const status = typeof task?.status === 'string' ? task.status : '';
	if (status === TaskStatusEnum.OPEN && isDeadlinePassed(task?.deadline, now)) {
		return EFFECTIVE_TASK_STATUS_EXPIRED;
	}
	return status;
}

export function isTaskExpired(
	task: TaskExpiryFields | null | undefined,
	now: Date = new Date()
): boolean {
	return getEffectiveStatus(task, now) === EFFECTIVE_TASK_STATUS_EXPIRED;
}

/** True only when the task is still OPEN and its deadline has not passed. */
export function canBidOnTask(
	task: TaskExpiryFields | null | undefined,
	now: Date = new Date()
): boolean {
	return getEffectiveStatus(task, now) === TaskStatusEnum.OPEN;
}
