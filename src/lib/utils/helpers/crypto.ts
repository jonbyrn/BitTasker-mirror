import type { EncryptedData } from '$lib/types/auth';
import { bytesToBase64, base64ToBytes } from './encoding';

export async function generateRandomKey(): Promise<CryptoKey> {
	return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
		'encrypt',
		'decrypt'
	]);
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

export async function encrypt(data: string, key: CryptoKey): Promise<EncryptedData> {
	const encoder = new TextEncoder();
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const dataBytes = encoder.encode(data);

	const encryptedData = await crypto.subtle.encrypt(
		{
			name: 'AES-GCM',
			iv: iv,
			tagLength: 128
		},
		key,
		dataBytes
	);

	// Split the encrypted data into ciphertext and auth tag
	const dataBytes2 = new Uint8Array(encryptedData.slice(0, -16));
	const authTagBytes = new Uint8Array(encryptedData.slice(-16));

	return {
		data: bytesToBase64(dataBytes2),
		iv: bytesToBase64(iv),
		authTag: bytesToBase64(authTagBytes)
	};
}

export async function decrypt(encryptedData: EncryptedData, key: CryptoKey): Promise<string> {
	const decoder = new TextDecoder();
	const dataBytes = base64ToBytes(encryptedData.data);
	const ivBytes = base64ToBytes(encryptedData.iv);
	const authTagBytes = base64ToBytes(encryptedData.authTag);

	// Combine ciphertext and auth tag
	const combinedBytes = new Uint8Array(dataBytes.length + authTagBytes.length);
	combinedBytes.set(dataBytes);
	combinedBytes.set(authTagBytes, dataBytes.length);

	const decryptedData = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: ivBytes,
			tagLength: 128
		},
		key,
		combinedBytes
	);

	return decoder.decode(decryptedData);
}

export async function deriveKeyFromPassword(
	password: string,
	salt: Uint8Array,
	iterations: number = 100000
): Promise<CryptoKey> {
	try {
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
				iterations,
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
