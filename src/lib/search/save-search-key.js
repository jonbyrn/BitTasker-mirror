import { issueSearchOnlyKey } from './search-api.js';
import {
	DEFAULT_TYPESENSE_ENV_FILE,
	fingerprint,
	readEnvFile,
	storeSearchOnlyKey
} from './search-key-file.js';

/**
 * Writes the scoped key to the host env file and logs a fingerprint only.
 * Import this from the indexer host, not from the Cloudflare worker.
 * @param {Record<string, string | undefined>} env
 */
export async function saveScopedSearchKey(env) {
	const file = env.TYPESENSE_ENV_FILE || DEFAULT_TYPESENSE_ENV_FILE;
	const existing = await readEnvFile(file);
	const already = env.TYPESENSE_SEARCH_ONLY_KEY || existing.TYPESENSE_SEARCH_ONLY_KEY || '';
	if (already) {
		console.log(`search-only key already stored fingerprint=${fingerprint(already)}`);
		return;
	}
	const value = await issueSearchOnlyKey(env);
	const saved = await storeSearchOnlyKey(file, value);
	console.log(`search-only key stored fingerprint=${saved.fingerprint}`);
}
