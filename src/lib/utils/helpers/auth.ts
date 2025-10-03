import type { MasterKeyEncryptedData, ContextEncryption } from '$lib/types/auth';
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
import { DERIVATION_CONTEXTS } from '$lib/utils/consts';

/**
 * Decrypt Nostr private key from biometric data
 * @param encryptedData Encrypted data string from biometrics
 * @returns Promise<string> Decrypted Nostr private key
 */
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
 * @param encryptedData Encrypted data string from biometrics
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

/**
 * Sign login challenge with Nostr private key
 * @param challenge Login challenge
 * @param privateKey Nostr private key
 * @returns Promise<string> Signed challenge
 */
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
export async function decryptNsecFromMasterKey(
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
			decryptNsecFromMasterKey(masterKeyData, exportedMasterKey),
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
 * Decrypt both Nostr nsec and wallet mnemonic from master key data using password
 * @param recoveryData Recovery data containing nostr and wallet encrypted contexts plus master salt
 * @param password Recovery password
 * @returns Promise<{nsec: string, mnemonic: string}> Both decrypted values
 */
export async function decryptMasterKeyWithPassword(
	recoveryData: { nostr: ContextEncryption; wallet: ContextEncryption; masterSalt: string },
	password: string
): Promise<{ nsec: string; mnemonic: string }> {
	try {
		// Get master salt and iterations from nostr context (they should be the same)
		const masterSalt = base64ToBytes(recoveryData.masterSalt);
		const iterations = recoveryData.nostr.iterations;

		// Validate iterations
		if (isNaN(iterations) || iterations <= 0) {
			throw new Error('Invalid iterations value');
		}

		// Derive master key from password and master salt
		const masterKey = await deriveKeyFromPassword(password, masterSalt, iterations);

		// Get context salts
		const nostrSalt = base64ToBytes(recoveryData.nostr.salt);
		const walletSalt = base64ToBytes(recoveryData.wallet.salt);

		// Derive context-specific keys using the same method as encryption
		const nostrKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.NOSTR, nostrSalt);
		const walletKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.WALLET, walletSalt);

		// Decrypt both pieces of data in parallel
		const [nsec, mnemonic] = await Promise.all([
			decrypt(recoveryData.nostr.encrypted, nostrKey),
			decrypt(recoveryData.wallet.encrypted, walletKey)
		]);

		return { nsec, mnemonic };
	} catch (error) {
		console.error('Failed to decrypt master key with password:', error);
		throw new Error(`Failed to decrypt master key with password`);
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
