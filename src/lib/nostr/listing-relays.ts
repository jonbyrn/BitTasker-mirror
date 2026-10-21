import type { Event, Filter } from 'nostr-tools';
import { queryRelayEvents, type RelayQueryOptions } from '$lib/nostr/relayQuery';
import { sanitizeRelayUrls } from '$lib/utils/relayUrls';

/**
 * Extra relays that hold the BitTasker task and service catalog.
 * The sandbox general relay is a public relay, so kind 31000 and 30402
 * there are mostly other apps. Leave this unset on dev, where the dev
 * relay already has the catalog.
 */
export function listingRelayUrls(): string[] {
	return sanitizeRelayUrls(import.meta.env.VITE_NOSTR_LISTING_RELAY_URL);
}

export function mergeRelayEvents(groups: Array<readonly Event[] | undefined>): Event[] {
	const byId = new Map<string, Event>();
	for (const group of groups) {
		for (const event of group || []) {
			if (!event?.id) continue;
			const existing = byId.get(event.id);
			if (!existing || (event.created_at ?? 0) >= (existing.created_at ?? 0)) {
				byId.set(event.id, event);
			}
		}
	}
	return [...byId.values()];
}

export async function queryListingRelays(
	filter: Filter,
	options?: RelayQueryOptions
): Promise<Event[]> {
	const relays = listingRelayUrls();
	if (relays.length === 0 || typeof WebSocket === 'undefined') return [];
	try {
		return await queryRelayEvents(relays, filter, options);
	} catch {
		return [];
	}
}
