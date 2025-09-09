import type { EncryptedData, MasterKeyEncryptedData } from '$lib/types/auth';
import { schnorr } from '@noble/curves/secp256k1';
import { utf8ToBytes, randomBytes } from '@noble/hashes/utils';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import {
	encrypt,
	decrypt,
	deriveKeyFromPassword,
	deriveContextKey,
	importKey,
	exportKey
} from '$lib/utils/helpers/crypto';
import { getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { DERIVATION_CONTEXTS } from '$lib/utils/consts';

export async function encryptNsec(
	nsec: string,
	password: string,
	iterations: number = 100000,
	_salt?: string
): Promise<{ encrypted: EncryptedData; salt: string; exportedKey: string; iterations: number }> {
	// Generate a random salt for recovery password
	const salt = _salt ? base64ToBytes(_salt) : randomBytes(16);

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
		const parsedData = JSON.parse(encryptedData);

		// Check if this is master key format
		if (parsedData.masterKeyData && isMasterKeyEncryptedData(parsedData.masterKeyData)) {
			// New master key format - decrypt using master key method
			const { nsec } = await decryptMasterKeyDataFromBiometrics(
				JSON.stringify(parsedData.masterKeyData),
				parsedData.key
			);
			return nsec;
		} else {
			// Legacy format - use existing decryption method
			const { key, iv, authTag, data, salt } = parsedData;

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
		}
	} catch (err) {
		throw new Error(
			'Failed to decrypt with biometrics: ' + (err instanceof Error ? err.message : 'Unknown error')
		);
	}
}

/**
 * Decrypt wallet mnemonic from biometric data
 * @param encryptedData Encrypted data from biometrics
 * @returns Promise<string> Decrypted wallet mnemonic
 */
