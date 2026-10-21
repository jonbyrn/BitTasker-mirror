/**
 * Create the scoped search-only key once and store it in the host env file.
 * Prints a fingerprint only.
 */
import { readEnvFile } from '../src/lib/search/search-key-file.js';
import { ensureTypesense } from '../src/lib/search/search-api.js';
import { saveScopedSearchKey } from '../src/lib/search/save-search-key.js';

const file = process.env.TYPESENSE_ENV_FILE || '/opt/bittasker/typesense.env';
const stored = await readEnvFile(file);
const env = {
	TYPESENSE_ENV_FILE: file,
	TYPESENSE_HOST: process.env.TYPESENSE_HOST || stored.TYPESENSE_HOST,
	TYPESENSE_API_KEY: process.env.TYPESENSE_API_KEY || stored.TYPESENSE_API_KEY,
	TYPESENSE_SEARCH_ONLY_KEY: stored.TYPESENSE_SEARCH_ONLY_KEY || '',
	SEARCH_PROVIDER: 'typesense'
};
if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
	console.error('Typesense admin key or host is missing from the env file');
	process.exit(1);
}
await ensureTypesense(env);
await saveScopedSearchKey(env);
