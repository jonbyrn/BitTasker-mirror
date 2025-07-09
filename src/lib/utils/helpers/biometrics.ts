import type { Credentials, BiometricVerifyOptions } from '$lib/types/auth';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { bytesToBase64, packKeys, unPackKeys } from '$lib/utils/helpers/encoding';
import { createUserFriendlyName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import authService from '$lib/api/services/auth.service';

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

/**
 * Generate a unique credential ID for mobile biometric authentication
 * This mimics WebAuthn's credential ID generation
 */
function generateCredentialId(): string {
	const randomBytes = crypto.getRandomValues(new Uint8Array(32));
	return bytesToBase64(randomBytes);
}

/**
 * Set biometric key using shared packKeys format - matches web implementation exactly
 * @param publicKey User's Nostr public key  
 * @param exportedKey The exported private key for decryption
 * @param customName Optional custom name for the passkey (mobile device name)
 * @returns Promise with credential ID (like WebAuthn)
 */
export async function setBiometricKey(
	publicKey: string,
	exportedKey: string,
	customName?: string
): Promise<string> {
	try {
		const deviceId = await getDeviceIdentifier();

		// Generate unique credential ID for this mobile passkey
		const credentialId = generateCredentialId();

		// Use the same packKeys function as web implementation
		const packedKeys = packKeys(publicKey, exportedKey);

		// Convert ArrayBuffer to base64 for mobile storage
		const packedKeysBase64 = btoa(String.fromCharCode(...new Uint8Array(packedKeys)));

		const userName = customName || createUserFriendlyName(publicKey);

		// Store packed keys + credential ID together
		const credentialData = {
			keys: packedKeysBase64,
			credentialId: credentialId
		};

		await NativeBiometric.setCredentials({
			username: userName,
			password: JSON.stringify(credentialData),
			server: deviceId
		}).catch(err => {
			console.error('Failed to set biometric key:', err);
			throw new Error('Failed to set biometric key');
		});


		// Return credential ID like WebAuthn does
		return credentialId;
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		throw new Error('Failed to set biometric key' + err);
	}
}

/**
 * Get biometric data using shared unPackKeys format
 * @returns Promise<Credentials | null>
 */
export async function getBiometricData(): Promise<Credentials | null> {
	try {
		const verified = await verifyIdentity();
		if (!verified) return null;

		const deviceId = await getDeviceIdentifier();

		const credentials = await NativeBiometric.getCredentials({
			server: deviceId
		});

		// Parse the stored credential data
		const credentialData = JSON.parse(credentials.password);
		const packedKeysBase64 = credentialData.keys;
		const credentialId = credentialData.credentialId;

		// Convert base64 back to ArrayBuffer
		const binaryString = atob(packedKeysBase64);
		const bytes = new Uint8Array(binaryString.length);
		for (let i = 0; i < binaryString.length; i++) {
			bytes[i] = binaryString.charCodeAt(i);
		}
		const packedKeys = bytes.buffer;

		// Use the same unPackKeys function as web implementation
		const unpackedKeys = unPackKeys(packedKeys);

		// Get encrypted data from backend using the stored credential ID
		const { encryptedPrivateKey, iv, authTag, salt } = await authService.getEncryptedKey(
			unpackedKeys.publicKey,
			deviceId,
			credentialId // Use the actual stored credential ID
		);

		return {
			username: unpackedKeys.publicKey,
			password: JSON.stringify({
				key: unpackedKeys.exportedKey,
				data: encryptedPrivateKey,
				iv,
				authTag,
				salt
			}),
			server: deviceId
		};
	} catch (err) {
		console.error('Failed to get biometric data:', err);
		return null;
	}
}
