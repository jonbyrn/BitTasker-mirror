/** A deadline lasts through its calendar day. The next day is expired. */
export function isTaskDeadlineExpired(deadline?: string | null, now: Date = new Date()): boolean {
	if (!deadline) return false;
	const deadlineDate = new Date(deadline);
	if (Number.isNaN(deadlineDate.getTime())) return false;
	const deadlineDay = deadlineDate.toISOString().split('T')[0];
	const today = now.toISOString().split('T')[0];
	return today > deadlineDay;
}

const END_TAG_ORDER = ['deadline', 'expiration', 'end', 'end_date'] as const;

/** Unix seconds, unix millis, or an ISO date, as an ISO string. */
export function canonicalEnd(value: string | number | null | undefined): string | null {
	if (value == null) return null;
	const raw = String(value).trim();
	if (!raw) return null;
	if (/^\d{9,13}$/.test(raw)) {
		const numeric = Number(raw);
		const millis = numeric < 1e12 ? numeric * 1000 : numeric;
		const date = new Date(millis);
		return Number.isNaN(date.getTime()) ? null : date.toISOString();
	}
	const date = new Date(raw);
	return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Nostr `deadline` tag first, then expiration / end tags. */
export function endFromTags(tags: ReadonlyArray<readonly string[]> | undefined): string | null {
	if (!tags?.length) return null;
	for (const name of END_TAG_ORDER) {
		const tag = tags.find((item) => item[0]?.toLowerCase() === name);
		const end = canonicalEnd(tag?.[1]);
		if (end) return end;
	}
	return null;
}

export function isListingExpired(
	end: string | number | null | undefined,
	now: Date = new Date()
): boolean {
	const canonical = canonicalEnd(end);
	if (!canonical) return false;
	return isTaskDeadlineExpired(canonical, now);
}

type TaskEndSource = {
	deadline?: string | null;
	dateRange?: { end?: string | null } | null;
	tags?: ReadonlyArray<readonly string[]>;
};

/** Client-side end. The stored status is left unchanged. */
export function taskEnd(task: TaskEndSource): string | null {
	return endFromTags(task.tags) || canonicalEnd(task.deadline) || canonicalEnd(task.dateRange?.end);
}

/** OPEN stays on the event. A past deadline displays as EXPIRED. */
export function displayTaskStatus(
	task: TaskEndSource & { status?: string | null },
	now: Date = new Date()
): string {
	const stored = String(task.status || '');
	if (stored.toUpperCase() === 'OPEN' && isListingExpired(taskEnd(task), now)) return 'EXPIRED';
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
