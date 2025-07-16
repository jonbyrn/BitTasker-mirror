import type { Credentials, BiometricVerifyOptions } from '$lib/types/auth';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { bytesToBase64, packKeysMobile, unPackKeysMobile, unPackKeys } from '$lib/utils/helpers/encoding';
import { Webauthn, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from 'capacitor-webauthn';
import { createDisplayName, createUserFriendlyName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
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

function generateChallenge(): string {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	// Convert to base64url format
	return btoa(String.fromCharCode(...arr))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=/g, '');
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
		let credentialId: string | null = null;

		// Use the same packKeys function as web implementation
		const packedKeysBase64 = packKeysMobile(publicKey, exportedKey);

		const userName = createUserFriendlyName(publicKey);

		try {
			const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
			if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

			const displayName = customName ? `BitTasker ${customName}` : createDisplayName(publicKey);

			const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
				challenge: generateChallenge(),
				rp: {
					name: 'BitTasker',
					id: window.location.hostname
				},
				user: {
					id: packedKeysBase64,
					name: userName,
					displayName: displayName
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 }, // ES256
					{ type: 'public-key', alg: -257 } // RS256
				],
				timeout: 60000,
				attestation: 'none',
				authenticatorSelection: {
					// authenticatorAttachment: 'platform',
					userVerification: 'required',
					requireResidentKey: true,
					residentKey: 'required'
				}
			}
			const result = await Webauthn.startRegistration(registrationOptions);

			credentialId = result.id;
		} catch (err) {
			console.error('capacitor-webauthn error', err);
			// Generate unique credential ID for this mobile passkey
			credentialId = generateCredentialId();

			// Store packed keys + credential ID together
			const credentialData = {
				keys: packedKeysBase64,
				credentialId: credentialId
			};

			const deviceId = await getDeviceIdentifier();

			await NativeBiometric.setCredentials({
				username: userName,
				password: JSON.stringify(credentialData),
				server: deviceId
			}).catch(err => {
				console.error('Failed to set native biometrics:', err);
				throw new Error('Failed to set native biometric' + err);
			});
		}

		if (!credentialId) {
			throw new Error('No credential ID found');
		}

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
		try {
			const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
			if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

			const options: PublicKeyCredentialRequestOptionsJSON = {
				challenge: generateChallenge(),
				timeout: 60000,
				userVerification: 'required',
				rpId: window.location.hostname,
				allowCredentials: []
			}
			const credentials = await Webauthn.startAuthentication(options);

			if (!credentials) throw new Error('No credentials found');

			const response = credentials.response;

			if (!response.userHandle) {
				console.error('No user handle in credential response');
				throw new Error('No user handle in credential response');
			}

			const packedKeysBase64 = response.userHandle;

			const unpackedKeys = unPackKeysMobile(packedKeysBase64);
			const publicKey = unpackedKeys.publicKey;
			const exportedKey = unpackedKeys.exportedKey;

			const deviceId = await getDeviceIdentifier();

			const { encryptedPrivateKey, iv, authTag, salt } = await authService.getEncryptedKey(publicKey, deviceId, credentials.id);

			if (!encryptedPrivateKey) {
				throw new Error('No encrypted data found');
			}

			return {
				username: publicKey,
				password: JSON.stringify({ key: exportedKey, data: encryptedPrivateKey, iv, authTag, salt }),
				server: deviceId
			};
		} catch (err) {
			console.error('capacitor-webauthn error', err);

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
		}
	} catch (err) {
		console.error('Failed to get biometric data:', err);
		return null;
	}
}
