/**
 * WebAuthentication (WebAuthn) implementation for web-based biometric authentication
 * This provides similar functionality to the Capacitor Native Biometric features
 */

import type { Credentials, BiometricVerifyOptions } from '$lib/types/auth';
import { createDisplayName, createUserFriendlyName, getDeviceIdentifier } from './deviceIdentity';
import { packKeys, unPackKeys, generateWebChallenge } from '$lib/utils/helpers/encoding';
import authService from '$lib/api/services/auth.service';
import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';

// Define WebAuthn specific options type that extends BiometricVerifyOptions
interface WebAuthnVerifyOptions extends BiometricVerifyOptions {
	timeout: number;
	userVerification: UserVerificationRequirement;
	attestation: AttestationConveyancePreference;
	authenticatorSelection: AuthenticatorSelectionCriteria;
}

// Default options for WebAuthn authentication requests
const WEBAUTHN_VERIFY_OPTIONS: WebAuthnVerifyOptions = {
	timeout: 60000,
	userVerification: 'required',
	attestation: 'none',
	authenticatorSelection: {
		authenticatorAttachment: 'platform',
		userVerification: 'required',
		requireResidentKey: true
	},
	reason: 'Secure your BitTasker account',
	title: 'BitTasker Authentication',
	subtitle: 'Verify Identity',
	description: 'Please authenticate to proceed',
	maxAttempts: 3,
	useFallback: true
};

/**
 * Check if WebAuthn is available in the current browser
 */
export const checkWebBiometricAvailability = async (): Promise<boolean> => {
	if (!window.PublicKeyCredential) {
		return false;
	}

	try {
		return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
	} catch (err) {
		console.error('WebAuthn not available:', err);
		return false;
	}
};

/**
 * Verify user identity using WebAuthn with automatic credential discovery
 * Returns the credentials if authentication is successful
 */
export async function verifyIdentity(
	options: BiometricVerifyOptions = WEBAUTHN_VERIFY_OPTIONS
): Promise<boolean> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			throw new Error('WebAuthn is not available on this device');
		}

		// Use credential discovery - empty allowCredentials enables discovery
		const authOptions: PublicKeyCredentialRequestOptions = {
			challenge: generateWebChallenge(),
			timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
			userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification,
			// Empty allowCredentials enables discovery of resident keys
			allowCredentials: []
		};

		// Request authentication with timeout protection
		const credentialPromise = navigator.credentials.get({
			publicKey: authOptions
		}) as Promise<PublicKeyCredential>;

		// Add manual timeout to prevent hanging
		const timeoutPromise = new Promise<null>((_, reject) => {
			setTimeout(() => reject(new Error('Authentication timeout')), 35000);
		});

		const credential = await Promise.race([credentialPromise, timeoutPromise]);

		return credential !== null;
	} catch (err) {
		console.error('Biometric verification failed:', err);
		return false;
	}
}

/**
 * Register WebAuthn credentials
 * @param publicKey User's Nostr public key
 * @param exportedKey The exported private key for decryption
 * @param customName Optional custom name for the passkey
 * @returns Promise with credential ID
 */
export async function setWebBiometricKey(
	publicKey: string,
	exportedKey: string,
	customName?: string
): Promise<string> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			throw new Error('WebAuthn is not available on this device');
		}

		const packedKeys = packKeys(publicKey, exportedKey);

		// Create descriptive names for the passkey
		const displayName = customName || createUserFriendlyName(publicKey);
		const userName = customName ? `BitTasker ${customName}` : createDisplayName(publicKey);

		// Create registration options
		const registrationOptions: PublicKeyCredentialCreationOptions = {
			challenge: generateWebChallenge(),
			rp: {
				name: 'BitTasker',
				id: window.location.hostname
			},
			user: {
				id: packedKeys, // * MAX of 64 bytes
				name: userName, // Short identifier like "8e52b613...de2612a"
				displayName: displayName // Full display name like "BitTasker 8e52b613...de2612a (12/20/2024)"
			},
			pubKeyCredParams: [
				{ type: 'public-key', alg: -7 }, // ES256
				{ type: 'public-key', alg: -257 } // RS256
			],
			timeout: 60000,
			attestation: WEBAUTHN_VERIFY_OPTIONS.attestation,
			authenticatorSelection: {
				...WEBAUTHN_VERIFY_OPTIONS.authenticatorSelection,
				requireResidentKey: true,
				residentKey: 'required'
			}
		};

		// Create credential
		const credential = (await navigator.credentials.create({
			publicKey: registrationOptions
		})) as PublicKeyCredential;

		if (!credential) {
			throw new Error('Failed to create WebAuthn credential');
		}

		return credential.id;
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		throw new Error('Failed to set biometric key');
	}
}

