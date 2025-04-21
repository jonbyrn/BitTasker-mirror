/**
 * Wallet management utilities for handling cryptographic operations and key derivation
 * @module wallet
 */

import { base64ToBuffer, base64ToBytes, bufferToBase64 } from '$lib/utils/helpers/encoding';
import { wordlist } from '@scure/bip39/wordlists/english';
import { browser } from '$app/environment';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { checkBiometricAvailability } from '$lib/utils/helpers/biometrics';
import * as bip39 from '@scure/bip39';
import * as bip32 from '@scure/bip32';

/**
 * Generates a new BIP39 mnemonic phrase using the English wordlist
 * @returns {string} A 12 or 24-word mnemonic phrase
 */
export function generateMnemonic() {
    const mnemonic = bip39.generateMnemonic(wordlist, 256);
    return mnemonic;
}

/**
 * Derives multiple addresses from a mnemonic phrase using BIP32/BIP44 derivation paths
 * @param {string} mnemonic - The mnemonic phrase to derive addresses from
 * @returns {string[]} Array of derived public addresses
 */
export function deriveAddresses(mnemonic: string) {
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
}

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
 * Derives a cryptographic key from a password using PBKDF2
 * @param {string} password - The password to derive the key from
 * @param {Uint8Array} [salt] - Optional salt for key derivation. If not provided, a random salt will be generated
 * @returns {Promise<{key: CryptoKey, salt: Uint8Array}>} The derived key and salt used
 */
export async function deriveKeyFromPassword(
    password: string,
    salt?: Uint8Array
): Promise<{ key: CryptoKey; salt: Uint8Array }> {
    // Generate a random salt if not provided
    if (!salt) {
        salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    }

    // Convert password to key material
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
    );

    // Derive the key using PBKDF2
    const key = await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: AES_KEY_LENGTH },
        false,
        ['encrypt', 'decrypt']
    );

    return { key, salt };
}

/**
 * Encrypts a mnemonic phrase using AES-GCM with a password-derived key
 * @param {string} mnemonic - The mnemonic phrase to encrypt
 * @param {string} password - The password to use for encryption
 * @returns {Promise<string>} Base64 encoded string containing salt + IV + encrypted data
 */
export async function encryptMnemonic(mnemonic: string, password: string) {
    const { key, salt } = await deriveKeyFromPassword(password);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(mnemonic);

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: TAG_LENGTH
        },
        key,
        dataBuffer
    );

    // Combine salt + IV + encrypted data
    const result = new Uint8Array(salt.length + iv.length + encryptedBuffer.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encryptedBuffer), salt.length + iv.length);

    return bufferToBase64(result);
}

/**
 * Decrypts an encrypted mnemonic phrase using the provided password
 * @param {string} encrypted - The encrypted mnemonic (base64 encoded)
 * @param {string} password - The password used for encryption
 * @returns {Promise<string>} The decrypted mnemonic phrase
 * @throws {Error} If decryption fails or the password is incorrect
 */
export async function decryptMnemonic(encrypted: string, password: string) {
    const encryptedBuffer = base64ToBuffer(encrypted);
    
    // Extract salt, IV, and encrypted data
    const salt = encryptedBuffer.slice(0, SALT_LENGTH);
    const iv = encryptedBuffer.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const encryptedData = encryptedBuffer.slice(SALT_LENGTH + IV_LENGTH);

    const { key } = await deriveKeyFromPassword(password, salt);

    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: iv,
            tagLength: TAG_LENGTH
        },
        key,
        encryptedData
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
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
export async function initializeWallet(password: string, storagePreference: 'self' | 'service'): Promise<{ success: boolean, mnemonic?: string }> {
    try {
        // Generate a new mnemonic for the wallet
        const mnemonic = generateMnemonic();
        console.log('mnemonic', mnemonic);
        const addresses = deriveAddresses(mnemonic);
        console.log('addresses', addresses);

        // Store the user's preference
        if (browser) {
            Preferences.set({ key: StorageKeys.WALLET_STORAGE_PREFERENCE, value: storagePreference });
        }

        if (storagePreference === 'service') {
            // Encrypt the mnemonic with the password
            const encryptedData = await encryptMnemonic(mnemonic, password);
            console.log('encryptedData', encryptedData);

            // TODO: Implement biometric auth
            // Check if biometric auth is available
            // const biometricsAvailable = await checkBiometricAvailability();
            // if (biometricsAvailable) {
            //     // Store password with biometrics
            // } else {
            //     // Store via API with E2E encryption
            // }
        }

        // TODO: Set up the wallet with the API
        // await walletService.getOrCreateWallet();
        // TODO: Generate an initial address
        // const newAddress = await walletService.generateNewAddress();

        // TODO: Load initial balance and transactions
        // await walletStore.refreshWallet();

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
