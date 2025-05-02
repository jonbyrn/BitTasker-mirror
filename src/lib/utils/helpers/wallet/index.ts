/**
 * Wallet management utilities for handling cryptographic operations and key derivation
 * @module wallet
 */

import type { EncryptionData } from '$lib/types/auth';
import { bech32 } from '@scure/base';
import { browser } from '$app/environment';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';
import { Preferences } from '@capacitor/preferences';
import { wordlist } from '@scure/bip39/wordlists/english';
import { StorageKeys } from '$lib/utils/constants/storage';
import { base64ToBytes, bytesToBase64 } from '$lib/utils/helpers/encoding';
import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
import { setWebBiometricKey, checkWebBiometricAvailability } from '$lib/utils/helpers/webBiometrics';
import { deriveKeyFromPassword, encrypt, decrypt, exportKey, importKey } from '$lib/utils/helpers/crypto';
import * as bip39 from '@scure/bip39';
import * as bip32 from '@scure/bip32';
import walletService from '$lib/api/services/wallet.service';

/**
 * Converts a public key to a P2WPKH (native segwit) address
 * @param pubkey - The public key as Uint8Array
 * @param isTestnet - Whether to generate testnet address
 * @returns The bech32 encoded address
 */
function pubKeyToAddress(pubkey: Uint8Array, isTestnet: boolean = true): string {
    // 1. SHA256 of the public key
    const sha256Hash = sha256(pubkey);

    // 2. RIPEMD160 of the SHA256
    const pubKeyHash = ripemd160(sha256Hash);

    // 3. Encode with bech32
    const words = bech32.toWords(pubKeyHash);
    const prefix = isTestnet ? 'tb' : 'bc';

    // 4. Return the encoded address
    return bech32.encode(prefix, [0, ...words]); // 0 is the witness version for P2WPKH
}

/**
 * Generates a new BIP39 mnemonic phrase using the English wordlist
 * @returns {string} A 12 or 24-word mnemonic phrase
 */
export function generateMnemonic() {
    const mnemonic = bip39.generateMnemonic(wordlist, 128);
    return mnemonic;
}

/** 
 * Validates a BIP39 mnemonic phrase
 * @param {string} mnemonic - The mnemonic phrase to validate
 * @returns {boolean} True if the mnemonic is valid, false otherwise
 */
export function validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
}

/**
 * Derives multiple addresses from a mnemonic phrase using BIP32/BIP44 derivation paths
 * @param {string} mnemonic - The mnemonic phrase to derive addresses from
 * @returns {Address[]} Array of derived addresses with their metadata
 */
export function deriveAddresses(mnemonic: string): Address[] {
    const seed = bip39.mnemonicToSeedSync(mnemonic, '');
    const root = bip32.HDKey.fromMasterSeed(seed);
    const addresses: Address[] = [];
    const isTestnet = true; // Use testnet for development

    // Derive receive addresses
    for (let i = 0; i < 5; i++) {
        const path = `m/84'/0'/0'/0/${i}`; // BIP84 for native segwit
        const child = root.derive(path);
        if (child.publicKey) {
            const address = pubKeyToAddress(child.publicKey, isTestnet);
            addresses.push({
                address,
                publicKey: bytesToBase64(child.publicKey),
                label: i === 0 ? "Main receive address" : `Receive address ${i + 1}`,
                path,
                type: "P2WPKH",
                isChange: false
            });
        }
    }

    // Derive change addresses
    for (let i = 0; i < 5; i++) {
        const path = `m/84'/0'/0'/1/${i}`; // BIP84 change addresses
        const child = root.derive(path);
        if (child.publicKey) {
            const address = pubKeyToAddress(child.publicKey, isTestnet);
            addresses.push({
                address,
                publicKey: bytesToBase64(child.publicKey),
                label: `Change address ${i + 1}`,
                path,
                type: "P2WPKH",
                isChange: true
            });
        }
    }

    return addresses;
}

/* export function deriveAddresses(mnemonic: string) {
    const seed = bip39.mnemonicToSeedSync(mnemonic, '');
    const root = bip32.HDKey.fromMasterSeed(seed);
    const addresses = [];
    for (let i = 0; i < 5; i++) {
        const path = `m/44'/1'/0'/0/${i}`;
        const child = root.derive(path);
        if (child.publicKey) {
            addresses.push(Array.from(child.publicKey).map(b => b.toString(16).padStart(2, '0')).join(''));
        }
    }
    return addresses;
} */

// Constants for crypto operations
/** Number of iterations for PBKDF2 key derivation */
const PBKDF2_ITERATIONS = 100000;
/** Length of AES key in bits */
const AES_KEY_LENGTH = 256;
/** Length of salt in bytes */
const SALT_LENGTH = 16;
/** Length of initialization vector in bytes */
const IV_LENGTH = 12;
/** Character encoding for text operations */
const ENCODING = 'utf-8';
/** Length of authentication tag in bits */
const TAG_LENGTH = 128;

/**
 * Encrypts a mnemonic phrase using the provided password
 * @param {string} mnemonic - The mnemonic phrase to encrypt
 * @param {string} password - The password to use for encryption
 * @returns {Promise<EncryptionData>} The encrypted data with all required fields
 */
