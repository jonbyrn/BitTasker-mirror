/**
 * Read-only relay indexer. It sends REQ subscriptions and writes to Typesense.
 * It does not sign or publish Nostr events.
 */
import { ensureTypesense, applyActions } from '../src/lib/search/search-api.js';
import { planIndexBatch, testPubkeysFromEnv } from '../src/lib/search/index-plan.js';
import { collectionPrefix } from '../src/lib/search/search-api.js';
import { indexerRelays, queryRelay, subscribeRelay } from '../src/lib/search/relay.js';

const env = process.env;
const kinds = [31000, 30402, 31150, 31160, 5];
const seen = new Map();

if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
	console.error(
		'Set TYPESENSE_HOST and TYPESENSE_API_KEY on the indexer. Do not put the admin key in VITE_ vars.'
	);
	process.exit(1);
}

async function ingest(events) {
	const planned = planIndexBatch(events, Date.now(), seen, {
		testPubkeys: testPubkeysFromEnv(env)
	});
	if (!planned.actions.length) return 0;
	const result = await applyActions({ ...env, SEARCH_PROVIDER: 'typesense' }, planned.actions);
	return result.applied || 0;
}

const once = env.INDEXER_ONCE === '1' || env.INDEXER_ONCE === 'true';
const relays = indexerRelays(env);
let prefix = '';
try {
	prefix = collectionPrefix(env);
} catch (error) {
	console.error(error instanceof Error ? error.message : 'Invalid TYPESENSE_COLLECTION_PREFIX');
	process.exit(1);
}
await ensureTypesense(env);
let applied = 0;
for (const relay of relays) {
	for (const kind of kinds) {
		const batch = await queryRelay(relay, [{ kinds: [kind], limit: 200 }]);
		applied += await ingest(batch);
	}
	if (once) continue;
	subscribeRelay(relay, [{ kinds, limit: 0 }], (event) => {
		ingest([event]).catch((error) => {
			console.error(error instanceof Error ? error.message : 'Index update failed');
		});
	});
}
console.log(
	`Indexed ${applied} listing updates into prefix=${prefix || '(none)'} from ${relays.join(', ')}`
);
if (once) process.exit(0);
