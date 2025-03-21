import type { Credentials } from '$lib/types/auth';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { generateRandomKey } from '$lib/utils/helpers/crypto';

const BIOMETRIC_SERVER_KEY = import.meta.env.VITE_BIOMETRIC_SERVER_KEY;
const BIOMETRIC_VERIFY_OPTIONS = {
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

export async function setBiometricKey(publicKey: string, encryptionData: {
    key: string;
    iv: string;
    authTag: string;
    data: string;
}): Promise<boolean> {
    try {
        // Store the encryption data as a JSON string
        await NativeBiometric.setCredentials({
            username: publicKey,
            password: JSON.stringify(encryptionData),
            server: BIOMETRIC_SERVER_KEY
        } as Credentials);

        return true;
    } catch (err) {
        console.error('Failed to store biometric key:', err);
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

export async function getBiometricData(): Promise<Credentials | null> {
    try {
        const verified = await verifyIdentity();
        if (!verified) return null;

        const credentials = await NativeBiometric.getCredentials({
            server: BIOMETRIC_SERVER_KEY
        }) as Credentials;

        return credentials;
    } catch (err) {
        console.error('Failed to get biometric key:', err);
        return null;
    }
}


export async function generateDeviceSignature(): Promise<string> {
    // Generate a unique device signature using AES-GCM key
    const key = await generateRandomKey();
    const exported = await crypto.subtle.exportKey('raw', key);
    const bytes = new Uint8Array(exported);
    
    // Convert to hex string using TextEncoder
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}