import { createHash, randomBytes } from 'node:crypto';
import { chmod, chown, mkdir, open, readFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export const DEFAULT_TYPESENSE_ENV_FILE = '/opt/bittasker/typesense.env';
export const SANDBOX_INDEX_RELAYS =
	'wss://relay.bittasker.com,wss://nos.lol,wss://relay.primal.net';
export const DEV_INDEX_RELAYS = 'wss://relay1-dev.bittasker.com,wss://relay2-dev.bittasker.com';

const SECRET_KEYS = new Set(['TYPESENSE_API_KEY', 'TYPESENSE_SEARCH_ONLY_KEY']);

/** Short hash for logs. It is not enough to recover the key. */
export function fingerprint(value) {
	return createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

/**
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
	/** @type {Record<string, string>} */
	const values = {};
	for (const line of String(text || '').split('\n')) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const body = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed;
		const split = body.indexOf('=');
		if (split <= 0) continue;
		const key = body.slice(0, split).trim();
		let value = body.slice(split + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		if (value.includes('\n') || value.includes('\r')) continue;
		values[key] = value;
	}
	return values;
}

/**
 * @param {Record<string, string>} values
 */
export function renderEnv(values) {
	const preferred = [
		'TYPESENSE_API_KEY',
		'TYPESENSE_SEARCH_ONLY_KEY',
		'TYPESENSE_HOST',
		'TYPESENSE_COLLECTION_PREFIX',
		'SEARCH_PROVIDER',
		'NOSTR_RELAY_URLS',
		'BITTASKER_TEST_PUBKEYS'
	];
	const keys = [
		...preferred.filter((key) => values[key]),
		...Object.keys(values)
			.filter((key) => !preferred.includes(key))
			.sort()
	];
	const lines = [
		'# BitTasker Typesense. Root-owned mode 0600. Do not copy these values into GitLab CI variables.',
		...keys.map((key) => `${key}=${values[key]}`)
	];
	return `${lines.join('\n')}\n`;
}

/**
 * @param {string} file
 */
export async function readEnvFile(file) {
	try {
		return parseEnv(await readFile(file, 'utf8'));
	} catch (error) {
		if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return {};
		throw error;
	}
}

/**
 * @param {string} file
 * @param {Record<string, string>} values
 */
export async function writeEnvFile(file, values) {
	for (const key of SECRET_KEYS) {
		const value = values[key];
		if (value && (value.includes('\n') || value.includes('\r') || /\s/.test(value))) {
			throw new Error(`Refusing to store ${key} because the value is not a single token`);
		}
	}
	const directory = dirname(file);
	await mkdir(directory, { recursive: true, mode: 0o700 });
	await chmod(directory, 0o700);
	const tmp = `${file}.${process.pid}.tmp`;
	const handle = await open(tmp, 'w', 0o600);
	try {
		await handle.writeFile(renderEnv(values), 'utf8');
		await handle.chmod(0o600);
	} finally {
		await handle.close();
	}
	await rename(tmp, file);
	await chmod(file, 0o600);
	if (typeof process.getuid === 'function' && process.getuid() === 0) {
		try {
			await chown(directory, 0, 0);
			await chown(file, 0, 0);
		} catch {
			// The mode is already 0600. Ownership stays with the current root user.
		}
	}
}

/**
 * Create the admin key once. Later deploys reuse the same file.
 * @param {string} file
 * @param {Record<string, string>} [extras]
 */
export async function ensureTypesenseEnv(file, extras = {}) {
	const current = await readEnvFile(file);
	const createdAdmin = !current.TYPESENSE_API_KEY;
	const prefix = String(
		current.TYPESENSE_COLLECTION_PREFIX || extras.TYPESENSE_COLLECTION_PREFIX || ''
	).trim();
	const defaultRelays = prefix === 'dev_' ? DEV_INDEX_RELAYS : SANDBOX_INDEX_RELAYS;
	const next = {
		...current,
		TYPESENSE_API_KEY: current.TYPESENSE_API_KEY || randomBytes(32).toString('hex'),
		TYPESENSE_HOST: current.TYPESENSE_HOST || extras.TYPESENSE_HOST || 'http://127.0.0.1:8108',
		SEARCH_PROVIDER: 'typesense',
		NOSTR_RELAY_URLS: current.NOSTR_RELAY_URLS || extras.NOSTR_RELAY_URLS || defaultRelays
	};
	if (prefix) next.TYPESENSE_COLLECTION_PREFIX = prefix;
	if (extras.BITTASKER_TEST_PUBKEYS && !next.BITTASKER_TEST_PUBKEYS) {
		next.BITTASKER_TEST_PUBKEYS = extras.BITTASKER_TEST_PUBKEYS;
	}
	const changed =
		createdAdmin ||
		next.TYPESENSE_HOST !== current.TYPESENSE_HOST ||
		next.TYPESENSE_COLLECTION_PREFIX !== current.TYPESENSE_COLLECTION_PREFIX ||
		next.SEARCH_PROVIDER !== current.SEARCH_PROVIDER ||
		next.NOSTR_RELAY_URLS !== current.NOSTR_RELAY_URLS ||
		next.BITTASKER_TEST_PUBKEYS !== current.BITTASKER_TEST_PUBKEYS;
	if (changed || !current.TYPESENSE_API_KEY) await writeEnvFile(file, next);
	return {
		file,
		createdAdmin,
		hasSearchKey: Boolean(next.TYPESENSE_SEARCH_ONLY_KEY),
		adminFingerprint: fingerprint(next.TYPESENSE_API_KEY),
		searchFingerprint: next.TYPESENSE_SEARCH_ONLY_KEY
			? fingerprint(next.TYPESENSE_SEARCH_ONLY_KEY)
			: ''
	};
}

/**
 * Store a search-only key if the file does not already have one.
 * @param {string} file
 * @param {string} value
 */
export async function storeSearchOnlyKey(file, value) {
	const token = String(value || '').trim();
	if (!token) throw new Error('Typesense did not return a search-only key');
	const current = await readEnvFile(file);
	if (current.TYPESENSE_SEARCH_ONLY_KEY) {
		return { stored: false, fingerprint: fingerprint(current.TYPESENSE_SEARCH_ONLY_KEY) };
	}
	await writeEnvFile(file, { ...current, TYPESENSE_SEARCH_ONLY_KEY: token });
	return { stored: true, fingerprint: fingerprint(token) };
}

/** Production catalog relays must not be read by the sandbox indexer. */
export function productionCatalogRelay(relays) {
	return String(relays || '')
		.split(',')
		.map((relay) => relay.trim())
		.some((relay) => /^wss:\/\/relay[12]\.bittasker\.com\/?$/i.test(relay));
}
