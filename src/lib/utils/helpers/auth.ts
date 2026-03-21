import type { EncryptedData, ContextEncryption } from '$lib/types/auth';
import { randomBytes } from '@noble/hashes/utils';
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
export async function decryptNsecWithBiometrics(
	encryptedData: EncryptedData,
	exportedKey: string
): Promise<string> {
	try {
		const { nsec } = await decryptMasterKeyDataFromBiometrics(encryptedData, exportedKey);
		return nsec;
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
export async function decryptWalletMnemonicWithBiometrics(
	encryptedData: EncryptedData,
	exportedKey: string
): Promise<string> {
	try {
		const { mnemonic } = await decryptMasterKeyDataFromBiometrics(encryptedData, exportedKey);
		return mnemonic;
	} catch (err) {
		throw new Error(
			'Failed to decrypt wallet mnemonic with biometrics: ' +
				(err instanceof Error ? err.message : 'Unknown error')
		);
	}
}

/**
 * Encrypt both Nostr nsec and wallet mnemonic with a single master password using key derivation
 * @param nsec Nostr private key
 * @param mnemonic Wallet mnemonic phrase
 * @param masterPassword Master password (typically nsec)
 * @param iterations PBKDF2 iterations (default: 100000)
 * @returns Promise<MasterKeyEncryptedDataDto> Master key encrypted data structure
 */
export async function encryptMasterKeyData(
	nsec: string,
	mnemonic: string,
	masterPassword: string,
	iterations: number = 100000
): Promise<{ encryptedData: EncryptedData; exportedKey: string }> {
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
			encryptedData: {
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
				masterSalt: bytesToBase64(masterSalt)
			},
			exportedKey: exportedMasterKey
		};
	} catch (err) {
		console.error('Failed to encrypt master key data:', err);
		throw new Error('Failed to encrypt master key data');
	}
}

/**
 * Decrypt Nostr nsec from master key encrypted data using master key
 * @param masterKeyData Master key encrypted data structure
 * @param exportedKey Exported master key from passkey
 * @returns Promise<string> Decrypted Nostr nsec
 */
export async function decryptNsecFromMasterKey(
	masterKeyData: EncryptedData,
	exportedKey: string
): Promise<string> {
	try {
		// Import master key
		const masterKey = await importKey(exportedKey);

		// Derive Nostr-specific key
		const nostrSalt = base64ToBytes(masterKeyData.nostr.salt);
		const nostrKey = await deriveContextKey(masterKey, DERIVATION_CONTEXTS.NOSTR, nostrSalt);

		// Decrypt Nostr nsec
		const nsec = await decrypt(masterKeyData.nostr.encrypted, nostrKey);

		return nsec;
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
	masterKeyData: EncryptedData,
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
	encryptedData: EncryptedData,
	exportedKey: string
): Promise<{ nsec: string; mnemonic: string }> {
	try {
		// Decrypt both in parallel for efficiency
		const [nsec, mnemonic] = await Promise.all([
			decryptNsecFromMasterKey(encryptedData, exportedKey),
			decryptWalletFromMasterKey(encryptedData, exportedKey)
		]);

		return { nsec, mnemonic };
	} catch (err) {
		console.error('Failed to decrypt master key data from biometrics:', err);
		throw new Error('Failed to decrypt master key data from biometrics');
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
