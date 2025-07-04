import type { Credentials } from '$lib/types/auth';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils'
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';

export const getNostrKeyPair = async (): Promise<{ nsec: Uint8Array, npub: string }> => {
    const currentState = get(appStore);

    if (currentState.biometricData) {
        const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
        const nsec = hexToBytes(sk);
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
    const nsec = hexToBytes(sk);
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
