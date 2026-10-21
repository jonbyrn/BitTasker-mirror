import type { Event, Filter } from 'nostr-tools';
import { withoutProductionCatalogRelays } from '$lib/nostr/catalog-guard';
import { queryListingRelays } from '$lib/nostr/listing-relays';
import { LISTING_QUERY_MS, queryRelayEvents } from '$lib/nostr/relayQuery';
import KINDS from '$lib/utils/constants/kinds';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';

export interface FoundTaskEvent {
	id: string;
	pubkey: string;
	content: string;
	tags: string[][];
	created_at?: number;
}

function normalizeAuthor(value?: string | null): string | undefined {
	const trimmed = value?.trim() ?? '';
	return /^[0-9a-f]{64}$/i.test(trimmed) ? trimmed.toLowerCase() : undefined;
}

/** `kind:pubkey:d-tag` address, or null when the param is a slug or event id. */
export function parseTaskAddressPointer(value: string): { dTag: string; author?: string } | null {
	let decoded = value;
	try {
		decoded = decodeURIComponent(value);
	} catch {
		decoded = value;
	}
	const [kind, author, ...dTagParts] = decoded.split(':');
	const dTag = dTagParts.join(':');
	const normalizedAuthor = normalizeAuthor(author);
	if (kind !== String(KINDS.TASK_CREATION) || !normalizedAuthor || !dTag) return null;
	return { dTag, author: normalizedAuthor };
}

function taskFilters(id: string, author?: string): Filter[] {
	const filters: Filter[] = [
		{
			kinds: [KINDS.TASK_CREATION],
			'#d': [id],
			...(author ? { authors: [author] } : {}),
			limit: 8
		}
	];
	if (/^[0-9a-f]{64}$/i.test(id)) {
		filters.unshift({
			kinds: [KINDS.TASK_CREATION],
			ids: [id.toLowerCase()],
			limit: 1
		});
	}
	return filters;
}

const TASK_EVENT_CACHE_MS = 30_000;
const taskEventCache = new Map<string, { at: number; value: FoundTaskEvent | null }>();

function asFoundTask(event: Event | null | undefined): FoundTaskEvent | null {
	if (!event?.id || !event.pubkey || typeof event.content !== 'string') return null;
	return {
		id: event.id,
		pubkey: event.pubkey,
		content: event.content,
		tags: event.tags ?? [],
		created_at: event.created_at
	};
}

/** Paint the first matching event. A slow relay must not hold the page. */
function firstMatchingEvent(queries: Promise<Event[]>[]): Promise<Event | null> {
	return new Promise((resolve) => {
		let pending = queries.length;
		let settled = false;
		const finish = (event: Event | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(event);
		};
		const timer = setTimeout(() => finish(null), LISTING_QUERY_MS);
		if (pending === 0) {
			finish(null);
			return;
		}
		for (const query of queries) {
			query
				.then((events) => {
					const event = [...events].sort(
						(left, right) => (right.created_at ?? 0) - (left.created_at ?? 0)
					)[0];
					if (event) finish(event);
				})
				.catch(() => undefined)
				.finally(() => {
					pending -= 1;
					if (pending <= 0) finish(null);
				});
		}
	});
}

/**
 * Load one task from the catalog relay.
 * Browse links use the d-tag. Homepage links use the event id.
 * The shared task relay does not store kind 31000, and an NDK fetch there never times out.
 */
export async function findTaskNostrEvent(
	rawId: string,
	author?: string | null
): Promise<FoundTaskEvent | null> {
	const pointer = parseTaskAddressPointer(rawId);
	const id = (pointer?.dTag ?? rawId).trim();
	if (!id) return null;
	const authorHex = pointer?.author ?? normalizeAuthor(author);
	const cacheKey = `${id}:${authorHex ?? ''}`;
	const cached = taskEventCache.get(cacheKey);
	if (cached && Date.now() - cached.at < TASK_EVENT_CACHE_MS) return cached.value;

	const filters = taskFilters(id, authorHex);
	const taskRelays = withoutProductionCatalogRelays(
		resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL)
	);
	const queries = filters.flatMap((filter) => [
		queryListingRelays(filter, { timeoutMs: LISTING_QUERY_MS }),
		taskRelays.length > 0
			? queryRelayEvents(taskRelays, filter, { timeoutMs: LISTING_QUERY_MS }).catch(
					() => [] as Event[]
				)
			: Promise.resolve([] as Event[])
	]);

	try {
		const value = asFoundTask(await firstMatchingEvent(queries));
		taskEventCache.set(cacheKey, { at: Date.now(), value });
		return value;
	} catch (error) {
		console.error('Failed to load task event:', error);
		return null;
	}
}
