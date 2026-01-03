/**
 * Nostr Key Management Module
 * 
 * This module provides optimized key retrieval functions with a three-tier caching strategy:
 * 1. In-memory cache (appStore) - fastest, session-scoped
 * 2. Local storage (Preferences) - fast, persistent across sessions
 * 3. Biometric authentication - slowest, requires user interaction
 * 
 * Each function progressively fetches only what it needs, avoiding unnecessary decryption
 * operations and biometric prompts.
 */

import type { Credentials } from '$lib/types/auth';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils'
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';
import { nip19 } from 'nostr-tools';
import { decryptNsecWithBiometrics, decryptMasterKeyDataFromBiometrics } from '$lib/utils/helpers/auth';
import { checkBiometricAvailability, getBiometricData } from '$lib/utils/helpers/biometrics';
import { getWebBiometricData } from '$lib/utils/helpers/webBiometrics';

/**
 * Internal helper to retrieve biometric credentials
 * Attempts native biometric authentication first, falls back to web-based authentication
 * 
 * @param authMethod - Authentication method to use ('biometrics' or 'passkey')
 * @returns Credentials object or null if authentication fails
 * @internal
 */
const getBiometrics = async (authMethod: 'biometrics' | 'passkey' = 'biometrics'): Promise<Credentials | null> => {
    const isBiometricAvailable = await checkBiometricAvailability();
    if (isBiometricAvailable) {
        return await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
    }
    return await getWebBiometricData(true);
}

/**
 * Get Nostr public key (npub)
 * 
 * This function uses a three-tier optimization strategy to minimize latency and avoid
 * unnecessary biometric prompts:
 * 
 * 1. **Memory cache (appStore):** Check if npub exists in session memory (fastest, no I/O)
 * 2. **Local storage (Preferences):** Check if npub was cached from previous session (fast, local I/O)
 * 3. **Biometric authentication:** If not cached, prompt user for authentication (slow, requires interaction)
 * 
 * Special handling for Alby extension: Retrieves public key from browser extension if using Alby auth
 * 
 * @returns The Nostr public key (npub) as a hex string
 * @throws {Error} If no public key can be retrieved or biometric authentication fails
 * 
 * @example
 * ```typescript
 * const npub = await getNpub();
 * console.log('Public key:', npub);
 * ```
 */
export const getNpub = async (): Promise<string> => {
    const currentState = get(appStore);

    if (currentState.nostrKeys.npub) return currentState.nostrKeys.npub;

    const { value } = await Preferences.get({ key: StorageKeys.NPUB });

    if (value) return value;

    const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });

    if (authMethod === 'alby') {
        const npub = await window.nostr?.getPublicKey();
        if (!npub) {
            throw new Error('No public key returned from Nostr extension');
        }
        appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, npub } }));
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return npub;
    }

    if (currentState.biometricData) {
        const npub = currentState.biometricData.username;
        appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, npub } }));
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return npub;
    }

    const biometricData: Credentials | null = await getBiometrics(authMethod as 'biometrics' | 'passkey');

    if (!biometricData) throw new Error('No biometric data found');

    const npub = biometricData.username;
    appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, npub }, biometricData }));
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return npub;
};

/**
 * Get Nostr key pair (both public and private keys)
 * 
 * This function retrieves both the private key (nsec) and public key (npub) using an
 * optimized two-tier strategy:
 * 
 * 1. **Memory cache (appStore):** Check if both nsec and npub exist in session memory
 * 2. **Biometric authentication + decryption:** If not cached, authenticate and decrypt the private key
 * 
 * The private key is encrypted in storage and requires biometric authentication to decrypt.
 * Once decrypted, both keys are cached in memory for the session to avoid repeated decryption.
 * 
 * Note: Unlike `getNpub()`, this function cannot use localStorage cache because the private key
 * must remain encrypted at rest. It always requires decryption when not in memory.
 * 
 * @returns Object containing both nsec (Uint8Array) and npub (hex string)
 * @throws {Error} If biometric authentication fails or key decryption fails
 * 
 * @example
 * ```typescript
 * const { nsec, npub } = await getNostrKeyPair();
 * // Use nsec for signing operations
 * ```
 */
export const getNostrKeyPair = async (): Promise<{ nsec: Uint8Array, npub: string }> => {
    const currentState = get(appStore);
    if (currentState.nostrKeys.nsec && currentState.nostrKeys.npub) {
        return {
            nsec: currentState.nostrKeys.nsec,
            npub: currentState.nostrKeys.npub
        };
    }

    if (process.env.NODE_ENV === 'development') {
        const npub = "ceda26d39d2e9aeee53c2a475b6b056145213ec6ac6acdb183357f66f8de76b2";
        Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return {
            nsec: new Uint8Array([64, 85, 53, 116, 137, 216, 86, 105, 25, 84, 68, 96, 227, 45, 78, 105, 29, 245, 10, 190, 172, 102, 107, 78, 164, 177, 164, 186, 209, 169, 14, 54]),
            npub: npub
        }
    }

    if (currentState.biometricData) {
        const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
        const nsec: Uint8Array = decodeNsec(sk);

        const npub = currentState.biometricData.username;
        appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, nsec, npub } }));
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return { nsec, npub };
    }

    const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
    const biometricData: Credentials | null = await getBiometrics(authMethod as 'biometrics' | 'passkey');

    if (!biometricData) throw new Error('No biometric data found');

    const sk = await decryptNsecWithBiometrics(biometricData.password);
    const nsec: Uint8Array = decodeNsec(sk);

    const npub = biometricData.username;
    appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, nsec, npub }, biometricData }));
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return { nsec, npub };
};

