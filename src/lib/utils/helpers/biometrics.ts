import type { Credentials, BiometricVerifyOptions, EncryptionData } from '$lib/types/auth';
import { NativeBiometric } from 'capacitor-native-biometric';
import { Capacitor } from '@capacitor/core';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

const BIOMETRIC_VERIFY_OPTIONS: BiometricVerifyOptions = {
	reason: 'Secure your BitTasker account',
	title: 'BitTasker Authentication',
	subtitle: 'Verify Identity',
	description: 'Please authenticate to proceed',
	maxAttempts: 3,
	useFallback: true
};

export const checkBiometricAvailability = async (): Promise<boolean> => {
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

export async function setBiometricKey(
	publicKey: string,
	encryptionData: EncryptionData
): Promise<boolean> {
	try {
		// Store the encryption data as a JSON string
		await NativeBiometric.setCredentials({
			username: publicKey,
			password: JSON.stringify(encryptionData),
			server: await generateDeviceKey()
		});

		return true;
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		return false;
	}
}

export async function getBiometricData(): Promise<Credentials | null> {
	try {
		const verified = await verifyIdentity();
		if (!verified) return null;

		const credentials = (await NativeBiometric.getCredentials({
			server: await generateDeviceKey()
		})) as Credentials;

		return credentials;
	} catch (err) {
		console.error('Failed to get biometric key:', err);
		return null;
	}
}

// Generate device-specific key as hex string
async function generateDeviceKey(): Promise<string> {
	const deviceId = await getDeviceIdentifier();
	const encoder = new TextEncoder();
	const deviceData = encoder.encode(deviceId);
	const keyData = await crypto.subtle.digest('SHA-256', deviceData);
	return Array.from(new Uint8Array(keyData))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
