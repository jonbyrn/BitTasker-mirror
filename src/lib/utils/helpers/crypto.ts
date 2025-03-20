import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';

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
	try {
	const encoder = new TextEncoder();
	console.log(crypto.subtle);
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
	} catch (err) {
		console.error('Failed to derive key from password:', err);
		throw new Error('Failed to derive key from password');
	}
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
