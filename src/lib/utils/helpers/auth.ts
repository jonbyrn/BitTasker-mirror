import type { EncryptedData } from '$lib/types/auth';
import { schnorr } from '@noble/curves/secp256k1';
import { utf8ToBytes, randomBytes } from '@noble/hashes/utils';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import {
	encrypt,
	decrypt,
	deriveKeyFromPassword,
	importKey,
	exportKey
} from '$lib/utils/helpers/crypto';
import { getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';

export async function encryptNsec(
	nsec: string,
	password: string,
	iterations: number = 100000
): Promise<{ encrypted: EncryptedData; salt: string; exportedKey: string; iterations: number }> {
	// Generate a random salt for recovery password
	const salt = randomBytes(16);

	// Derive key from recovery password
	const derivedKey = await deriveKeyFromPassword(password, salt, iterations);

	// Encrypt with recovery password key
	const encrypted = await encrypt(nsec, derivedKey);

	// Export the derived key
	const exportedKey = await exportKey(derivedKey);

	return {
		encrypted,
		salt: bytesToBase64(salt),
		exportedKey,
		iterations
	};
}

export async function decryptNsecWithBiometrics(encryptedData: string): Promise<string> {
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

export async function decryptNsecWithPassword({
	encryptedPrivateKey,
	iv,
	authTag,
	password,
	salt,
	iterations
}: {
	encryptedPrivateKey: string;
	iv: string;
	authTag: string;
	password: string;
	salt: string;
	iterations: number;
}): Promise<string> {
	try {
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
	} catch (err) {
		throw new Error(
			'Failed to decrypt with password: ' + (err instanceof Error ? err.message : 'Unknown error')
		);
	}
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

// TODO: ADD TESTS
/**
 * Get the npub from an encoded nsec
 * When the nsec is encoded, it's in bech32 format (nsec1...), so we need to decode it first
 * @param encodedNsec 
 * @returns 
 */
export function getNpubFromEncodedNsec(encodedNsec: string): string {
	// Decode the nsec
	const { data: privateKeyHex } = nip19.decode(encodedNsec);

	// Convert hex to bytes and then get public key
	const publicKeyHex = getPublicKey(privateKeyHex as Uint8Array);

	// Encode as npub
	const encodedNpub = nip19.npubEncode(publicKeyHex);

	return encodedNpub;
}