export async function decryptWalletMnemonicWithBiometrics(encryptedData: string): Promise<string> {
	try {
		// Parse the stored encryption data
		const parsedData = JSON.parse(encryptedData);

		// Check if this is master key format
		if (parsedData.masterKeyData && isMasterKeyEncryptedData(parsedData.masterKeyData)) {
			// New master key format - decrypt using master key method
			const { mnemonic } = await decryptMasterKeyDataFromBiometrics(
				JSON.stringify(parsedData.masterKeyData),
				parsedData.key
			);
			return mnemonic;
		} else {
			// Legacy format - no wallet mnemonic available
			throw new Error('Wallet mnemonic not available in legacy format. Please migrate your account.');
		}
	} catch (err) {
		throw new Error(
			'Failed to decrypt wallet mnemonic with biometrics: ' + (err instanceof Error ? err.message : 'Unknown error')
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

export async function encryptRecoveryNsec(
	nsec: string,
	password: string,
	iterations: number = 100000,
	_salt?: string
): Promise<{ encrypted: string; exportedKey: string }> {
	// Generate a random salt for recovery password
	const salt = _salt ? base64ToBytes(_salt) : randomBytes(16);

	// Derive key from recovery password
	const derivedKey = await deriveKeyFromPassword(password, salt, iterations);

	// Encrypt with recovery password key
	const encryptedData = await encrypt(nsec, derivedKey);

	// Export the derived key
	const exportedKey = await exportKey(derivedKey);

	// Format: salt:iterations:iv:authTag:ciphertext (all base64 encoded except iterations)
	const encryptedString = [
		bytesToBase64(salt),
		iterations.toString(),
		encryptedData.iv,
		encryptedData.authTag,
		encryptedData.data
	].join(':');

	return {
		encrypted: encryptedString,
		exportedKey
	};
}

export async function decryptRecoveryNsec(
	encryptedString: string,
	password: string
): Promise<string> {
	try {
		// Parse the encrypted string format: salt:iterations:iv:authTag:ciphertext
		const parts = encryptedString.split(':');
		if (parts.length !== 5) {
			throw new Error('Invalid encrypted string format');
		}

		const [saltB64, iterationsStr, iv, authTag, data] = parts;

		// Convert back to proper types
		const salt = base64ToBytes(saltB64);
		const iterations = parseInt(iterationsStr);

		// Validate iterations
		if (isNaN(iterations) || iterations <= 0) {
			throw new Error('Invalid iterations value');
		}

		// Derive the same key from password
		const derivedKey = await deriveKeyFromPassword(password, salt, iterations);

		// Reconstruct the EncryptedData object
		const encryptedData = {
			data,
			iv,
			authTag
		};

		// Decrypt the nsec
		const decryptedNsec = await decrypt(encryptedData, derivedKey);

		return decryptedNsec;
	} catch (error) {
		throw new Error(`Failed to decrypt recovery nsec: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

/**
 * Encrypt both Nostr nsec and wallet mnemonic with a single master password using key derivation
 * @param nsec Nostr private key
 * @param mnemonic Wallet mnemonic phrase
 * @param masterPassword Master password (typically device ID)
 * @param iterations PBKDF2 iterations (default: 100000)
 * @returns Promise<MasterKeyEncryptedDataDto> Master key encrypted data structure
 */
export async function encryptMasterKeyData(
	nsec: string,
	mnemonic: string,
	masterPassword: string,
	iterations: number = 100000
): Promise<MasterKeyEncryptedData> {
	try {
		// Generate master salt
		const masterSalt = randomBytes(16);

		// Derive master key from password
		const masterKey = await deriveKeyFromPassword(masterPassword, masterSalt, iterations);

		// Generate separate salts for each context
		const nostrSalt = randomBytes(16);
		const walletSalt = randomBytes(16);

		// Derive context-specific keys
		const nostrKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.NOSTR, nostrSalt);
		const walletKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.WALLET, walletSalt);

		// Encrypt both pieces of data
		const [nostrEncrypted, walletEncrypted] = await Promise.all([
			encrypt(nsec, nostrKey),
			encrypt(mnemonic, walletKey)
		]);

		// Export master key for passkey storage
		const exportedMasterKey = await exportKey(masterKey);

		return {
			nostr: {
				encrypted: nostrEncrypted,
				salt: bytesToBase64(nostrSalt),
				iterations
			},
			wallet: {
				encrypted: walletEncrypted,
				salt: bytesToBase64(walletSalt),
				iterations
			},
			masterSalt: bytesToBase64(masterSalt),
			exportedMasterKey
		};
	} catch (err) {
		console.error('Failed to encrypt master key data:', err);
		throw new Error('Failed to encrypt master key data');
	}
}

/**
 * Decrypt Nostr nsec from master key encrypted data using master key
 * @param masterKeyData Master key encrypted data structure
 * @param exportedMasterKey Exported master key from passkey
 * @returns Promise<string> Decrypted Nostr nsec
 */
export async function decryptNostrFromMasterKey(
	masterKeyData: MasterKeyEncryptedData,
	exportedMasterKey: string
): Promise<string> {
	try {
		// Import master key
		const masterKey = await importKey(exportedMasterKey);

		// Derive Nostr-specific key
		const nostrSalt = base64ToBytes(masterKeyData.nostr.salt);
		const nostrKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.NOSTR, nostrSalt);

		// Decrypt Nostr nsec
		return await decrypt(masterKeyData.nostr.encrypted, nostrKey);
	} catch (err) {
		console.error('Failed to decrypt Nostr from master key data:', err);
		throw new Error('Failed to decrypt Nostr from master key data');
	}
}

/**
 * Decrypt wallet mnemonic from master key encrypted data using master key
 * @param masterKeyData Master key encrypted data structure
 * @param exportedMasterKey Exported master key from passkey
 * @returns Promise<string> Decrypted wallet mnemonic
 */
export async function decryptWalletFromMasterKey(
	masterKeyData: MasterKeyEncryptedData,
	exportedMasterKey: string
): Promise<string> {
	try {
		// Import master key
		const masterKey = await importKey(exportedMasterKey);

		// Derive wallet-specific key
		const walletSalt = base64ToBytes(masterKeyData.wallet.salt);
		const walletKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.WALLET, walletSalt);

		// Decrypt wallet mnemonic
		return await decrypt(masterKeyData.wallet.encrypted, walletKey);
	} catch (err) {
		console.error('Failed to decrypt wallet from master key data:', err);
		throw new Error('Failed to decrypt wallet from master key data');
	}
}

/**
 * Decrypt both Nostr nsec and wallet mnemonic from master key data
 * @param encryptedData JSON string of master key encrypted data or the object itself
 * @param exportedMasterKey Exported master key from passkey
 * @returns Promise<{nsec: string, mnemonic: string}> Both decrypted values
 */
export async function decryptMasterKeyDataFromBiometrics(
	encryptedData: string,
	exportedMasterKey: string
): Promise<{ nsec: string; mnemonic: string }> {
	try {
		// Parse master key data if it's a string, otherwise assume it's already parsed
		const masterKeyData: MasterKeyEncryptedData =
			typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;

		// Decrypt both in parallel for efficiency
		const [nsec, mnemonic] = await Promise.all([
			decryptNostrFromMasterKey(masterKeyData, exportedMasterKey),
			decryptWalletFromMasterKey(masterKeyData, exportedMasterKey)
		]);

		return { nsec, mnemonic };
	} catch (err) {
		console.error('Failed to decrypt master key data from biometrics:', err);
		throw new Error('Failed to decrypt master key data from biometrics');
	}
}

/**
 * Check if encrypted data is in the new master key format or legacy format
 * @param encryptedData Encrypted data to check
 * @returns boolean True if master key format, false if legacy
 */
export function isMasterKeyEncryptedData(encryptedData: any): encryptedData is MasterKeyEncryptedData {
	try {
		const data = typeof encryptedData === 'string' ? JSON.parse(encryptedData) : encryptedData;
		return (
			data &&
			typeof data === 'object' &&
			data.nostr &&
			data.wallet &&
			data.masterSalt &&
			data.exportedMasterKey &&
			data.nostr.encrypted &&
			data.wallet.encrypted
		);
	} catch {
		return false;
	}
}

/**
 * Migrate legacy nsec encryption to master key format by adding wallet mnemonic
 * @param mnemonic Wallet mnemonic to add
 * @param legacyBiometricData Legacy biometric data containing nsec encryption
 * @param deviceId Device identifier
 * @returns Promise<MasterKeyEncryptedDataDto> New master key encrypted data
 */
export async function migrateLegacyToMasterKey(
	mnemonic: string,
	legacyBiometricData: string,
	deviceId: string
): Promise<MasterKeyEncryptedData> {
	try {
		// Decrypt existing nsec
		const nsec = await decryptNsecWithBiometrics(legacyBiometricData);

		// Create new master key encryption with both nsec and mnemonic
		return await encryptMasterKeyData(nsec, mnemonic, deviceId);
	} catch (err) {
		console.error('Failed to migrate legacy data to master key format:', err);
		throw new Error('Failed to migrate legacy data to master key format');
	}
}
