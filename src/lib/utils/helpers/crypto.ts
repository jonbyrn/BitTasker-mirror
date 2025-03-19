import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';

// Use a consistent salt for token-based encryption
const TOKEN_SALT = new Uint8Array([
	0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10
]);

export async function generateEncryptionKeyFromUserId(
	userId: string,
	salt: Uint8Array
): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(userId),
		{ name: 'PBKDF2' },
		false,
		['deriveKey']
	);

	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: salt,
			iterations: 100000,
			hash: 'SHA-256'
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
}

export async function exportKey(key: CryptoKey): Promise<string> {
	const exported = await crypto.subtle.exportKey('raw', key);
	return bytesToBase64(new Uint8Array(exported));
}

export async function importKey(keyData: string): Promise<CryptoKey> {
	const keyBytes = base64ToBytes(keyData);
	return await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);
}

export async function deriveKeyFromPassword(
	password: string,
	salt: Uint8Array
): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(password),
		'PBKDF2',
		false,
		['deriveKey']
	);

	return await crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt,
			iterations: 100000,
			hash: 'SHA-256'
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
}

export async function encrypt(
	data: string,
	key: CryptoKey
): Promise<{
	encrypted: string;
	iv: string;
}> {
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encryptedData = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv
		},
		key,
		encoder.encode(data)
	);

	return {
		encrypted: bytesToBase64(new Uint8Array(encryptedData)),
		iv: bytesToBase64(iv)
	};
}

export async function decrypt(encryptedData: string, iv: string, key: CryptoKey): Promise<string> {
	const decoder = new TextDecoder();
	const decrypted = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: base64ToBytes(iv)
		},
		key,
		base64ToBytes(encryptedData)
	);

	return decoder.decode(decrypted);
}
