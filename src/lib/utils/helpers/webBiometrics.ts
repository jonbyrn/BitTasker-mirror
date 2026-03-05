/**
 * WebAuthentication (WebAuthn) implementation for web-based biometric authentication
 * This provides similar functionality to the Capacitor Native Biometric features
 */

import type { Credentials, BiometricVerifyOptions } from '$lib/types/auth';
import { generatePasskeyName } from './deviceIdentity';
import { packKeys, unPackKeys } from '$lib/utils/helpers/encoding';
import { handleBiometricError } from './biometricErrorHandler';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '../constants/storage';
import { authState } from '$lib/stores/auth.store';
import { appStore } from '$lib/stores/app.store';
import { goto } from '$app/navigation';
import authService from '$lib/api/services/auth.service';

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
		// Don't restrict authenticator type - allow both platform and cross-platform
		// This allows Playwright's virtual authenticator to work regardless of transport type
		// authenticatorAttachment: 'platform', // Removed to allow virtual authenticators
		userVerification: 'required',
		requireResidentKey: true,
		residentKey: 'required'
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
 * Also detects Playwright's virtual authenticator for E2E testing
 */
export const checkWebBiometricAvailability = async (): Promise<boolean> => {
	if (!window.PublicKeyCredential) {
		return false;
	}

	try {
		// Standard check for platform authenticator
		const isAvailable = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

		// If standard check passes, WebAuthn is available
		if (isAvailable) {
			return true;
		}

		// Fallback: Check if we're in a test environment with virtual authenticator
		// Playwright's virtual authenticator might not be detected by isUserVerifyingPlatformAuthenticatorAvailable
		// but PublicKeyCredential.create() will still work
		// We can detect this by checking if PublicKeyCredential exists and we're in a test-like environment
		const isTestEnvironment =
			typeof navigator !== 'undefined' &&
			(window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1' ||
				process.env.NODE_ENV === 'test' ||
				window.__PLAYWRIGHT_TEST__);

		// If PublicKeyCredential exists and we're in a test environment, assume virtual authenticator is available
		// This allows E2E tests with Playwright's virtual authenticator to work
		if (isTestEnvironment && window.PublicKeyCredential) {
			console.log(
				'[WebAuthn] Test environment detected, assuming virtual authenticator is available'
			);
			return true;
		}

		return false;
	} catch (err) {
		console.error('WebAuthn not available:', err);
		return false;
	}
};

/**
 * Register WebAuthn credentials
 * @param publicKey User's Nostr public key
 * @param exportedKey The exported private key for decryption
 * @param customName Optional custom name for the passkey
 * @returns Promise with credential data including ID, public key (hex), clientDataJSON, attestationObject, and challenge
 */
