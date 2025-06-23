/**
 * WebAuthentication (WebAuthn) implementation for web-based biometric authentication
 * This provides similar functionality to the Capacitor Native Biometric features
 * but uses the browser's WebAuthn API for web platforms
 */

import type { Credentials, BiometricVerifyOptions, EncryptionData } from '$lib/types/auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { appStore } from '$lib/stores/app.store';

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
 * Generate a new challenge
 */
function generateChallenge(): ArrayBuffer {
	const arr = new Uint8Array(32);
	crypto.getRandomValues(arr);
	return arr.buffer;
}

/**
 * Convert string to ArrayBuffer
 */
function stringToArrayBuffer(str: string): ArrayBuffer {
	const encoder = new TextEncoder();
	return encoder.encode(str).buffer;
}

/**
 * Convert ArrayBuffer to Base64 string
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
	return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Convert Base64 string to ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
	const binaryString = atob(base64);
	const bytes = new Uint8Array(binaryString.length);
	for (let i = 0; i < binaryString.length; i++) {
		bytes[i] = binaryString.charCodeAt(i);
	}
	return bytes.buffer;
}

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
 * Discover available credentials using conditional UI
 * This allows users to authenticate even if localStorage is cleared
 */
export async function discoverCredentials(): Promise<string[] | null> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			return null;
		}

		// Check if conditional UI is supported
		const isConditionalMediationAvailable = await PublicKeyCredential.isConditionalMediationAvailable();
		
		if (!isConditionalMediationAvailable) {
			console.log('Conditional mediation not available, using standard discovery');
		}

		// Use empty allowCredentials to trigger discoverable credential selection
		const authOptions: PublicKeyCredentialRequestOptions = {
			challenge: generateChallenge(),
			timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
			userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification,
			// Empty allowCredentials array enables credential discovery
			allowCredentials: []
		};
		console.log('authOptions', authOptions);

		const credential = (await navigator.credentials.get({
			publicKey: authOptions,
			// Use conditional mediation if available
			mediation: isConditionalMediationAvailable ? 'conditional' : 'optional'
		})) as PublicKeyCredential;
		console.log('credential', credential);

		if (!credential) {
			return null;
		}

		// Extract user handle (which contains our publicKey)
		const response = credential.response as AuthenticatorAssertionResponse;
		if (response.userHandle) {
			const userHandle = new TextDecoder().decode(response.userHandle);
			const credentialId = arrayBufferToBase64(credential.rawId);
			
			// Cache the discovered credential ID for this session
			await Preferences.set({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID,
				value: credentialId
			});

			return [userHandle]; // Return the public key(s) associated with discovered credentials
		}

		return null;
	} catch (err) {
		console.error('Credential discovery failed:', err);
		return null;
	}
}

/**
 * Verify user identity using WebAuthn with automatic credential discovery
 */
export async function verifyIdentity(
	options: BiometricVerifyOptions = WEBAUTHN_VERIFY_OPTIONS
): Promise<boolean> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			throw new Error('WebAuthn is not available on this device');
		}

		// First, try to get stored credential ID
		const { value: credentialId } = await Preferences.get({
			key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
		});

		let authOptions: PublicKeyCredentialRequestOptions;

		if (credentialId) {
			// Use stored credential ID
			authOptions = {
				challenge: generateChallenge(),
				timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
				userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification,
				allowCredentials: [
					{
						id: base64ToArrayBuffer(credentialId),
						type: 'public-key'
					}
				]
			};
		} else {
			// No stored credential ID - use credential discovery
			console.log('No stored credential ID found, attempting credential discovery...');
			authOptions = {
				challenge: generateChallenge(),
				timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
				userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification,
				// Empty allowCredentials enables discovery
				allowCredentials: []
			};
		}

		// Request authentication
		const credential = (await navigator.credentials.get({
			publicKey: authOptions
		})) as PublicKeyCredential;

		if (!credential) {
			return false;
		}

		// If we discovered a new credential, cache its ID
		if (!credentialId) {
			const newCredentialId = arrayBufferToBase64(credential.rawId);
			await Preferences.set({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID,
				value: newCredentialId
			});
		}

		return true;
	} catch (err) {
		console.error('Biometric verification failed:', err);
		return false;
	}
}

/**
 * Register WebAuthn credential and store encrypted data with discoverable credentials
 */
