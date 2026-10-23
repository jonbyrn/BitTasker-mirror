/**
 * One end-date rule for the task list, category tiles, map pins, and the indexer.
 *
 * The end is the latest known of the deadline tag and the schedule range.
 * That day lasts through its UTC calendar date. The next UTC day is expired.
 * A missing end is not expired. Nothing here deletes a Nostr event.
 */

const END_TAG_ORDER = ['deadline', 'expiration', 'end', 'end_date'];

/** Unix seconds, unix millis, or an ISO date, as an ISO string. */
export function canonicalEnd(value) {
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
export function endFromTags(tags) {
	if (!tags?.length) return null;
	for (const name of END_TAG_ORDER) {
		const tag = tags.find((item) => item?.[0]?.toLowerCase() === name);
		const end = canonicalEnd(tag?.[1]);
		if (end) return end;
	}
	return null;
}

function pushEnd(ends, value) {
	const end = canonicalEnd(value);
	if (end) ends.push(end);
}

/** Every deadline and schedule end we can read. The start of a range is not an end. */
export function knownEnds(source) {
	if (!source || typeof source !== 'object') return [];
	const ends = [];
	const tags = Array.isArray(source.tags) ? source.tags : [];
	for (const name of END_TAG_ORDER) {
		const tag = tags.find((item) => String(item?.[0] || '').toLowerCase() === name);
		pushEnd(ends, tag?.[1]);
	}
	pushEnd(ends, source.deadline);
	pushEnd(ends, source.dateRange?.end);
	pushEnd(ends, source.end);
	pushEnd(ends, source.endDate);
	pushEnd(ends, source.endsAt);
	pushEnd(ends, source.expiresAt);
	return ends;
}

/** Latest deadline or schedule end. Null when the listing has neither. */
export function latestKnownEnd(source) {
	const ends = knownEnds(source);
	if (ends.length === 0) return null;
	return ends.reduce((latest, end) => (end > latest ? end : latest));
}

/** True when `end` is before today's UTC date. The end date itself stays open. */
export function isUtcDayPast(end, now = new Date()) {
	const canonical = canonicalEnd(end);
	if (!canonical) return false;
	const when = now instanceof Date ? now : new Date(now);
	if (Number.isNaN(when.getTime())) return false;
	return when.toISOString().slice(0, 10) > canonical.slice(0, 10);
}

/**
 * Expired when the latest known end is before today.
 * A schedule end before today expires the task when it is that latest end.
 * A deadline before today expires the task when it is that latest end.
 */
export function isLatestEndExpired(source, now = new Date()) {
	return isUtcDayPast(latestKnownEnd(source), now);
}