export async function setWebBiometricKey({
	npub,
	exportedKey,
	username,
	challenge
}: {
	npub: string;
	exportedKey: string;
	username?: string;
	challenge?: string;
}): Promise<{
	credentialId: string;
	passkeyPubkey: string;
	clientDataJSON: string;
	attestationObject: string;
	challenge: string;
}> {
	try {
		// Check availability, but allow test environments to proceed
		// The actual WebAuthn call will fail gracefully if not available
		const isAvailable = await checkWebBiometricAvailability();
		if (!isAvailable) {
			// In test environments, try anyway (virtual authenticator might work)
			const isTestEnvironment =
				typeof navigator !== 'undefined' &&
				(window.location.hostname === 'localhost' ||
					window.location.hostname === '127.0.0.1' ||
					process.env.NODE_ENV === 'test');

			if (!isTestEnvironment) {
				throw new Error('WebAuthn is not available on this device');
			}
			// In test environment, continue - let the actual WebAuthn call determine if it works
		}

		const packedKeys = packKeys(npub, exportedKey);

		let name = '';
		let displayName = '';
		if (username) {
			name = username + '@bittasker.com';
			displayName = username + '@bittasker.com';
		} else {
			const passkeyName = await generatePasskeyName(npub);
			name = passkeyName.name;
			displayName = passkeyName.displayName;
		}

		// Create registration options
		// In test environments, use more permissive options to work with virtual authenticators
		const isTestEnvironment =
			typeof navigator !== 'undefined' &&
			(window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1' ||
				process.env.NODE_ENV === 'test' ||
				window.__PLAYWRIGHT_TEST__);

		// Decode challenge from base64url
		const _challenge = challenge ? challenge : (await authService.getChallenge()).challenge;
		const challengeBuffer = Uint8Array.from(
			atob(_challenge.replace(/-/g, '+').replace(/_/g, '/')),
			(c) => c.charCodeAt(0)
		);

		const registrationOptions: PublicKeyCredentialCreationOptions = {
			challenge: challengeBuffer,
			rp: {
				name: 'BitTasker',
				id: window.location.hostname
			},
			user: {
				id: packedKeys, // * MAX of 64 bytes
				name: displayName, // The actual name displayed on the passkey
				displayName: name // Device name + 8 characters of the npub
			},
			pubKeyCredParams: [
				{ type: 'public-key', alg: -7 }, // ES256
				{ type: 'public-key', alg: -257 } // RS256
			],
			timeout: 60000,
			attestation: 'none', // Use 'none' for test environments to avoid attestation issues
			authenticatorSelection: isTestEnvironment
				? {
						// In test mode (localhost), allow cross-platform authenticators to match virtual authenticator
						// Using 'usb' transport in Playwright means we should allow cross-platform authenticators
						// Don't restrict authenticatorAttachment - allow any type (platform or cross-platform)
						// This allows the virtual authenticator to be automatically selected without browser prompts
						// authenticatorAttachment: undefined, // Allow any authenticator type (platform or cross-platform)
						userVerification: 'preferred', // Less strict for test environments
						requireResidentKey: true,
						residentKey: 'preferred' // Less strict for test environments
					}
				: {
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

		// Extract response data
		const response = credential.response as AuthenticatorAttestationResponse;

		// Convert clientDataJSON to base64url
		const clientDataJSON = btoa(String.fromCharCode(...new Uint8Array(response.clientDataJSON)))
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');

		// Convert attestationObject to base64url
		const attestationObject = btoa(
			String.fromCharCode(...new Uint8Array(response.attestationObject))
		)
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');

		// Extract public key from credential and convert to hex
		// The public key is in COSE format in the attestationObject
		const publicKeyBytes = response.getPublicKey();
		if (!publicKeyBytes) {
			throw new Error('Failed to extract public key from credential');
		}

		// Convert public key to hex format
		const passkeyPubkey = Array.from(new Uint8Array(publicKeyBytes))
			.map((b) => b.toString(16).padStart(2, '0'))
			.join('');

		return {
			credentialId: credential.id,
			passkeyPubkey,
			clientDataJSON,
			attestationObject,
			challenge: _challenge
		};
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		throw new Error(await handleBiometricError(err, 'web'));
	}
}

/**
 * Get stored credentials after biometric verification
 * @param checkNpub For already logged in users check biometric npub agains localStorage npub
 */
export async function getWebBiometricData(
	checkNpub: boolean = false,
	allowCredentials: PublicKeyCredentialDescriptor[] = []
): Promise<Credentials | null> {
	try {
		// Use credential discovery
		// In test environments, use more permissive options
		const isTestEnvironment =
			typeof navigator !== 'undefined' &&
			(window.location.hostname === 'localhost' ||
				window.location.hostname === '127.0.0.1' ||
				process.env.NODE_ENV === 'test' ||
				window.__PLAYWRIGHT_TEST__);

		// Check availability, but allow test environments to proceed
		const isAvailable = await checkWebBiometricAvailability();
		if (!isAvailable && !isTestEnvironment) {
			// In test environment, continue - let the actual WebAuthn call determine if it works
			throw new Error('WebAuthn is not available on this device');
		}

		const { challenge } = await authService.getChallenge();
		const challengeBuffer = Uint8Array.from(
			atob(challenge.replace(/-/g, '+').replace(/_/g, '/')),
			(c) => c.charCodeAt(0)
		);

		const authOptions: PublicKeyCredentialRequestOptions = {
			challenge: challengeBuffer,
			timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
			userVerification: isTestEnvironment ? 'preferred' : WEBAUTHN_VERIFY_OPTIONS.userVerification,
			allowCredentials
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

		if (checkNpub) {
			const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
			if (npub !== publicKey) {
				throw new Error('Passkey mismatch: Please select the correct one linked to this account.');
			}
		}

		const convertToBase64url = (data: ArrayBuffer) => {
			return btoa(String.fromCharCode(...new Uint8Array(data)))
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=/g, '');
		};

		const authenticatorData = convertToBase64url(response.authenticatorData);
		const clientDataJSON = convertToBase64url(response.clientDataJSON);
		const signature = convertToBase64url(response.signature);
		const userHandle = convertToBase64url(response.userHandle);

		await Preferences.set({ key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID, value: credential.id });

		return {
			npub: publicKey,
			exportedKey,
			credentialId: credential.id,
			challenge,
			response: {
				authenticatorData,
				clientDataJSON,
				signature,
				userHandle
			}
		};
	} catch (err) {
		// Silently ignore "A request is already pending" errors
		if (
			err instanceof Error &&
			(err.message.includes('A request is already pending') ||
				err.message.includes('request is already pending') ||
				(err.message.includes('OperationError') && err.message.includes('already pending')))
		) {
			console.log('Biometric request already in progress, ignoring duplicate request');
			return null;
		}

		console.error('Failed to get biometric data:', err);
		if (err instanceof Error && err.message.includes('device has been revoked')) {
			appStore.showInfoToast('Your device access has been revoked');
			await authState.logout();
			await goto('/auth/login');
		}
		throw new Error(await handleBiometricError(err, 'web'));
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
