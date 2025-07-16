import type { Credentials } from '$lib/types/auth';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils'
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';
import { nip19 } from 'nostr-tools';

export const getNostrKeyPair = async (): Promise<{ nsec: Uint8Array, npub: string }> => {
    const currentState = get(appStore);

    if (currentState.biometricData) {
        const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
        let nsec: Uint8Array;
        
        // Check if the decrypted key is in nsec format or hex format
        if (sk.startsWith('nsec1')) {
            // It's in nsec format, decode it
            const { data } = nip19.decode(sk);
            nsec = data as Uint8Array;
        } else if (/^[0-9a-fA-F]+$/.test(sk)) {
            // It's a hex string - handle potential length issues
            let hexString = sk;
            
            // Pad with leading zero if odd length (common cause of "unpadded hex" error)
            if (hexString.length % 2 !== 0) {
                hexString = '0' + hexString;
            }
            
            // Ensure it's 64 characters (32 bytes) for a valid private key
            if (hexString.length === 64) {
                nsec = hexToBytes(hexString);
            } else if (hexString.length === 66 && hexString.startsWith('0x')) {
                // Remove 0x prefix if present
                nsec = hexToBytes(hexString.slice(2));
            } else {
                throw new Error(`Invalid hex private key length: ${hexString.length} characters (expected 64)`);
            }
        } else {
            throw new Error('Invalid private key format: expected nsec or hex string');
        }
        
        const npub = currentState.biometricData.username;
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return { nsec, npub };
    }

    let biometricData: Credentials | null = null;

    const { checkBiometricAvailability, getBiometricData } = await import('$lib/utils/helpers/biometrics');

    const isBiometricAvailable = await checkBiometricAvailability();

    if (isBiometricAvailable) {
        biometricData = await getBiometricData();
        appStore.update((state) => ({ ...state, biometricData }));
    } else {
        const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
        biometricData = await getWebBiometricData();
        appStore.update((state) => ({ ...state, biometricData }));
    }

    if (!biometricData) {
        throw new Error('No biometric data found');
    }

    const sk = await decryptNsecWithBiometrics(biometricData.password);
    let nsec: Uint8Array;
    
    // Check if the decrypted key is in nsec format or hex format
    if (sk.startsWith('nsec1')) {
        // It's in nsec format, decode it
        const { data } = nip19.decode(sk);
        nsec = data as Uint8Array;
    } else if (/^[0-9a-fA-F]+$/.test(sk)) {
        // It's a hex string - handle potential length issues
        let hexString = sk;
        
        // Pad with leading zero if odd length (common cause of "unpadded hex" error)
        if (hexString.length % 2 !== 0) {
            hexString = '0' + hexString;
        }
        
        // Ensure it's 64 characters (32 bytes) for a valid private key
        if (hexString.length === 64) {
            nsec = hexToBytes(hexString);
        } else if (hexString.length === 66 && hexString.startsWith('0x')) {
            // Remove 0x prefix if present
            nsec = hexToBytes(hexString.slice(2));
        } else {
            throw new Error(`Invalid hex private key length: ${hexString.length} characters (expected 64)`);
        }
    } else {
        throw new Error('Invalid private key format: expected nsec or hex string');
    }
    
    const npub = biometricData.username;
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return { nsec, npub };
};

export const getNpub = async (): Promise<string> => {
    const { value } = await Preferences.get({ key: StorageKeys.NPUB });

    if (value) {
        return value;
    }

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

    if (currentState.biometricData) {
        const npub = currentState.biometricData.username;
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return npub;
    }

    let biometricData: Credentials | null = null;

    const { checkBiometricAvailability, getBiometricData } = await import('$lib/utils/helpers/biometrics');

    const isBiometricAvailable = await checkBiometricAvailability();

    if (isBiometricAvailable) {
        biometricData = await getBiometricData();
        appStore.update((state) => ({ ...state, biometricData }));
    } else {
        const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
        biometricData = await getWebBiometricData();
        appStore.update((state) => ({ ...state, biometricData }));
    }

    if (!biometricData) {
        throw new Error('No biometric data found');
    }

    const npub = biometricData.username;
    await Preferences.set({ key: StorageKeys.NPUB, value: npub });
    return npub;
};
