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

    if (currentState.biometricData) {
        const npub = currentState.biometricData.username;
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return npub;
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

    if (currentState.biometricData) {
        const sk = await decryptNsecWithBiometrics(currentState.biometricData.password);
        const nsec: Uint8Array = decodeNsec(sk);

        const npub = currentState.biometricData.username;
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return { nsec, npub };
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

    if (currentState.biometricData) {
        const parsedData = JSON.parse(currentState.biometricData.password);
        const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
            JSON.stringify(parsedData.masterKeyData),
            parsedData.key
        );

        const nsec: Uint8Array = decodeNsec(sk);

        const npub = currentState.biometricData.username;
        await Preferences.set({ key: StorageKeys.NPUB, value: npub });
        return { nsec, npub, mnemonic };
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