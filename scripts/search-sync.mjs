/**
 * Backfill BitTasker tasks, services, and profiles into Typesense, then stay
 * connected so new and deleted events land within a few seconds.
 *
 * Required: TYPESENSE_HOST, TYPESENSE_API_KEY
 * Optional: NOSTR_RELAY_URLS, SEARCH_BACKFILL_PAGES, BTC_USD_RATE,
 *           TYPESENSE_CREATE_SEARCH_KEY=true (writes the search-only key to
 *           TYPESENSE_ENV_FILE and prints a fingerprint, never the key)
 */
import { actionsFromEvent, mergeActions } from '../src/lib/search/documents.js';
import { indexerRelays, queryRelay, subscribeRelay } from '../src/lib/search/relay.js';
import { applyActions, ensureTypesense } from '../src/lib/search/search-api.js';

const KINDS = [0, 30000, 31000, 30402, 30403, 31150, 31160, 5];

const env = process.env;
const relays = indexerRelays(env);
const pages = Math.max(1, Number(env.SEARCH_BACKFILL_PAGES) || 25);
const btcUsd = Number(env.BTC_USD_RATE) || 0;

if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
	console.error('Set TYPESENSE_HOST and TYPESENSE_API_KEY before starting the indexer.');
	process.exit(1);
}

env.SEARCH_PROVIDER = 'typesense';

await ensureTypesense(env);

let indexed = 0;
for (const relay of relays) {
	for (const kind of KINDS) {
		let until = Math.floor(Date.now() / 1000);
		for (let page = 0; page < pages; page += 1) {
			const batch = await queryRelay(relay, [{ kinds: [kind], until, limit: 200 }]);
			if (!batch.length) break;
			const actions = mergeActions(batch.map((event) => actionsFromEvent(event, { btcUsd })));
			const result = await applyActions(env, actions);
			indexed += result.applied || 0;
			const oldest = Math.min(...batch.map((event) => Number(event.created_at) || until));
			console.log(`relay ${relay} kind ${kind} page ${page + 1} events ${batch.length}`);
			if (batch.length < 200 || oldest >= until) break;
			until = oldest - 1;
		}
	}
}

console.log(`Backfill applied ${indexed} updates. Listening for new events.`);

const since = Math.floor(Date.now() / 1000) - 30;
const stops = relays.map((relay) =>
	subscribeRelay(relay, [{ kinds: KINDS, since }], (event) => {
		const actions = actionsFromEvent(event, { btcUsd });
		applyActions(env, actions).catch((error) => {
			console.error('Live index failed', error instanceof Error ? error.message : error);
		});
	})
);

const stop = () => {
	for (const stopRelay of stops) stopRelay();
	process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
