/**
 * Create or reuse /opt/bittasker/typesense.env.
 * Prints fingerprints only. Never prints TYPESENSE_API_KEY or TYPESENSE_SEARCH_ONLY_KEY.
 */
import {
	ensureTypesenseEnv,
	productionCatalogRelay,
	readEnvFile
} from '../src/lib/search/search-key-file.js';

const file = process.env.TYPESENSE_ENV_FILE || '/opt/bittasker/typesense.env';
const result = await ensureTypesenseEnv(file, {
	TYPESENSE_COLLECTION_PREFIX: process.env.TYPESENSE_COLLECTION_PREFIX || '',
	NOSTR_RELAY_URLS: process.env.NOSTR_RELAY_URLS || '',
	TYPESENSE_HOST: process.env.TYPESENSE_HOST || ''
});
const stored = await readEnvFile(file);
if (productionCatalogRelay(stored.NOSTR_RELAY_URLS)) {
	console.error(
		'Sandbox indexer refuses production catalog relays relay1.bittasker.com and relay2.bittasker.com'
	);
	process.exit(1);
}
console.log(
	`typesense env ready createdAdmin=${result.createdAdmin} hasSearchKey=${result.hasSearchKey} adminFingerprint=${result.adminFingerprint}`
);
