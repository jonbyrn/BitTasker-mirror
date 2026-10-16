const DB_NAME = 'bittasker-wallet-session';
const STORE = 'keys';
const KEY_ID = 'mnemonic-key';
const CIPHER_KEY = 'bittasker.mnemonic.cipher';

export const SESSION_TTL_MS = 30 * 60 * 1000;

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

function openDb(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, 1);
		request.onupgradeneeded = () => {
			if (!request.result.objectStoreNames.contains(STORE)) {
				request.result.createObjectStore(STORE);
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error ?? new Error('session db failed'));
	});
}

async function readKey(): Promise<CryptoKey | null> {
	if (typeof indexedDB === 'undefined') return null;
	const db = await openDb();
	return new Promise((resolve, reject) => {
		const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY_ID);
		request.onsuccess = () => resolve((request.result as CryptoKey | undefined) ?? null);
		request.onerror = () => reject(request.error ?? new Error('session key read failed'));
	});
}

async function writeKey(key: CryptoKey): Promise<void> {
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(key, KEY_ID);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('session key write failed'));
	});
}

function readPack(): CipherPack | null {
	if (typeof sessionStorage === 'undefined') return null;
	const raw = sessionStorage.getItem(CIPHER_KEY);
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

function writePack(pack: CipherPack): void {
	sessionStorage.setItem(CIPHER_KEY, JSON.stringify(pack));
}

/** Encrypt the mnemonic with a non-extractable key. The key stays in IndexedDB. */
export async function saveMnemonicSession(mnemonic: string): Promise<void> {
	const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
		'encrypt',
		'decrypt'
	]);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const cipher = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new TextEncoder().encode(mnemonic)
	);
	await writeKey(key);
	writePack({
		iv: bytesToBase64(iv),
		data: bytesToBase64(new Uint8Array(cipher)),
		at: Date.now()
	});
}

/** Decrypt the session mnemonic. Returns null when the cache is missing or idle. */
export async function readMnemonicSession(now = Date.now()): Promise<string | null> {
	const pack = readPack();
	if (!pack || !sessionFresh(pack.at, now)) {
		if (pack) await clearMnemonicSession();
		return null;
	}
	const key = await readKey();
	if (!key) return null;
	const plain = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64ToBytes(pack.iv) },
		key,
		base64ToBytes(pack.data)
	);
	writePack({ ...pack, at: now });
	return new TextDecoder().decode(plain);
}

export async function clearMnemonicSession(): Promise<void> {
	if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(CIPHER_KEY);
	if (typeof indexedDB === 'undefined') return;
	const db = await openDb();
	await new Promise<void>((resolve, reject) => {
		const request = db.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY_ID);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error ?? new Error('session key delete failed'));
	});
}
