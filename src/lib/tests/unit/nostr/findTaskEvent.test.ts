import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Event, Filter } from 'nostr-tools';
import KINDS from '$lib/utils/constants/kinds';

const queryListingRelays = vi.fn<(filter: Filter) => Promise<Event[]>>();
const queryRelayEvents = vi.fn<(relays: string[], filter: Filter) => Promise<Event[]>>();

vi.mock('$lib/nostr/listing-relays', () => ({
	queryListingRelays: (filter: Filter) => queryListingRelays(filter),
	mergeRelayEvents: (groups: Array<readonly Event[] | undefined>) =>
		groups.flatMap((group) => group ?? [])
}));

vi.mock('$lib/nostr/relayQuery', () => ({
	queryRelayEvents: (relays: string[], filter: Filter) => queryRelayEvents(relays, filter)
}));

vi.mock('$lib/utils/relayUrls', () => ({
	resolveTaskRelayUrls: () => ['wss://relay.primal.net']
}));

function event(partial: Partial<Event> & Pick<Event, 'id' | 'content'>): Event {
	return {
		pubkey: 'aa'.repeat(32),
		created_at: 10,
		kind: KINDS.TASK_CREATION,
		tags: [['d', 'paint-a-room']],
		sig: 'sig',
		...partial
	};
}

describe('findTaskNostrEvent', () => {
	beforeEach(() => {
		queryListingRelays.mockReset();
		queryRelayEvents.mockReset();
		queryListingRelays.mockResolvedValue([]);
		queryRelayEvents.mockResolvedValue([]);
	});

	it('reads a browse slug from the listing relay', async () => {
		const found = event({
			id: 'b'.repeat(64),
			content: '{"title":"Paint"}',
			tags: [['d', 'paint-a-room']],
			created_at: 20
		});
		queryListingRelays.mockImplementation(async (filter) => {
			const dTag = (filter as { '#d'?: string[] })['#d'];
			return dTag?.includes('paint-a-room') ? [found] : [];
		});
		const { findTaskNostrEvent } = await import('$lib/nostr/findTaskEvent');
		const result = await findTaskNostrEvent('paint-a-room');
		expect(result?.id).toBe(found.id);
		expect(queryListingRelays).toHaveBeenCalled();
		expect(queryRelayEvents).toHaveBeenCalled();
	});

	it('reads a homepage event id', async () => {
		const id = 'c'.repeat(64);
		queryListingRelays.mockImplementation(async (filter) => {
			return filter.ids?.includes(id) ? [event({ id, content: '{"title":"Move"}', tags: [] })] : [];
		});
		const { findTaskNostrEvent } = await import('$lib/nostr/findTaskEvent');
		const result = await findTaskNostrEvent(id);
		expect(result?.id).toBe(id);
	});
});
