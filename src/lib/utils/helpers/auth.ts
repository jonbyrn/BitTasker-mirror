import type { EncryptedData } from '$lib/types/auth';
import { schnorr } from '@noble/curves/secp256k1';
import { utf8ToBytes, randomBytes } from '@noble/hashes/utils';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import {
	encrypt,
	decrypt,
	deriveKeyFromPassword,
	generateEncryptionKeyFromUserId,
	importKey,
	exportKey
} from '$lib/utils/helpers/crypto';

export async function encryptNostrPrivateKeyWithUserId(
	nostrPrivateKey: string,
	userId: string
): Promise<{ encrypted: EncryptedData; salt: string }> {
	// Generate a random salt
	const salt = randomBytes(16);

	// Generate encryption key from user ID and salt
	const userIdKey = await generateEncryptionKeyFromUserId(userId, salt);

	// Encrypt with user ID key
	const encrypted = await encrypt(nostrPrivateKey, userIdKey);

	return {
		encrypted,
		salt: bytesToBase64(salt)
	};
}

export async function encryptNostrPrivateKeyWithPassword(
	nsec: string,
	password: string
): Promise<{ encrypted: EncryptedData; salt: string; exportedKey: string }> {
	// Generate a random salt for recovery password
	const salt = randomBytes(16);

	// Derive key from recovery password
	const derivedKey = await deriveKeyFromPassword(password, salt);

	// Encrypt with recovery password key
	const encrypted = await encrypt(nsec, derivedKey);

	// Export the derived key
	const exportedKey = await exportKey(derivedKey);

	return {
		encrypted,
		salt: bytesToBase64(salt),
		exportedKey
	};
}

export async function decryptNostrPrivateKeyWithUserId(
	encryptedData: EncryptedData,
	userId: string,
	salt: string
): Promise<string> {
	try {
		// Generate encryption key from user ID
		const saltBytes = base64ToBytes(salt);
		const key = await generateEncryptionKeyFromUserId(userId, saltBytes);

		// Decrypt using the helper function
		return await decrypt(encryptedData, key);
	} catch (error) {
		console.log('Decryption error:', error);
		throw new Error('Failed to decrypt Nostr private key with user ID');
	}
}

export async function decryptPrivateKeyWithBiometrics(encryptedData: string): Promise<string> {
	try {
		// Parse the stored encryption data
		const { key, iv, authTag, data, salt } = JSON.parse(encryptedData);

		// Import the encryption key
		const encryptionKey = await importKey(key);

		// Decrypt private key using AES-GCM
		return await decrypt(
			{
				data,
				iv,
				authTag
			},
			encryptionKey
		);
	} catch (err) {
		throw new Error(
			'Failed to decrypt with biometrics: ' + (err instanceof Error ? err.message : 'Unknown error')
		);
	}
}

export async function decryptPrivateKeyWithPassword(
	encryptedPrivateKey: string,
	iv: string,
	authTag: string,
	password: string,
	salt: string,
	iterations: number
): Promise<string> {
	// Derive encryption key from password
	const saltBytes = base64ToBytes(salt);
	const encryptionKey = await deriveKeyFromPassword(password, saltBytes, iterations);

	// Decrypt private key using AES-GCM
	return await decrypt(
		{
			data: encryptedPrivateKey,
			iv,
			authTag
		},
		encryptionKey
	);
}

export async function generateLoginChallenge() {
	const array = randomBytes(32);
	const challenge = Array.from(array)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
	return {
		challenge,
		message: `Sign this message to login: ${challenge}`
	};
}

export async function signLoginChallenge(challenge: string, privateKey: string): Promise<string> {
	// Convert hex private key to Uint8Array
	const privateKeyBytes = new Uint8Array(
		privateKey.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
	);

	// Convert challenge to bytes
	const messageBytes = utf8ToBytes(challenge);

	// Sign challenge with Nostr private key using Schnorr signature
	const signature = schnorr.sign(messageBytes, privateKeyBytes);

	// Convert signature bytes to hex string
	return Array.from(signature)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
