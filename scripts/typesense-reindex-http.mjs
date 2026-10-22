/**
 * Replace dev_ or rgb_ tasks, services, and shifts from GET /api/v1/events.
 *
 * The Typesense admin key is read from TYPESENSE_API_KEY or from
 * TYPESENSE_ENV_FILE (default /opt/bittasker/typesense.env on the VPS).
 * This script never prints that key and it must not be copied into git or VITE_*.
 *
 * Re-run on the VPS:
 *   docker run --rm --network host \
 *     -v /opt/bittasker/app:/app -w /app \
 *     -v /opt/bittasker/typesense.env:/opt/bittasker/typesense.env:ro \
 *     -e TYPESENSE_ENV_FILE=/opt/bittasker/typesense.env \
 *     -e TYPESENSE_HOST=http://127.0.0.1:8108 \
 *     -e REINDEX_TYPESENSE=both \
 *     node:22-bookworm-slim node scripts/typesense-reindex-http.mjs
 *
 * REINDEX_TYPESENSE=dev | rgb | both. dev reads relay2-dev. rgb reads relay.bittasker.com.
 */
import { actionsFromEvent, mergeActions } from '../src/lib/search/documents.js';
import {
	CATALOG_KINDS,
	fetchCatalogEvents,
	fixtureRemovals,
	httpOriginForPrefix
} from '../src/lib/search/http-catalog.js';
import { readEnvFile } from '../src/lib/search/search-key-file.js';
import {
	applyActions,
	listingStats,
	recreateListingCollections
} from '../src/lib/search/search-api.js';

const file = process.env.TYPESENSE_ENV_FILE || '/opt/bittasker/typesense.env';
const stored = await readEnvFile(file);
const selection = String(process.env.REINDEX_TYPESENSE || process.env.TYPESENSE_COLLECTION_PREFIX || 'dev_')
	.trim()
	.toLowerCase();

/** @type {string[]} */
let prefixes = [];
if (selection === 'both') prefixes = ['dev_', 'rgb_'];
else if (selection === 'dev' || selection === 'dev_') prefixes = ['dev_'];
else if (selection === 'rgb' || selection === 'rgb_') prefixes = ['rgb_'];
else {
	console.error('REINDEX_TYPESENSE must be dev, rgb, or both');
	process.exit(1);
}

const adminKey = process.env.TYPESENSE_API_KEY || stored.TYPESENSE_API_KEY || '';
let host = String(
	process.env.TYPESENSE_HOST || stored.TYPESENSE_HOST || 'https://typesense-dev.bittasker.com'
).replace(/\/$/, '');
if (!adminKey || !host) {
	console.error(
		'Set TYPESENSE_HOST and TYPESENSE_API_KEY on the indexer host. Do not put the admin key in VITE_ vars.'
	);
	process.exit(1);
}
if (stored.TYPESENSE_API_KEY) console.log('admin key source: vps env file');
else console.log('admin key source: secret');

const publicHost = 'https://typesense-dev.bittasker.com';
try {
	const health = await fetch(`${host}/health`, { signal: AbortSignal.timeout(4000) });
	if (!health.ok) throw new Error(`status ${health.status}`);
} catch {
	if (host !== publicHost) {
		console.log('typesense host: public fallback');
		host = publicHost;
	}
}

const summaries = [];
for (const prefix of prefixes) {
	const origin =
		prefixes.length === 1 && process.env.INDEXER_HTTP_ORIGIN
			? process.env.INDEXER_HTTP_ORIGIN
			: httpOriginForPrefix(prefix);
	const env = {
		SEARCH_PROVIDER: 'typesense',
		TYPESENSE_HOST: host,
		TYPESENSE_API_KEY: adminKey,
		TYPESENSE_COLLECTION_PREFIX: prefix
	};
	const collections = await recreateListingCollections(env);
	/** @type {Record<number, number>} */
	const fetched = {};
	/** @type {any[]} */
	const events = [];
	for (const kind of CATALOG_KINDS) {
		const batch = await fetchCatalogEvents(origin, kind);
		fetched[kind] = batch.length;
		events.push(...batch);
	}
	const indexed = mergeActions(events.map((event) => actionsFromEvent(event, { btcUsd: 0 })));
	const actions = [...fixtureRemovals(prefix), ...indexed];
	const applied = await applyActions(env, actions);
	const stats = {};
	for (const logical of ['tasks', 'services', 'shifts']) {
		stats[logical] = await listingStats(env, logical, '*');
		stats[`${logical}Test`] = await listingStats(env, logical, 'TEST');
	}
	const upserts = indexed.filter((action) => action.op === 'upsert');
	summaries.push({
		prefix,
		origin,
		collections,
		fetched,
		applied: applied.applied || 0,
		upserts: {
			tasks: upserts.filter((action) => action.collection === 'tasks').length,
			services: upserts.filter((action) => action.collection === 'services').length,
			shifts: upserts.filter((action) => action.collection === 'shifts').length
		},
		stats
	});
}

console.log(JSON.stringify({ reindex: summaries }, null, 2));
