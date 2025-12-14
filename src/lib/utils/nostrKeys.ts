import type { Credentials } from '$lib/types/auth';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils'
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';
import { nip19 } from 'nostr-tools';
import { decryptNsecWithBiometrics, decryptMasterKeyDataFromBiometrics } from '$lib/utils/helpers/auth';

export const getNpub = async (): Promise<string> => {
    const { value } = await Preferences.get({ key: StorageKeys.NPUB });

    if (value) return value;

    const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });

    if (authMethod === 'alby') {
        const npub = await window.nostr?.getPublicKey();
        if (!npub) {
            throw new Error('No public key returned from Nostr extension');
        }
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return npub;
    }

    const currentState = get(appStore);

    // Validate cached biometricData before using it
    if (currentState.biometricData) {
        try {
            // Check if we have a stored NPUB to validate against
            const { value: storedNpub } = await Preferences.get({ key: StorageKeys.NPUB });
            
            // If no stored NPUB, user might not be logged in - clear cache and prompt
            if (!storedNpub) {
                const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
                if (!token) {
                    // No token and no stored NPUB - clear cache and prompt
                    appStore.update((state) => ({ ...state, biometricData: null }));
                } else {
                    // Token exists but no stored NPUB - use cached data
                    const npub = currentState.biometricData.username;
                    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
                    return npub;
                }
            } else {
                // Stored NPUB exists - validate it matches cached data
                if (storedNpub !== currentState.biometricData.username) {
                    // Mismatch - clear cache and prompt
                    console.warn('Cached biometricData NPUB does not match stored NPUB, clearing cache');
                    appStore.update((state) => ({ ...state, biometricData: null }));
                } else {
                    // Match - use cached data
                    const npub = currentState.biometricData.username;
                    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
                    return npub;
                }
            }
        } catch (error) {
            // Validation failed - clear cache and prompt
            console.warn('Failed to validate cached biometricData in getNpub, clearing cache:', error);
            appStore.update((state) => ({ ...state, biometricData: null }));
            // Fall through to prompt
        }
    }

    let biometricData: Credentials | null = null;

    const { checkBiometricAvailability, getBiometricData } = await import('$lib/utils/helpers/biometrics');

    const isBiometricAvailable = await checkBiometricAvailability();

    if (isBiometricAvailable) {
        biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
        appStore.update((state) => ({ ...state, biometricData }));
    } else {
        const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
        biometricData = await getWebBiometricData(true);
        appStore.update((state) => ({ ...state, biometricData }));
    }

    if (!biometricData) {
        throw new Error('No biometric data found');
    }

    const npub = biometricData.username;
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return npub;
};

export const getNostrKeyPair = async (): Promise<{ nsec: Uint8Array, npub: string }> => {
    if (process.env.NODE_ENV === 'development') {
        const npub = "ceda26d39d2e9aeee53c2a475b6b056145213ec6ac6acdb183357f66f8de76b2";
        Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return {
            nsec: new Uint8Array([64, 85, 53, 116, 137, 216, 86, 105, 25, 84, 68, 96, 227, 45, 78, 105, 29, 245, 10, 190, 172, 102, 107, 78, 164, 177, 164, 186, 209, 169, 14, 54]),
            npub: npub
        }
    }
    const currentState = get(appStore);

    // Try to use cached biometricData, but validate and fall back to prompt if invalid
    if (currentState.biometricData) {
        try {
            // Validate session before using cached data
            const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
            if (!token) {
                // No access token means user is not logged in, clear cache and prompt
                console.warn('No access token found, clearing cached biometricData');
                appStore.update((state) => ({ ...state, biometricData: null }));
            } else {
                // Validate NPUB match
                const { value: storedNpub } = await Preferences.get({ key: StorageKeys.NPUB });
                if (storedNpub && storedNpub !== currentState.biometricData.username) {
                    // NPUB mismatch - different user, clear cache and prompt
                    console.warn('Cached biometricData NPUB does not match stored NPUB, clearing cache');
                    appStore.update((state) => ({ ...state, biometricData: null }));
                } else {
                    // Cached data is valid, try to decrypt
                    try {
                        const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
                        const nsec: Uint8Array = decodeNsec(sk);
                        const npub = currentState.biometricData.username;
                        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
                        return { nsec, npub };
                    } catch (decryptError) {
                        // Decryption failed - clear cache and fall through to prompt
                        console.warn('Failed to decrypt cached biometricData, clearing cache:', decryptError);
                        appStore.update((state) => ({ ...state, biometricData: null }));
                        // Fall through to prompt for fresh authentication
                    }
                }
            }
        } catch (validationError) {
            // Validation failed - clear cache and fall through to prompt
            console.warn('Failed to validate cached biometricData, clearing cache:', validationError);
            appStore.update((state) => ({ ...state, biometricData: null }));
            // Fall through to prompt for fresh authentication
        }
    }

    let biometricData: Credentials | null = null;

    const { checkBiometricAvailability, getBiometricData } = await import('$lib/utils/helpers/biometrics');

    const isBiometricAvailable = await checkBiometricAvailability();

    if (isBiometricAvailable) {
        const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
        biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
        appStore.update((state) => ({ ...state, biometricData }));
    } else {
        const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
        biometricData = await getWebBiometricData(true);
        appStore.update((state) => ({ ...state, biometricData }));
    }

    if (!biometricData) {
        throw new Error('No biometric data found');
    }

    const sk = await decryptNsecWithBiometrics(biometricData.password);
    const nsec: Uint8Array = decodeNsec(sk);

    const npub = biometricData.username;
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return { nsec, npub };
};

