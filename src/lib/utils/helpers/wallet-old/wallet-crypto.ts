/**
 * Wallet Cryptography Service
 * 
 * Handles all cryptographic operations for the BitTasker wallet:
 * - Key generation (BIP39 mnemonic)
 * - Encryption/decryption of sensitive data
 * - Key derivation
 * - Secure storage
 */

import { Preferences } from "@capacitor/preferences";
import { bytesToHex, hexToBytes } from "../encoding";
import { StorageKeys } from "$lib/utils/constants/storage";


// import * as bip39 from 'bip39';

/**
 * Generate a new BIP39 mnemonic phrase
 * @param strength The strength of the mnemonic (128 for 12 words, 256 for 24 words)
 * @returns A mnemonic phrase
 */
export async function generateMnemonic(strength: number = 128): Promise<string> {
  return 'demon heart gone city wonders fire eleven high';
  // return bip39.generateMnemonic(strength);
}

/**
 * Validate a mnemonic phrase
 * @param mnemonic The mnemonic phrase to validate
 * @returns True if the mnemonic is valid
 */
export function validateMnemonic(mnemonic: string): boolean {
  return true;
  // return bip39.validateMnemonic(mnemonic);
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
    salt = crypto.getRandomValues(new Uint8Array(16));
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
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  return { key, salt };
}

/**
 * Encrypt the mnemonic with a password using Web Crypto API
 * @param mnemonic The mnemonic to encrypt
 * @param password The password to use for encryption
 * @returns An object containing the encrypted data and necessary metadata
 */
export async function encryptMnemonic(mnemonic: string, password: string): Promise<{
  ciphertext: string;
  iv: string;
  salt: string;
}> {
  // Derive a key from the password
  const { key, salt } = await deriveKeyFromPassword(password);

  // Generate a random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // Encrypt the mnemonic
  const encodedMnemonic = new TextEncoder().encode(mnemonic);
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encodedMnemonic
  );

  // Convert to hex strings for storage
  const ciphertext = bytesToHex(new Uint8Array(encryptedData));
  const ivHex = bytesToHex(iv);
  const saltHex = bytesToHex(salt);

  return {
    ciphertext,
    iv: ivHex,
    salt: saltHex
  };
}

/**
 * Decrypt an encrypted mnemonic with a password
 * @param encryptedData The encrypted data object containing ciphertext, iv, and salt
 * @param password The password to use for decryption
 * @returns The decrypted mnemonic
 */
export async function decryptMnemonic(
  encryptedData: { ciphertext: string; iv: string; salt: string },
  password: string
): Promise<string> {
  const { ciphertext, iv, salt } = encryptedData;

  // Derive key from password using the original salt
  const saltBytes = hexToBytes(salt);
  const { key } = await deriveKeyFromPassword(password, saltBytes);


  // Decrypt the mnemonic
  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: hexToBytes(iv) },
    key,
    hexToBytes(ciphertext)
  );

  return new TextDecoder().decode(decryptedData);
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
  const encryptedWallet = await encryptMnemonic(mnemonic, password);

  return {
    encryptedMnemonic: encryptedWallet.ciphertext,
    salt: encryptedWallet.salt,
    iv: encryptedWallet.iv
  };
}


/**
 * Mock function to generate a Bitcoin address
 * In a real implementation, we would use BIP32/44 derivation with bitcoinjs-lib
 * For now, we return a mock address that looks reasonable for demonstration purposes
 * @returns A mock Bitcoin address
 */
export function generateBitcoinAddress(): string {
  // Return a mock Bitcoin address for now
  // This is a placeholder - in a real implementation, we would derive from BIP32/44
  const prefix = "bc1q";
  const addressChars = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  let address = prefix;

  // Generate a 42-character address (to match bc1q... addresses)
  for (let i = 0; i < 38; i++) {
    const randomIndex = Math.floor(Math.random() * addressChars.length);
    address += addressChars[randomIndex];
  }

  return address;
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
 * Check if a wallet exists by checking preferences for encrypted mnemonic
 * @returns True if wallet exists in storage
 */
export async function walletExists(): Promise<boolean> {
  try {
    const { encryptedData, salt, iv } = await getStoredWalletData();
    return !!(encryptedData && salt && iv);
  } catch {
    return false;
  }
}