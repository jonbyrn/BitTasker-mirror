import type { Event, Filter } from 'nostr-tools';
import { mergeRelayEvents, queryListingRelays } from '$lib/nostr/listing-relays';
import { queryRelayEvents } from '$lib/nostr/relayQuery';
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
	const filters = taskFilters(id, authorHex);
	const taskRelays = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);

	try {
		const groups = await Promise.all(
			filters.flatMap((filter) => [
				queryListingRelays(filter),
				taskRelays.length > 0
					? queryRelayEvents(taskRelays, filter).catch(() => [] as Event[])
					: Promise.resolve([] as Event[])
			])
		);
		const events = mergeRelayEvents(groups).sort(
			(left, right) => (right.created_at ?? 0) - (left.created_at ?? 0)
		);
		const event = events[0];
		if (!event?.id || !event.pubkey || typeof event.content !== 'string') return null;
		return {
			id: event.id,
			pubkey: event.pubkey,
			content: event.content,
			tags: event.tags ?? [],
			created_at: event.created_at
		};
	} catch (error) {
		console.error('Failed to load task event:', error);
		return null;
	}
}