export async function encryptMnemonic(mnemonic: string, password: string): Promise<EncryptionData> {
    // Generate a random salt
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

    // Use the centralized function to derive the key
    const key = await deriveKeyFromPassword(password, salt, PBKDF2_ITERATIONS);

    // Use the centralized function to encrypt the data
    const encryptedData = await encrypt(mnemonic, key);

    // Get the salt as base64
    const saltBase64 = bytesToBase64(salt);

    // Export the key for storage (the key is now extractable)
    const exportedKey = await exportKey(key);

    return {
        key: exportedKey,
        iv: encryptedData.iv,
        authTag: encryptedData.authTag,
        data: encryptedData.data,
        salt: saltBase64
    };
}

/**
 * Decrypts an encrypted mnemonic phrase using the provided password
 * @param {EncryptionData} encrypted - The encrypted mnemonic data
 * @param {string} password - The password used for encryption
 * @returns {Promise<string>} The decrypted mnemonic phrase
 * @throws {Error} If decryption fails or the password is incorrect
 */
export async function decryptMnemonic(encrypted: EncryptionData, password: string): Promise<string> {
    try {
        // If we have a stored key, use it instead of deriving a new one
        let key: CryptoKey;
        if (encrypted.key) {
            // Import the stored key
            key = await importKey(encrypted.key);
        } else {
            // Derive the key from password and salt
            const salt = base64ToBytes(encrypted.salt);
            key = await deriveKeyFromPassword(password, salt, PBKDF2_ITERATIONS);
        }

        // Use the centralized function to decrypt the data
        return await decrypt({
            data: encrypted.data,
            iv: encrypted.iv,
            authTag: encrypted.authTag
        }, key);
    } catch (error) {
        console.error('Failed to decrypt mnemonic:', error);
        throw new Error('Invalid password or corrupted data');
    }
}

/**
 * Initializes a new wallet with the provided password and storage preference
 * @param {string} password - The password to encrypt the wallet
 * @param {'self' | 'service'} storagePreference - How to store the mnemonic:
 *        - 'self': User stores the mnemonic themselves
 *        - 'service': Service stores the encrypted mnemonic
 * @returns {Promise<{success: boolean, mnemonic?: string}>} Object containing:
 *         - success: Whether initialization was successful
 *         - mnemonic: The mnemonic phrase (only if storagePreference is 'self')
 */
export async function createWallet(password: string, storagePreference: 'self' | 'service'): Promise<{ success: boolean, mnemonic?: string }> {
    try {
        // Generate a new mnemonic for the wallet
        const mnemonic = generateMnemonic();
        // Generate addresses after encryption is complete
        const addresses = deriveAddresses(mnemonic);

        if (storagePreference === 'service') {
            // Encrypt the mnemonic
            const encryptedData = await encryptMnemonic(mnemonic, password);

            // Format the encrypted data for storage
            const encryptedMnemonic = JSON.stringify({
                data: encryptedData.data,
                iv: encryptedData.iv,
                authTag: encryptedData.authTag,
                salt: encryptedData.salt
            });

            // Check if biometric auth is available
            const mobileBiometricsAvailable = await checkBiometricAvailability();
            if (mobileBiometricsAvailable) {
                // Store the encrypted mnemonic with biometrics - this is the common factor for all addresses
                await setBiometricKey('wallet-mnemonic', encryptedData);
            } else {
                const webBiometricsAvailable = await checkWebBiometricAvailability();
                if (webBiometricsAvailable) {
                    await setWebBiometricKey('wallet-mnemonic', encryptedData, 'wallet');
                }
            }

            // Setup the wallet with the API
            await walletService.createWallet({
                encryptedMnemonic,
                addresses
            });
        } else {
            await walletService.createWallet({
                addresses
            });
        }


        // Store the user's preference
        if (browser) {
            await Preferences.set({ key: StorageKeys.WALLET_STORAGE_PREFERENCE, value: storagePreference });
        }

        // If user chose to store mnemonic themselves, return it
        return {
            success: true,
            ...(storagePreference === 'self' ? { mnemonic } : {})
        };
    } catch (error) {
        console.error('Failed to initialize wallet:', error);
        return { success: false };
    }
}

/**
 * Derives a keypair (private and public key) from a mnemonic phrase
 * @param {string} mnemonic - The mnemonic phrase to derive the keypair from
 * @param {number} [index=0] - The index of the keypair to derive
 * @returns {{privateKey: Uint8Array, publicKey: Uint8Array, path: string}} The derived keypair and its derivation path
 * @throws {Error} If keypair derivation fails
 */
export function deriveWalletKeypair(mnemonic: string, index: number = 0) {
    const seed = bip39.mnemonicToSeedSync(mnemonic, '');
    const root = bip32.HDKey.fromMasterSeed(seed);
    const path = `m/44'/1'/0'/0/${index}`;
    const child = root.derive(path);

    if (!child.privateKey || !child.publicKey) {
        throw new Error('Failed to derive keypair');
    }

    return {
        privateKey: child.privateKey,
        publicKey: child.publicKey,
        path
    };
}
