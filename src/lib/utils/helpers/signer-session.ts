/**
 * Tab session cache for the Nostr signer and wallet seed.
 * Ciphertext lives in sessionStorage (gone when the tab closes).
 * The AES-GCM key is non-extractable and stays in IndexedDB.
 * A reload in the same tab can sign without another WebAuthn prompt.
 */

const DB_NAME = 'bittasker-wallet-session';
const STORE = 'keys';
const KEY_ID = 'mnemonic-key';
const MNEMONIC_CIPHER_KEY = 'bittasker.mnemonic.cipher';
const SIGNER_CIPHER_KEY = 'bittasker.signer.cipher';

const MNEMONIC_TTL_MS = 30 * 60 * 1000;
export const SIGNER_SESSION_TTL_MS = 8 * 60 * 60 * 1000;

interface CipherPack {
	iv: string;
	data: string;
	at: number;
}

export function sessionFresh(savedAt: number, now: number, ttl = MNEMONIC_TTL_MS): boolean {
	return Number.isFinite(savedAt) && now - savedAt >= 0 && now - savedAt < ttl;
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

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function idbDone<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

async function readKey(): Promise<CryptoKey | null> {
	if (typeof indexedDB === 'undefined') return null;
	const db = await openDb();
	try {
		const result = await idbDone(db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID));
		return (result as CryptoKey | undefined) ?? null;
	} finally {
		db.close();
	}
}

async function writeKey(key: CryptoKey): Promise<void> {
	const db = await openDb();
	try {
		await idbDone(db.transaction(STORE, 'readwrite').objectStore(STORE).put(key, KEY_ID));
	} finally {
		db.close();
	}
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

function readPack(storageKey: string): CipherPack | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(storageKey);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<CipherPack>;
		if (
			typeof parsed.iv !== 'string' ||
			typeof parsed.data !== 'string' ||
			typeof parsed.at !== 'number'
		) {
			return null;
		}
		return { iv: parsed.iv, data: parsed.data, at: parsed.at };
	} catch {
		return null;
	}
}

function writePack(pack: CipherPack, storageKey: string): void {
	sessionStorage.setItem(storageKey, JSON.stringify(pack));
}

async function encryptText(text: string): Promise<CipherPack> {
	const key = await sessionKey();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(text)
	);
	return { iv: bytesToBase64(iv), data: bytesToBase64(new Uint8Array(cipher)), at: Date.now() };
}

async function decryptPack(pack: CipherPack): Promise<string | null> {
	const key = await readKey();
	if (!key) return null;
	const iv = new Uint8Array(base64ToBytes(pack.iv));
	const data = new Uint8Array(base64ToBytes(pack.data));
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: iv as BufferSource },
		key,
		data as BufferSource
	);
	return new TextDecoder().decode(plain);
}

export async function saveSignerSession(nsec: string, npub: string): Promise<void> {
	if (!nsec || !npub || typeof sessionStorage === 'undefined') return;
	writePack(await encryptText(JSON.stringify({ nsec, npub })), SIGNER_CIPHER_KEY);
}

export async function readSignerSession(
	now = Date.now()
): Promise<{ nsec: string; npub: string } | null> {
	const pack = readPack(SIGNER_CIPHER_KEY);
	if (!pack || !sessionFresh(pack.at, now, SIGNER_SESSION_TTL_MS)) {
		if (pack && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(SIGNER_CIPHER_KEY);
		return null;
	}
	try {
		const plain = await decryptPack(pack);
		if (!plain) return null;
		const parsed = JSON.parse(plain) as { nsec?: unknown; npub?: unknown };
		if (
			typeof parsed.nsec !== 'string' ||
			typeof parsed.npub !== 'string' ||
			!parsed.nsec ||
			!parsed.npub
		) {
			return null;
		}
		writePack({ ...pack, at: now }, SIGNER_CIPHER_KEY);
		return { nsec: parsed.nsec, npub: parsed.npub };
	} catch {
		return null;
	}
}

export function signerCached(now = Date.now()): boolean {
	const pack = readPack(SIGNER_CIPHER_KEY);
	return Boolean(pack && sessionFresh(pack.at, now, SIGNER_SESSION_TTL_MS));
}

export async function saveMnemonicSession(mnemonic: string): Promise<void> {
	if (!mnemonic || typeof sessionStorage === 'undefined') return;
	writePack(await encryptText(mnemonic), MNEMONIC_CIPHER_KEY);
}

export async function readMnemonicSession(now = Date.now()): Promise<string | null> {
	const pack = readPack(MNEMONIC_CIPHER_KEY);
	if (!pack || !sessionFresh(pack.at, now)) {
		if (pack && typeof sessionStorage !== 'undefined')
			sessionStorage.removeItem(MNEMONIC_CIPHER_KEY);
		return null;
	}
	const plain = await decryptPack(pack);
	if (!plain) return null;
	writePack({ ...pack, at: now }, MNEMONIC_CIPHER_KEY);
	return plain;
}

export async function clearKeySessions(): Promise<void> {
	if (typeof sessionStorage !== 'undefined') {
		sessionStorage.removeItem(MNEMONIC_CIPHER_KEY);
		sessionStorage.removeItem(SIGNER_CIPHER_KEY);
	}
	if (typeof indexedDB === 'undefined') return;
	const db = await openDb();
	try {
		await idbDone(db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY_ID));
	} finally {
		db.close();
	}
}
