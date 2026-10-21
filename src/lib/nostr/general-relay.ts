import type { Event, Filter } from 'nostr-tools';
import { queryRelayEvents, type RelayQueryOptions } from '$lib/nostr/relayQuery';
import { publishToMultipleRelays } from '$lib/utils/nostr';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';

/** Sandbox general relays. Tasks, bids, and direct messages already use these. */
export function generalRelayUrls(): string[] {
	return resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

export async function publishToGeneralRelays(event: Event): Promise<void> {
	const relays = generalRelayUrls();
	if (relays.length === 0) {
		throw new Error('No Nostr relay is configured for publishing.');
	}

	const results = await publishToMultipleRelays(event, relays);
	if (!results.some((result) => result.success)) {
		const detail = results
			.map((result) => `${result.relay}: ${result.error ?? 'failed'}`)
			.join(', ');
		throw new Error(`Failed to publish to any relay. ${detail}`);
	}
}

export async function queryGeneralRelays(
	filters: Filter[],
	options?: RelayQueryOptions
): Promise<Event[]> {
	const relays = generalRelayUrls();
	const usable = filters.filter((filter) => filter && typeof filter === 'object');
	if (relays.length === 0 || usable.length === 0) return [];

	const batches = await Promise.all(
		usable.map((filter) => queryRelayEvents(relays, filter, options).catch(() => [] as Event[]))
	);
	const byId = new Map<string, Event>();
	for (const event of batches.flat()) {
		if (!event?.id) continue;
		const existing = byId.get(event.id);
		if (!existing || event.created_at > existing.created_at) byId.set(event.id, event);
	}
	return [...byId.values()];
}