export async function setWebBiometricKey(
	publicKey: string,
	encryptionData: EncryptionData
): Promise<boolean> {
	try {
		if (!(await checkWebBiometricAvailability())) {
			throw new Error('WebAuthn is not available on this device');
		}

		// Create user info for WebAuthn
		const userId = await generateDeviceKey();

		// Create registration options with discoverable credentials
		const registrationOptions: PublicKeyCredentialCreationOptions = {
			challenge: generateChallenge(),
			rp: {
				name: 'BitTasker',
				id: window.location.hostname
			},
			user: {
				id: stringToArrayBuffer(publicKey), // Use publicKey as user ID for discovery
				name: publicKey,
				displayName: 'BitTasker User'
			},
			pubKeyCredParams: [
				{ type: 'public-key', alg: -7 }, // ES256
				{ type: 'public-key', alg: -257 } // RS256
			],
			timeout: 60000,
			attestation: WEBAUTHN_VERIFY_OPTIONS.attestation,
			authenticatorSelection: {
				...WEBAUTHN_VERIFY_OPTIONS.authenticatorSelection,
				requireResidentKey: true, // CRITICAL: Makes credentials discoverable
				residentKey: 'required' // Explicitly require resident keys
			}
		};

		// Create credential
		const credential = (await navigator.credentials.create({
			publicKey: registrationOptions
		})) as PublicKeyCredential;

		// Clean up any old credentials
		const { value: currentCredentials } = await Preferences.get({
			key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
		});

		if (currentCredentials) {
			await Preferences.remove({ key: currentCredentials });
			await Preferences.remove({ key: `webAuthn_${currentCredentials}` });
		}

		// Store credential ID for performance (but not required for security)
		const credentialId = arrayBufferToBase64(credential.rawId);
		await Preferences.set({
			key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID,
			value: credentialId
		});

		const data = {
			username: publicKey,
			password: JSON.stringify(encryptionData),
			server: userId
		};

		// Store the encrypted data with multiple keys for redundancy
		await Promise.all([
			// Primary storage using credential ID
			Preferences.set({
				key: `webAuthn_${credentialId}`,
				value: JSON.stringify(data)
			}),
			// Backup storage using public key (for discovery scenarios)
			Preferences.set({
				key: `webAuthn_pubkey_${publicKey}`,
				value: JSON.stringify(data)
			})
		]);

		appStore.update((state) => ({ ...state, biometricData: data }));
		await Preferences.set({ key: 'npub', value: publicKey });

		return true;
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		return false;
	}
}

/**
 * Get stored credentials after biometric verification with automatic discovery
 */
export async function getWebBiometricData(): Promise<Credentials | null> {
	try {
		const verified = await verifyIdentity();
		if (!verified) return null;

		// Try to get credential ID
		const { value: credentialId } = await Preferences.get({
			key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
		});

		let storedData: string | null = null;

		if (credentialId) {
			// Try primary storage
			const { value } = await Preferences.get({
				key: `webAuthn_${credentialId}`
			});
			storedData = value;
		}

		// If no data found, try credential discovery and backup storage
		if (!storedData) {
			console.log('Primary storage failed, attempting credential discovery...');
			
			const discoveredKeys = await discoverCredentials();
			if (discoveredKeys && discoveredKeys.length > 0) {
				// Try backup storage using discovered public key
				const { value } = await Preferences.get({
					key: `webAuthn_pubkey_${discoveredKeys[0]}`
				});
				storedData = value;
			}
		}

		if (!storedData) return null;

		return JSON.parse(storedData) as Credentials;
	} catch (err) {
		console.error('Failed to get biometric key:', err);
		return null;
	}
}

/**
 * Import existing passkey credentials for users who have lost localStorage
 */
export async function importExistingPasskey(): Promise<Credentials | null> {
	try {
		console.log('Starting passkey import process...');
		
		const discoveredKeys = await discoverCredentials();
		if (!discoveredKeys || discoveredKeys.length === 0) {
			console.log('No discoverable credentials found');
			return null;
		}

		console.log(`Found ${discoveredKeys.length} discoverable credential(s)`);

		// Try to find stored data for any discovered credential
		for (const publicKey of discoveredKeys) {
			const { value: storedData } = await Preferences.get({
				key: `webAuthn_pubkey_${publicKey}`
			});

			if (storedData) {
				console.log(`Successfully imported passkey for public key: ${publicKey}`);
				const credentials = JSON.parse(storedData) as Credentials;
				
				// Update app store with recovered credentials
				appStore.update((state) => ({ ...state, biometricData: credentials }));
				await Preferences.set({ key: 'npub', value: publicKey });
				
				return credentials;
			}
		}

		console.log('Credentials found but no associated data in storage');
		return null;
	} catch (err) {
		console.error('Failed to import existing passkey:', err);
		return null;
	}
}

/**
 * Generate device-specific key as hex string (same as in biometrics.ts)
 */
async function generateDeviceKey(): Promise<string> {
	const userAgent = navigator.userAgent;
	// @ts-ignore
	const platform = navigator?.userAgentData?.platform || navigator.platform || 'unknown';
	const deviceId = `${userAgent}_${platform}_BitTasker`;

	const encoder = new TextEncoder();
	const deviceData = encoder.encode(deviceId);
	const keyData = await crypto.subtle.digest('SHA-256', deviceData);

	return Array.from(new Uint8Array(keyData))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}
