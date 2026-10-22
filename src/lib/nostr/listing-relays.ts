import type { Event, Filter } from 'nostr-tools';
import {
	assertSandboxCatalogWrites,
	sandboxIsolatesCatalog,
	withoutProductionCatalogRelays
} from '$lib/nostr/catalog-guard';
import { queryRelayEvents, type RelayQueryOptions } from '$lib/nostr/relayQuery';
import { resolveExplicitRelayUrls, sanitizeRelayUrls } from '$lib/utils/relayUrls';

/**
 * Kind 31000 and 30402 reads on rgb.bittasker.com.
 * Writes stay on wss://relay.bittasker.com. relay2 is read-only here.
 */
export const SANDBOX_TASK_READ_RELAYS = ['wss://relay.bittasker.com', 'wss://relay2.bittasker.com'];

/**
 * Extra relays that hold the BitTasker task and service catalog.
 * On rgb the list is relay.bittasker.com and relay2.bittasker.com.
 * Other builds use VITE_NOSTR_LISTING_RELAY_URL. Dev relays stay off rgb.
 */
export function listingRelayUrls(): string[] {
	const configured = withoutProductionCatalogRelays(
		sanitizeRelayUrls(import.meta.env.VITE_NOSTR_LISTING_RELAY_URL)
	);
	if (!sandboxIsolatesCatalog()) return configured;
	return [...SANDBOX_TASK_READ_RELAYS];
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
