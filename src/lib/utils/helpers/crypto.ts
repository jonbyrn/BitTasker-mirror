import type { CryptoEncryptedData } from '$lib/types/auth';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist as englishWordlist } from '@scure/bip39/wordlists/english.js';
import { bytesToBase64, base64ToBytes } from './encoding';

/**
 * Safely converts a Uint8Array (potentially backed by ArrayBufferLike/SharedArrayBuffer
 * depending on runtime + TS lib.dom) into a BufferSource that satisfies the strict
 * overloads on crypto.subtle.* methods.
 *
 * This is the single source of truth for the WebCrypto typing issues.
 */
function toBufferSource(u8: Uint8Array): BufferSource {
	// Always copy into a fresh Uint8Array so TS sees Uint8Array<ArrayBuffer>,
	// which is assignable to BufferSource.  The original may be backed by
	// ArrayBufferLike (SharedArrayBuffer / detached) which breaks the overload.
	return new Uint8Array(u8);
}

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
	return await crypto.subtle.importKey(
		'raw',
		toBufferSource(keyBytes),
		{ name: 'AES-GCM', length: 256 },
		true,
		['encrypt', 'decrypt']
	);
}

export async function encrypt(data: string, key: CryptoKey): Promise<CryptoEncryptedData> {
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
		toBufferSource(dataBytes)
	);

	// Split the encrypted data into ciphertext and auth tag
	const ciphertextBytes = new Uint8Array(encryptedData.slice(0, -16));
	const authTagBytes = new Uint8Array(encryptedData.slice(-16));

	return {
		data: bytesToBase64(ciphertextBytes),
		iv: bytesToBase64(iv),
		authTag: bytesToBase64(authTagBytes)
	};
}

export async function decrypt(encryptedData: CryptoEncryptedData, key: CryptoKey): Promise<string> {
	const decoder = new TextDecoder();
	const dataBytes = base64ToBytes(encryptedData.data);
	const ivBytes = base64ToBytes(encryptedData.iv);
	const authTagBytes = base64ToBytes(encryptedData.authTag);

	// Combine ciphertext and auth tag
	const combinedBytes = new Uint8Array(dataBytes.length + authTagBytes.length);
	combinedBytes.set(dataBytes);
	combinedBytes.set(authTagBytes, dataBytes.length);

	// Create a proper ArrayBuffer for the iv
	const ivBuffer = toBufferSource(ivBytes);

	const decryptedData = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv: ivBuffer,
			tagLength: 128
		},
		key,
		toBufferSource(combinedBytes)
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
			toBufferSource(encoder.encode(password)),
			'PBKDF2',
			false,
			['deriveKey']
		);

		// Create a proper ArrayBuffer for the salt
		const saltBuffer = toBufferSource(salt);

		return await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: saltBuffer,
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

/**
 * Derive a context-specific key from a master key using HKDF
 * @param masterKey The master key to derive from
 * @param context Context string to ensure unique keys per purpose
 * @param salt Salt for additional entropy
 * @returns Promise<CryptoKey> Context-specific encryption key
 */
export async function deriveContextKey(
	masterKey: CryptoKey,
	context: string,
	salt: Uint8Array
): Promise<CryptoKey> {
	try {
		const encoder = new TextEncoder();
		const contextBytes = encoder.encode(context);

		// Combine context and salt for unique derivation
		const combinedSalt = new Uint8Array(contextBytes.length + salt.length);
		combinedSalt.set(contextBytes);
		combinedSalt.set(salt, contextBytes.length);

		// Export master key to use as key material
		const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

		// Import as HKDF key material
		const keyMaterial = await crypto.subtle.importKey('raw', masterKeyBytes, 'HKDF', false, [
			'deriveKey'
		]);

		// Derive context-specific key using HKDF
		return await crypto.subtle.deriveKey(
			{
				name: 'HKDF',
				hash: 'SHA-256',
				salt: combinedSalt,
				info: new Uint8Array() // No additional info needed
			},
			keyMaterial,
			{ name: 'AES-GCM', length: 256 },
			true,
			['encrypt', 'decrypt']
		);
	} catch (err) {
		console.error('Failed to derive context key:', err);
		throw new Error('Failed to derive context key');
	}
}

export const SATS_PER_BTC = 100_000_000;

export function satsFromUsd(usd: number, btcPrice: number): string {
	if (!usd || !btcPrice) return '0 Sats';

	const btcAmount = usd / btcPrice;

	const sats = BigInt(Math.round(btcAmount * SATS_PER_BTC));

	return `${sats.toLocaleString('en-US')} Sats`;
}
export function usdFromSats(sats: number, price: number) {
	const value = (sats / SATS_PER_BTC) * price;
	return parseFloat(value.toFixed(3));
}

export function formatNumberForInput(value: number | undefined): string {
	if (value == null || isNaN(value)) return '';
	return value.toLocaleString('en-US', {
		minimumFractionDigits: 0,
		maximumFractionDigits: 2
	});
}

export async function deriveWalletFromNostr(nsec: string): Promise<string> {
	// Use the nsec as entropy to deterministically generate mnemonic
	const hash = await crypto.subtle.digest(
		'SHA-256',
		toBufferSource(new TextEncoder().encode(nsec))
	);
	const entropy = new Uint8Array(hash).slice(0, 16); // 128 bits = 12 word mnemonic

	return entropyToMnemonic(entropy, englishWordlist);
}
