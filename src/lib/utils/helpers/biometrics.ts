import type { Credentials } from '$lib/types/auth';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';

export const BIOMETRIC_SERVER_KEY = 'com.bittasker.app:nostr_keys';
export const BIOMETRIC_VERIFY_OPTIONS = {
    reason: 'Secure your BitTasker account',
    title: 'BitTasker Authentication',
    subtitle: 'Verify Identity',
    description: 'Please authenticate to proceed',
    maxAttempts: 3,
    useFallback: true
};

export const checkBiometricAvailability = async () => {
    const isNative = Capacitor.isNativePlatform();
    if (!isNative) return false;
    const result = await NativeBiometric.isAvailable();
    return result.isAvailable;
};

export async function verifyIdentity(): Promise<boolean> {
    try {
        await NativeBiometric.verifyIdentity(BIOMETRIC_VERIFY_OPTIONS);
        return true;
    } catch (err) {
        console.error('Biometric verification failed:', err);
        return false;
    }
}

export async function setBiometricKey(publicKey: string, encryptionKey: string): Promise<boolean> {
    try {
        const verified = await verifyIdentity();
        if (!verified) return false;

        await NativeBiometric.setCredentials({
            username: publicKey,
            password: encryptionKey,
            server: BIOMETRIC_SERVER_KEY
        } as Credentials);
        return true;
    } catch (err) {
        console.error('Failed to set biometric key:', err);
        return false;
    }
}

export async function getBiometricKey(publicKey: string): Promise<string | null> {
    try {
        const verified = await verifyIdentity();
        if (!verified) return null;

        const credentials = await NativeBiometric.getCredentials({
            server: BIOMETRIC_SERVER_KEY
        }) as Credentials;

        if (credentials.username !== publicKey) {
            throw new Error('Biometric key mismatch');
        }

        return credentials.password;
    } catch (err) {
        console.error('Failed to get biometric key:', err);
        return null;
    }
}
