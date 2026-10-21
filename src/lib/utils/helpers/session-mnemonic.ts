import {
	IDB_OPEN_MS,
	IndexedDbTimeoutError,
	idbRequest,
	openIndexedDb,
	withIndexedDb
} from '$lib/utils/helpers/indexed-db-open';

const DB_NAME = 'bittasker-wallet-session';
const STORE = 'keys';
const KEY_ID = 'mnemonic-key';
export const MNEMONIC_CIPHER_KEY = 'bittasker.mnemonic.cipher';
export const SIGNER_CIPHER_KEY = 'bittasker.signer.cipher';
const CIPHER_KEY = MNEMONIC_CIPHER_KEY;
const SIGNER_KEY = SIGNER_CIPHER_KEY;

export const SESSION_TTL_MS = 30 * 60 * 1000;
/** Sliding window for routine Nostr signing. sessionStorage drops the ciphertext when the tab closes. */
export const SIGNER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface CipherPack {
	iv: string;
	data: string;
	at: number;
}

function bytesToBase64(bytes: Uint8Array): string {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
	const binary = atob(value);
	const bytes = new Uint8Array(binary.length);
	for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
	return bytes;
}

export function sessionFresh(savedAt: number, now: number, ttl = SESSION_TTL_MS): boolean {
	return Number.isFinite(savedAt) && now - savedAt >= 0 && now - savedAt < ttl;
}

function openDb(timeoutMs = 0): Promise<IDBDatabase> {
	return openIndexedDb(
		DB_NAME,
		1,
		(db) => {
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		},
		timeoutMs
	);
}

async function readKey(timeoutMs = 0): Promise<CryptoKey | null> {
	if (typeof indexedDB === 'undefined') return null;
	return withIndexedDb(openDb(timeoutMs), async (db) => {
		const result = await idbRequest<CryptoKey | undefined>(
			db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID),
			'session key read',
			timeoutMs
		);
		return result ?? null;
	});
}

async function writeKey(key: CryptoKey): Promise<void> {
	await withIndexedDb(openDb(), (db) =>
		idbRequest(
			db.transaction(STORE, 'readwrite').objectStore(STORE).put(key, KEY_ID),
			'session key write',
			0
		).then(() => undefined)
	);
}

function readPack(storageKey = CIPHER_KEY): CipherPack | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return null;
		const row = parsed as Partial<CipherPack>;
		if (typeof row.iv !== 'string' || typeof row.data !== 'string' || typeof row.at !== 'number') {
			return null;
		}
		return { iv: row.iv, data: row.data, at: row.at };
	} catch {
		return null;
	}
}

function writePack(pack: CipherPack, storageKey = CIPHER_KEY): void {
	sessionStorage.setItem(storageKey, JSON.stringify(pack));
}

async function sessionKey(): Promise<CryptoKey> {
	const existing = await readKey();
	if (existing) return existing;
	const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]);
	await writeKey(key);
	return key;
}

async function encryptText(text: string): Promise<CipherPack> {
	const key = await sessionKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(text)
	);
	return {
		iv: bytesToBase64(iv),
		data: bytesToBase64(new Uint8Array(cipher)),
		at: Date.now()
	};
}

async function decryptPack(pack: CipherPack, timeoutMs = 0): Promise<string | null> {
	const key = await readKey(timeoutMs);
	if (!key) return null;
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64ToBytes(pack.iv) },
		key,
		base64ToBytes(pack.data)
	);
	return new TextDecoder().decode(plain);
}

/** Encrypt the mnemonic with a non-extractable key. The key stays in IndexedDB. */
export async function saveMnemonicSession(mnemonic: string): Promise<void> {
	writePack(await encryptText(mnemonic));
}

/** Decrypt the session mnemonic. Returns null when the cache is missing or idle. */
export async function readMnemonicSession(
	now = Date.now(),
	timeoutMs = IDB_OPEN_MS
): Promise<string | null> {
	const pack = readPack();
	if (!pack || !sessionFresh(pack.at, now)) {
		if (pack) await clearMnemonicSession();
		return null;
	}
	const plain = await decryptPack(pack, timeoutMs);
	if (!plain) return null;
	writePack({ ...pack, at: now });
	return plain;
}

export function signerCached(now = Date.now()): boolean {
	const pack = readPack(SIGNER_KEY);
	return Boolean(pack && sessionFresh(pack.at, now, SIGNER_SESSION_TTL_MS));
}

/** Encrypt the Nostr secret with the same session key as the mnemonic. */
export async function saveSignerSession(nsec: string, npub: string): Promise<void> {
	if (!nsec || !npub) return;
	writePack(await encryptText(JSON.stringify({ nsec, npub })), SIGNER_KEY);
}

/** A hard refresh can block IndexedDB for a moment while the wallet opens the same database. */
export function isTransientSessionError(error: unknown): boolean {
	if (error instanceof IndexedDbTimeoutError) return true;
	if (!(error instanceof Error)) return false;
	const message = error.message.toLowerCase();
	return (
		message.includes('timed out') || message.includes('blocked') || message.includes('aborted')
	);
}

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Decrypt the cached Nostr key. Returns null when the cache is missing or idle.
 * A blocked database is retried. The ciphertext stays so the next read can still succeed.
 */
export async function readSignerSession(
	now = Date.now()
): Promise<{ nsec: string; npub: string } | null> {
	const pack = readPack(SIGNER_KEY);
	if (!pack || !sessionFresh(pack.at, now, SIGNER_SESSION_TTL_MS)) {
		if (pack && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SIGNER_KEY);
		return null;
	}
	const waits = [80, 200, 500];
	for (let attempt = 0; attempt <= waits.length; attempt += 1) {
		try {
			const plain = await decryptPack(pack);
			if (!plain) {
				if (attempt < waits.length) {
					await pause(waits[attempt]);
					continue;
				}
				return null;
			}
			const parsed: unknown = JSON.parse(plain);
			if (!parsed || typeof parsed !== 'object') return null;
			const row = parsed as { nsec?: unknown; npub?: unknown };
			if (typeof row.nsec !== 'string' || typeof row.npub !== 'string' || !row.nsec || !row.npub) {
				return null;
			}
			writePack({ ...pack, at: now }, SIGNER_KEY);
			return { nsec: row.nsec, npub: row.npub };
		} catch (error) {
			if (!isTransientSessionError(error) || attempt === waits.length) return null;
			await pause(waits[attempt]);
		}
	}
	return null;
}

/** Drop the wallet seed cache. The Nostr signer and its IndexedDB key stay so a bid can still be signed. */
export async function clearMnemonicSession(): Promise<void> {
	if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CIPHER_KEY);
}

export async function clearSignerSession(): Promise<void> {
	if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SIGNER_KEY);
}

/** Logout. Removes both ciphertexts and the non-extractable AES key. */
export async function clearKeySessions(): Promise<void> {
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem(CIPHER_KEY);
		sessionStorage.removeItem(SIGNER_KEY);
	}
	if (typeof indexedDB === 'undefined') return;
	await withIndexedDb(openDb(), (db) =>
		idbRequest(
			db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY_ID),
			'session key delete',
			0
		).then(() => undefined)
	);
}