/**
 * Get stored credentials after biometric verification
 */
export async function getWebBiometricData(): Promise<Credentials | null> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			throw new Error('WebAuthn is not available on this device');
		}

		// Use credential discovery
		const authOptions: PublicKeyCredentialRequestOptions = {
			challenge: generateWebChallenge(),
			timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
			userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification
		};

		// Request authentication
		const credential = (await navigator.credentials.get({
			publicKey: authOptions
		})) as PublicKeyCredential;

		if (!credential) {
			throw new Error('No credential found');
		}

		// Extract combined data from the user handle
		const response = credential.response as AuthenticatorAssertionResponse;
		if (!response.userHandle) {
			console.error('No user handle in credential response');
			throw new Error('Invalid credential format. This passkey may be from an older version.');
		}

		const unpackedKeys = unPackKeys(response.userHandle);

		const publicKey = unpackedKeys.publicKey;
		const exportedKey = unpackedKeys.exportedKey;

		const deviceId = await getDeviceIdentifier();

		const { encryptedPrivateKey, iv, authTag, salt } = await authService.getEncryptedKey(
			publicKey,
			deviceId,
			credential.id
		);

		if (!encryptedPrivateKey) {
			throw new Error('No encrypted data found');
		}

		return {
			username: publicKey,
			password: JSON.stringify({ key: exportedKey, data: encryptedPrivateKey, iv, authTag, salt }),
			server: deviceId
		};
	} catch (err) {
		console.error('Failed to get biometric data:', err);
		const errorMessage =
			get(locale) === 'en'
				? 'Authorization either timed out, or was canceled. Try again'
				: 'La autorización expiró o se canceló. Intentar otra vez';

		throw new Error(errorMessage);
	}
}

/**
 * Detect the WebAuthn password manager provider based on platform and browser
 * @returns string describing the password manager that will be used
 */
export function getWebAuthnProviderDescription(): string {
	const userAgent = navigator.userAgent.toLowerCase();
	const platform = navigator.platform.toLowerCase();

	// iOS devices
	if (/iphone|ipad|ipod/.test(userAgent) || platform.includes('mac')) {
		if (/safari/.test(userAgent) && !/chrome/.test(userAgent)) {
			return 'iCloud Keychain';
		}
		if (/chrome/.test(userAgent)) {
			return 'Google Password Manager';
		}
		return 'iCloud Keychain'; // Default for macOS/iOS
	}

	// Android devices
	if (/android/.test(userAgent)) {
		if (/chrome/.test(userAgent)) {
			return 'Google Password Manager';
		}
		return 'Google Password Manager'; // Default for Android
	}

	// Windows
	if (/windows/.test(userAgent) || platform.includes('win')) {
		if (/edge/.test(userAgent)) {
			return 'Microsoft Authenticator';
		}
		if (/chrome/.test(userAgent)) {
			return 'Google Password Manager';
		}
		if (/firefox/.test(userAgent)) {
			return 'Firefox Password Manager';
		}
		return 'Windows Hello'; // Default for Windows
	}

	// Linux
	if (/linux/.test(userAgent) || platform.includes('linux')) {
		if (/chrome/.test(userAgent)) {
			return 'Google Password Manager';
		}
		if (/firefox/.test(userAgent)) {
			return 'Firefox Password Manager';
		}
		return 'Browser Password Manager';
	}

	// Fallback
	return 'Browser Password Manager';
}