export const getAllKeys = async (): Promise<{ npub: string, nsec: Uint8Array, mnemonic: string }> => {
    const currentState = get(appStore);

    // Try to use cached biometricData, but validate and fall back to prompt if invalid
    if (currentState.biometricData) {
        try {
            // Validate session before using cached data
            const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
            if (!token) {
                // No access token means user is not logged in, clear cache and prompt
                console.warn('No access token found in getAllKeys, clearing cached biometricData');
                appStore.update((state) => ({ ...state, biometricData: null }));
            } else {
                // Validate NPUB match
                const { value: storedNpub } = await Preferences.get({ key: StorageKeys.NPUB });
                if (storedNpub && storedNpub !== currentState.biometricData.username) {
                    // NPUB mismatch - different user, clear cache and prompt
                    console.warn('Cached biometricData NPUB does not match stored NPUB in getAllKeys, clearing cache');
                    appStore.update((state) => ({ ...state, biometricData: null }));
                } else {
                    // Cached data is valid, try to decrypt
                    try {
                        const parsedData = JSON.parse(currentState.biometricData.password);
                        
                        // Validate master key data format
                        if (!parsedData.masterKeyData) {
                            throw new Error('Invalid master key data format');
                        }
                        
                        const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
                            JSON.stringify(parsedData.masterKeyData),
                            parsedData.key
                        );

                        const nsec: Uint8Array = decodeNsec(sk);
                        const npub = currentState.biometricData.username;
                        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
                        return { nsec, npub, mnemonic };
                    } catch (decryptError) {
                        // Decryption failed - clear cache and fall through to prompt
                        console.warn('Failed to decrypt cached biometricData in getAllKeys, clearing cache:', decryptError);
                        appStore.update((state) => ({ ...state, biometricData: null }));
                        // Fall through to prompt for fresh authentication
                    }
                }
            }
        } catch (validationError) {
            // Validation failed - clear cache and fall through to prompt
            console.warn('Failed to validate cached biometricData in getAllKeys, clearing cache:', validationError);
            appStore.update((state) => ({ ...state, biometricData: null }));
            // Fall through to prompt for fresh authentication
        }
    }

    let biometricData: Credentials | null = null;

    const { checkBiometricAvailability, getBiometricData } = await import('$lib/utils/helpers/biometrics');

    const isBiometricAvailable = await checkBiometricAvailability();

    if (isBiometricAvailable) {
        const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });

        biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
        appStore.update((state) => ({ ...state, biometricData }));
    } else {
        const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
        biometricData = await getWebBiometricData(true);
        appStore.update((state) => ({ ...state, biometricData }));
    }

    if (!biometricData) {
        throw new Error('No biometric data found');
    }

    const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
        JSON.stringify(JSON.parse(biometricData.password).masterKeyData),
        JSON.parse(biometricData.password).key
    );

    const nsec: Uint8Array = decodeNsec(sk);

    const npub = biometricData.username;
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return { nsec, npub, mnemonic };
};

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