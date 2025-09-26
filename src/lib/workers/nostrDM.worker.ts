// Web Worker: Fetch encrypted Nostr DMs off the main thread
// Note: This worker does NOT decrypt. It only fetches events.

import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';

type FetchMessage = {
	type: 'fetchDMs';
	payload: {
		relays: string[];
		filter: Filter;
	};
};

self.addEventListener('message', async (evt: MessageEvent<FetchMessage>) => {
	const data = evt.data;
	if (!data || data.type !== 'fetchDMs') return;

	const { relays, filter } = data.payload;
	const pool = new SimplePool();

	try {
		// Query all relays and merge (best-effort)
		const results: NostrEvent[] = [];
		for (const relay of relays || []) {
			try {
				const events = await pool.querySync([relay], filter);
				if (events && events.length) results.push(...events);
			} catch (e) {
				// ignore per-relay errors
			}
		}

		(self as any).postMessage({ type: 'fetched', payload: { events: results } });
	} catch (err) {
		(self as any).postMessage({ type: 'error', payload: { message: (err as Error)?.message || 'fetch error' } });
	}

	// Close the worker after one operation
	(self as any).close?.();
});


