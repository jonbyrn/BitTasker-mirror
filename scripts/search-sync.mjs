/**
 * Backfill BitTasker tasks, services, and profiles into Typesense, then stay
 * connected so new and deleted events land within a few seconds.
 * Profiles (kinds 0, 30000) are requested only for task and service authors.
 *
 * Required: TYPESENSE_HOST, TYPESENSE_API_KEY
 * Optional: NOSTR_RELAY_URLS, BTC_USD_RATE,
 *           TYPESENSE_CREATE_SEARCH_KEY=true (writes the search-only key to
 *           TYPESENSE_ENV_FILE and prints a fingerprint, never the key)
 */
import { writeSync } from 'node:fs';
import { actionsFromEvent, mergeActions } from '../src/lib/search/documents.js';
import { authorPubkey, chunkAuthors } from '../src/lib/search/index-plan.js';
import {
	PUBLIC_INDEX_RELAYS,
	indexerRelays,
	queryKindUntilExhausted,
	subscribeRelay
} from '../src/lib/search/relay.js';
import { applyActions, ensureTypesense } from '../src/lib/search/search-api.js';

const CATALOG_KINDS = [31000, 30402, 30403, 31150, 31160];
const publicRelays = new Set(PUBLIC_INDEX_RELAYS);

const env = process.env;
const relays = indexerRelays(env);
const btcUsd = Number(env.BTC_USD_RATE) || 0;
const authors = new Set();

function log(message) {
	writeSync(1, `${message}\n`);
}

if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
	console.error('Set TYPESENSE_HOST and TYPESENSE_API_KEY before starting the indexer.');
	process.exit(1);
}

env.SEARCH_PROVIDER = 'typesense';

await ensureTypesense(env);

let indexed = 0;

async function pageKind(relay, kind, filter = {}) {
	await queryKindUntilExhausted(relay, kind, undefined, 200, {
		filter,
		onPage: async ({ page, events }) => {
			for (const event of events) {
				const pubkey = authorPubkey(event);
				if (pubkey) authors.add(pubkey);
			}
			const actions = mergeActions(events.map((event) => actionsFromEvent(event, { btcUsd })));
			const result = await applyActions(env, actions);
			indexed += result.applied || 0;
			log(`relay=${relay} kind=${kind} page=${page} events=${events.length}`);
		}
	});
}

for (const relay of relays) {
	for (const kind of CATALOG_KINDS) {
		await pageKind(relay, kind);
	}
	if (!publicRelays.has(relay)) await pageKind(relay, 5);
}

log(`profile authors=${authors.size}`);
for (const relay of relays) {
	for (const chunk of chunkAuthors(authors)) {
		await pageKind(relay, 0, { authors: chunk });
		await pageKind(relay, 30000, { authors: chunk });
	}
}

log(`Backfill applied ${indexed} updates. Listening for new events.`);

const since = Math.floor(Date.now() / 1000) - 30;
const stops = relays.map((relay) =>
	subscribeRelay(
		relay,
		[{ kinds: publicRelays.has(relay) ? CATALOG_KINDS : [...CATALOG_KINDS, 5], since }],
		(event) => {
			const actions = actionsFromEvent(event, { btcUsd });
			applyActions(env, actions).catch((error) => {
				console.error('Live index failed', error instanceof Error ? error.message : error);
			});
		}
	)
);

const stop = () => {
	for (const stopRelay of stops) stopRelay();
	process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