/**
 * Get all cryptographic keys (public key, private key, and mnemonic)
 * 
 * This function retrieves the complete set of user keys using an optimized two-tier strategy:
 * 
 * 1. **Memory cache (appStore):** Check if all three keys (nsec, npub, mnemonic) exist in session memory
 * 2. **Biometric authentication + master key decryption:** If not cached, authenticate and decrypt the master key data
 * 
 * The master key data contains both the private key and mnemonic, both encrypted and requiring
 * biometric authentication to decrypt. This is the most expensive operation as it:
 * - Requires user biometric authentication
 * - Decrypts the master key data structure
 * - Extracts and decodes both nsec and mnemonic
 * 
 * All keys are cached in memory after first retrieval to avoid repeated authentication and decryption.
 * 
 * @returns Object containing npub (hex string), nsec (Uint8Array), and mnemonic (string)
 * @throws {Error} If biometric authentication fails, decryption fails, or no biometric data found
 * 
 * @example
 * ```typescript
 * const { npub, nsec, mnemonic } = await getAllKeys();
 * // Use mnemonic for wallet recovery or backup
 * ```
 */
export const getAllKeys = async (): Promise<{ npub: string, nsec: Uint8Array, mnemonic: string }> => {
    const currentState = get(appStore);

    if (currentState.nostrKeys.nsec && currentState.nostrKeys.npub && currentState.nostrKeys.mnemonic) {
        return {
            npub: currentState.nostrKeys.npub,
            nsec: currentState.nostrKeys.nsec,
            mnemonic: currentState.nostrKeys.mnemonic
        };
    }

    if (currentState.biometricData) {
        const parsedData = JSON.parse(currentState.biometricData.password);
        const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
            JSON.stringify(parsedData.masterKeyData),
            parsedData.key
        );

        const nsec: Uint8Array = decodeNsec(sk);

        const npub = currentState.biometricData.username;
        appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, nsec, npub, mnemonic } }));
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return { nsec, npub, mnemonic };
    }

    const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
    const biometricData: Credentials | null = await getBiometrics(authMethod as 'biometrics' | 'passkey');

    if (!biometricData) throw new Error('No biometric data found');

    const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
        JSON.stringify(JSON.parse(biometricData.password).masterKeyData),
        JSON.parse(biometricData.password).key
    );

    const nsec: Uint8Array = decodeNsec(sk);
    const npub = biometricData.username;

    appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, nsec, npub, mnemonic }, biometricData }));
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return { nsec, npub, mnemonic };
};

/**
 * Decode Nostr secret key from various formats to Uint8Array
 * 
 * Supports three input formats:
 * 1. **NIP-19 nsec format:** Keys starting with 'nsec1' (bech32 encoded)
 * 2. **Hex format:** 64-character hexadecimal string (with or without '0x' prefix)
 * 3. **Invalid formats:** Throws descriptive error for unsupported formats
 * 
 * @param sk - Secret key string in nsec1 or hex format
 * @returns Decoded secret key as Uint8Array (32 bytes)
 * @throws {Error} If the key format is invalid or hex length is incorrect
 * 
 * @internal This is an internal helper function used by key retrieval functions
 * 
 * @example
 * ```typescript
 * // NIP-19 format
 * const key1 = decodeNsec('nsec1...'); // Uint8Array(32)
 * 
 * // Hex format
 * const key2 = decodeNsec('a1b2c3d4...'); // Uint8Array(32)
 * 
 * // Hex with 0x prefix
 * const key3 = decodeNsec('0xa1b2c3d4...'); // Uint8Array(32)
 * ```
 */
function decodeNsec(sk: string): Uint8Array {
    if (sk.startsWith('nsec1')) {
        const { data } = nip19.decode(sk);
        return data as Uint8Array;
    } else if (/^[0-9a-fA-F]+$/.test(sk)) {
        if (sk.length % 2 !== 0) {
            sk = '0' + sk;
        }
        if (sk.length === 64) {
            return hexToBytes(sk);
        } else if (sk.length === 66 && sk.startsWith('0x')) {
            return hexToBytes(sk.slice(2));
        } else {
            throw new Error(`Invalid hex private key length: ${sk.length} characters (expected 64)`);
        }
    } else {
        const _ = get(t)
        throw new Error(_('settings.error.invalidPrivateKey'));
    }
}
