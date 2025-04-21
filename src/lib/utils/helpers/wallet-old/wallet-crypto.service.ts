/**
 * Wallet Cryptography Service
 * 
 * Handles all cryptographic operations for the BitTasker wallet:
 * - Key generation (BIP39 mnemonic)
 * - Encryption/decryption of sensitive data
 * - Key derivation
 * - Secure storage
 */

import { StorageKeys } from "$lib/utils/constants/storage";
import { Preferences } from "@capacitor/preferences";

// Constants for crypto operations
const PBKDF2_ITERATIONS = 100000;
const AES_KEY_LENGTH = 256;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const ENCODING = 'utf-8';

/**
 * Generate a random mnemonic phrase (12 or 24 words)
 * In a real implementation, this would use BIP39
 */
export async function generateMnemonic(wordCount: 12 | 24 = 12): Promise<string> {
    // This is a placeholder. In a real implementation, this would use:
    // 1. Generate random entropy using Web Crypto API
    // 2. Convert to BIP39 mnemonic using a BIP39 library
    return 'test word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';
}

/**
 * Derive a key from a password using PBKDF2
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
 * Encrypt sensitive data (e.g., private keys, mnemonics)
 */
export async function encryptData(
    data: string,
    password: string
): Promise<{ encryptedData: string; salt: string; iv: string }> {
    // Derive key from password
    const { key, salt } = await deriveKeyFromPassword(password);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt the data
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    const encryptedBuffer = await crypto.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv
        },
        key,
        dataBuffer
    );

    // Convert to base64 for storage
    const encryptedData = bufferToBase64(encryptedBuffer);
    const saltBase64 = bufferToBase64(salt);
    const ivBase64 = bufferToBase64(iv);

    return {
        encryptedData,
        salt: saltBase64,
        iv: ivBase64
    };
}

/**
 * Decrypt sensitive data
 */
export async function decryptData(
    encryptedData: string,
    password: string,
    salt: string,
    iv: string
): Promise<string> {
    // Convert from base64
    const encryptedBuffer = base64ToBuffer(encryptedData);
    const saltBuffer = base64ToBuffer(salt);
    const ivBuffer = base64ToBuffer(iv);

    // Derive key from password using the original salt
    const { key } = await deriveKeyFromPassword(password, saltBuffer);

    // Decrypt the data
    const decryptedBuffer = await crypto.subtle.decrypt(
        {
            name: 'AES-GCM',
            iv: ivBuffer
        },
        key,
        encryptedBuffer
    );

    // Convert back to string
    const decoder = new TextDecoder(ENCODING);
    return decoder.decode(decryptedBuffer);
}

/**
 * Create a new wallet with encrypted keys
 */
export async function createWallet(password: string): Promise<{
    encryptedMnemonic: string;
    salt: string;
    iv: string;
}> {
    // Generate mnemonic
    const mnemonic = await generateMnemonic();

    // Encrypt the mnemonic with the password
    const encryptedWallet = await encryptData(mnemonic, password);

    return {
        encryptedMnemonic: encryptedWallet.encryptedData,
        salt: encryptedWallet.salt,
        iv: encryptedWallet.iv
    };
}

/**
 * Helper: Convert ArrayBuffer to Base64 string
 */
function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

/**
 * Helper: Convert Base64 string to ArrayBuffer
 */
function base64ToBuffer(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

/**
 * Store encrypted wallet data securely
 */
export function storeWalletData(encryptedData: string, salt: string, iv: string): void {
    try {
        Preferences.set({ key: StorageKeys.WALLET_ENCRYPTED, value: encryptedData });
        Preferences.set({ key: StorageKeys.WALLET_SALT, value: salt });
        Preferences.set({ key: StorageKeys.WALLET_IV, value: iv });
    } catch (error) {
        console.error('Failed to store wallet data:', error);
        throw new Error('Failed to store wallet data');
    }
}

/**
 * Retrieve stored wallet data
 */
export async function getStoredWalletData(): Promise<{
    encryptedData: string | null;
    salt: string | null;
    iv: string | null;
}> {
    try {
        const { value: encryptedData } = await Preferences.get({ key: StorageKeys.WALLET_ENCRYPTED });
        const { value: salt } = await Preferences.get({ key: StorageKeys.WALLET_SALT });
        const { value: iv } = await Preferences.get({ key: StorageKeys.WALLET_IV });

        return {
            encryptedData,
            salt,
            iv
        };
    } catch (error) {
        console.error('Failed to retrieve wallet data:', error);
        return { encryptedData: null, salt: null, iv: null };
    }
}

/**
 * Check if wallet exists in storage
 */
export async function walletExists(): Promise<boolean> {
    try {
        const { encryptedData, salt, iv } = await getStoredWalletData();
        return !!(encryptedData && salt && iv);
    } catch {
        return false;
    }
} 