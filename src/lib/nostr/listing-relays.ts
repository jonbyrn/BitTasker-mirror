import type { Event, Filter } from 'nostr-tools';
import {
	assertSandboxCatalogWrites,
	sandboxIsolatesCatalog,
	withoutProductionCatalogRelays
} from '$lib/nostr/catalog-guard';
import { queryRelayEvents, type RelayQueryOptions } from '$lib/nostr/relayQuery';
import { resolveExplicitRelayUrls, sanitizeRelayUrls } from '$lib/utils/relayUrls';

/**
 * Extra relays that hold the BitTasker task and service catalog.
 * The sandbox catalog is wss://relay.bittasker.com. Kind 31000 and 30402
 * stay off relay1, relay2, and the dev pair. Leave this unset on dev, where
 * the dev relay already has the catalog.
 */
export function listingRelayUrls(): string[] {
	return withoutProductionCatalogRelays(
		sanitizeRelayUrls(import.meta.env.VITE_NOSTR_LISTING_RELAY_URL)
	);
}

/** Where a new task or service is published. Sandbox never falls back onto production. */
export function listingWriteRelays(): string[] {
	const listing = listingRelayUrls();
	if (sandboxIsolatesCatalog()) return assertSandboxCatalogWrites(listing);
	if (listing.length > 0) return listing;
	return resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
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
