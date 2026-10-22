import { textMatchesQuery } from '$lib/search/text-match';
import { isTaskExpired } from '$lib/utils/helpers/taskExpiry';

export interface PublicListingFields {
	title?: string | null;
	description?: string | null;
	status?: string | null;
	skills?: unknown;
	categories?: unknown;
	tags?: unknown;
	budget?: { amount?: unknown } | null;
	deadline?: string | null;
}

/** Fields used to collapse repeated Nostr events before a keyed {#each}. */
export interface ListingEventIdentity {
	id?: string | null;
	npub?: string | null;
	createdAt?: number | null;
	updatedAt?: unknown;
	eventId?: string | null;
	kind?: number | null;
	eventKind?: number | null;
	uniqueId?: string | null;
	tags?: unknown;
}

function textOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' && Number.isFinite(value)) return String(value);
	if (Array.isArray(value)) return value.map(textOf).filter(Boolean).join(' ');
	if (value && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return [record.name, record.title, record.id, record.slug]
			.map(textOf)
			.filter(Boolean)
			.join(' ');
	}
	return '';
}

/** Title, description, skills, categories, and tags. The same haystack feeds the count and the cards. */
export function listingHaystack(listing: PublicListingFields | null | undefined): string {
	if (!listing) return '';
	return [listing.title, listing.description, listing.skills, listing.categories, listing.tags]
		.map(textOf)
		.filter((part) => part.length > 0)
		.join(' ');
}

export function matchesListingQuery(
	listing: PublicListingFields | null | undefined,
	query: string | null | undefined
): boolean {
	const trimmed = query?.trim() ?? '';
	if (!trimmed) return true;
	return textMatchesQuery(listingHaystack(listing), trimmed);
}

/**
 * Test events published while checking relays. Real titles that merely contain
 * "probe" (for example a soil probe) stay listed.
 */
export function isTestListingTitle(title: string | null | undefined): boolean {
	const normalized = (title ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
	if (!normalized) return false;
	if (normalized === 'probe') return true;
	if (normalized.includes('relay probe')) return true;
	if (normalized.includes('relay publish check')) return true;
	if (normalized.includes('auth url probe')) return true;
	if (normalized.includes('publish check')) return true;
	if (/\bprobe\b/.test(normalized) && /\b(relay|auth|publish|url)\b/.test(normalized)) return true;
	return false;
}

export function isCancelledTask(listing: PublicListingFields | null | undefined): boolean {
	return (listing?.status ?? '').trim().toUpperCase() === 'CANCELLED';
}

export function hasListableBudget(listing: PublicListingFields | null | undefined): boolean {
	const amount = listing?.budget?.amount;
	return typeof amount === 'number' && Number.isFinite(amount);
}

export function filterPublicTasks<T extends PublicListingFields>(
	tasks: readonly T[],
	query: string | null | undefined
): T[] {
	return tasks.filter(
		(task) =>
			hasListableBudget(task) &&
			!isCancelledTask(task) &&
			!isTestListingTitle(task.title) &&
			matchesListingQuery(task, query)
	);
}

export function filterPublicServices<T extends PublicListingFields>(
	services: readonly T[],
	query: string | null | undefined
): T[] {
	return services.filter(
		(service) => !isTestListingTitle(service.title) && matchesListingQuery(service, query)
	);
}

/** Compact stand-in when a service has no gallery image. A full-bleed hero is only for real media. */
export function serviceHeroLayout(imageCount: number): 'media' | 'compact' {
	return imageCount > 0 ? 'media' : 'compact';
}

const REPLACEABLE_KIND_MIN = 30_000;
const REPLACEABLE_KIND_MAX = 40_000;

function trimmed(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

function dTagOf(listing: ListingEventIdentity): string {
	if (Array.isArray(listing.tags)) {
		for (const tag of listing.tags) {
			if (Array.isArray(tag) && tag[0] === 'd') {
				const value = trimmed(tag[1]);
				if (value) return value;
			}
		}
	}
	return trimmed(listing.uniqueId);
}

function kindOf(listing: ListingEventIdentity): number | null {
	const kind = listing.kind ?? listing.eventKind;
	return typeof kind === 'number' && Number.isFinite(kind) ? kind : null;
}

function versionOf(listing: ListingEventIdentity): number {
	const created =
		typeof listing.createdAt === 'number' && Number.isFinite(listing.createdAt)
			? listing.createdAt
			: 0;
	const updated =
		typeof listing.updatedAt === 'number' && Number.isFinite(listing.updatedAt)
			? listing.updatedAt
			: 0;
	return Math.max(created, updated);
}

/**
 * Identity for one list row.
 * A plain event uses its event id.
 * A replaceable event (kind 30000–39999) uses kind:pubkey:d so every version
 * of that address shares one key. Task rows often omit kind; their id is the d-tag.
 */
export function listingEventKey(listing: ListingEventIdentity | null | undefined): string {
	if (!listing) return '';
	const id = trimmed(listing.id);
	const eventId = trimmed(listing.eventId);
	const pubkey = trimmed(listing.npub);
	const dTag = dTagOf(listing);
	const kind = kindOf(listing);
	const replaceable = kind != null && kind >= REPLACEABLE_KIND_MIN && kind < REPLACEABLE_KIND_MAX;
	if (replaceable) {
		const address = dTag || id || eventId;
		if (address) return `${kind}:${pubkey}:${address}`;
	}
	if (dTag) return `addr:${pubkey}:${dTag}`;
	if (eventId) return `e:${eventId}`;
	if (id) return `id:${id}`;
	return '';
}

/** One row per event. Replaceable addresses keep the newest version. Rows with no id are dropped. */
export function dedupeListingsByEvent<T extends ListingEventIdentity>(items: readonly T[]): T[] {
	const byKey = new Map<string, T>();
	for (const item of items) {
		if (!trimmed(item?.id)) continue;
		const key = listingEventKey(item);
		if (!key) continue;
		const existing = byKey.get(key);
		if (!existing || versionOf(item) >= versionOf(existing)) byKey.set(key, item);
	}
	return Array.from(byKey.values());
}

export interface VisibleTaskList<T> {
	/** The only list the count, the cards, and the map may read. */
	visible: T[];
	/** True when that list is empty because every match was past its deadline. */
	expiredHidden: boolean;
}

/**
 * Public task list for Find Tasks.
 * Dedupe, then the public filter, then the same expiry rule the cards use.
 * Pass `now` in tests so the calendar-day clock is explicit.
 */
export function selectVisibleTasks<T extends PublicListingFields & ListingEventIdentity>(
	tasks: readonly T[],
	query: string | null | undefined,
	showExpired: boolean,
	now: Date = new Date()
): VisibleTaskList<T> {
	const matched = filterPublicTasks(dedupeListingsByEvent(tasks), query);
	const visible = showExpired ? matched : matched.filter((task) => !isTaskExpired(task, now));
	return {
		visible,
		expiredHidden: !showExpired && visible.length === 0 && matched.length > 0
	};
}

/** Public service list for Find Services. Same dedupe, then the public filter. */
export function selectVisibleServices<T extends PublicListingFields & ListingEventIdentity>(
	services: readonly T[],
	query: string | null | undefined
): T[] {
	return filterPublicServices(dedupeListingsByEvent(services), query);
}
