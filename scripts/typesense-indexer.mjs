/**
 * Read-only relay indexer. It sends REQ subscriptions and writes to Typesense.
 * It does not sign or publish Nostr events.
 *
 * INDEXER_ONCE walks each relay on its own `until`, writes a progress line per
 * page, then exits. Kind 0 and 30000 are requested only for task and service authors.
 */
import { writeSync } from 'node:fs';
import { ensureTypesense, applyActions } from '../src/lib/search/search-api.js';
import {
	INDEXER_KINDS,
	PROFILE_INDEX_KINDS,
	authorPubkey,
	chunkAuthors,
	isProfileKind,
	planIndexBatch,
	testPubkeysFromEnv
} from '../src/lib/search/index-plan.js';
import { collectionPrefix } from '../src/lib/search/search-api.js';
import {
	PUBLIC_INDEX_RELAYS,
	indexerRelays,
	queryKindUntilExhausted,
	subscribeRelay
} from '../src/lib/search/relay.js';

const env = process.env;
const seen = new Map();
const authors = new Set();
const publicRelays = new Set(PUBLIC_INDEX_RELAYS);

if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
	console.error(
		'Set TYPESENSE_HOST and TYPESENSE_API_KEY on the indexer. Do not put the admin key in VITE_ vars.'
	);
	process.exit(1);
}

/** Docker stdout is block-buffered without a TTY. A direct write shows each page. */
function log(message) {
	writeSync(1, `${message}\n`);
}

async function ingest(events) {
	for (const event of events) {
		const pubkey = authorPubkey(event);
		if (pubkey) authors.add(pubkey);
	}
	const planned = planIndexBatch(events, Date.now(), seen, {
		testPubkeys: testPubkeysFromEnv(env)
	});
	if (!planned.actions.length) return 0;
	const result = await applyActions({ ...env, SEARCH_PROVIDER: 'typesense' }, planned.actions);
	return result.applied || 0;
}

/**
 * @param {string} relay
 * @param {number} kind
 * @param {Record<string, unknown>} [filter]
 */
async function pageKind(relay, kind, filter = {}) {
	let applied = 0;
	await queryKindUntilExhausted(relay, kind, undefined, 200, {
		filter,
		onPage: async ({ page, events, timedOut }) => {
			const wrote = await ingest(events);
			applied += wrote;
			log(
				`relay=${relay} kind=${kind} page=${page} events=${events.length} applied=${wrote}${timedOut ? ' timed_out=1' : ''}`
			);
		}
	});
	return applied;
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
const catalogKinds = INDEXER_KINDS.filter((kind) => !isProfileKind(kind) && kind !== 5);
for (const relay of relays) {
	for (const kind of catalogKinds) {
		applied += await pageKind(relay, kind);
	}
	if (publicRelays.has(relay)) {
		log(`relay=${relay} kind=5 skipped public deletion scan`);
		continue;
	}
	applied += await pageKind(relay, 5);
}

const chunks = chunkAuthors(authors);
log(`profile authors=${authors.size} chunks=${chunks.length}`);
for (const relay of relays) {
	for (const chunk of chunks) {
		for (const kind of PROFILE_INDEX_KINDS) {
			applied += await pageKind(relay, kind, { authors: chunk });
		}
	}
}

log(
	`Indexed ${applied} listing and profile updates into prefix=${prefix || '(none)'} from ${relays.join(', ')}`
);
if (once) process.exit(0);

for (const relay of relays) {
	const liveKinds = publicRelays.has(relay) ? catalogKinds : [...catalogKinds, 5];
	subscribeRelay(relay, [{ kinds: liveKinds, limit: 0 }], (event) => {
		const pubkey = authorPubkey(event);
		const needProfile = Boolean(pubkey) && !authors.has(pubkey);
		ingest([event])
			.then(async () => {
				if (!needProfile || !pubkey) return;
				for (const kind of PROFILE_INDEX_KINDS) {
					await pageKind(relay, kind, { authors: [pubkey] });
				}
			})
			.catch((error) => {
				console.error(error instanceof Error ? error.message : 'Index update failed');
			});
	});
}
