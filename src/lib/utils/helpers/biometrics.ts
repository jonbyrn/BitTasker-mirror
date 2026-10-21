import type { Credentials } from '$lib/types/auth';
import {
	Webauthn,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialDescriptorJSON,
	type PublicKeyCredentialRequestOptionsJSON
} from 'capacitor-webauthn';
import { handleBiometricError } from './biometricErrorHandler';
import { isTransientPasskeyFailure } from './passkey-errors';
import { withSigningPrompt } from './signingPrompt';
import { generatePasskeyName } from '$lib/utils/helpers/deviceIdentity';
import {
	extractPublicKeyFromAttestationObject,
	packKeysMobile,
	unPackKeysMobile
} from '$lib/utils/helpers/encoding';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { goto } from '$app/navigation';
import { Capacitor } from '@capacitor/core';
import authService from '$lib/api/services/auth.service';

export const checkNativePlatform = (): boolean => {
	const isNative = Capacitor.isNativePlatform();
	return isNative;
};

export const checkBiometricAvailability = async (): Promise<boolean> => {
	const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
	return webAuthnAvailable;
};

/**
 * Set biometric key using shared packKeys format - matches web implementation exactly
 * @param npub User's Nostr public key
 * @param exportedKey The exported private key for decryption
 * @param authMethod Authentication method: 'biometrics' for native, 'passkey' for WebAuthn
 * @param customName Optional custom name for the passkey (mobile device name)
 * @returns Promise with credential data including ID, public key (hex), clientDataJSON, attestationObject, and challenge
 */
export async function setBiometricKey({
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
		let credentialId: string | null = null;

		// Use the same packKeys function as web implementation
		const packedKeysBase64 = packKeysMobile(npub, exportedKey);

		const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
		if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

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

		// Decode challenge from base64url
		const _challenge = challenge ? challenge : (await authService.getChallenge()).challenge;

		const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
			challenge: _challenge,
			rp: {
				name: 'BitTasker',
				// On mobile, window.location.hostname comes from Capacitor's server.hostname config.
				// This must match the domain where assetlinks.json is hosted for passkey validation.
				id: window.location.hostname
			},
			user: {
				id: packedKeysBase64,
				name: displayName, // The actual name displayed on the passkey
				displayName: name // Device name + 8 characters of the npub
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
		};

		const result = await Webauthn.startRegistration(registrationOptions);

		credentialId = result.id;

		if (!credentialId) {
			throw new Error('No credential ID found');
		}

		// Extract public key from response
		// Capacitor WebAuthn plugin returns the public key in the response
		const response = result.response;

		// Convert public key to hex if available
		let passkeyPubkey = '';
		if (response.publicKey) {
			// If publicKey is already a string, use it directly
			if (typeof response.publicKey === 'string') {
				passkeyPubkey = response.publicKey;
			} else {
				// Otherwise convert ArrayBuffer/Uint8Array to hex
				const publicKeyBytes = new Uint8Array(response.publicKey);
				passkeyPubkey = Array.from(publicKeyBytes)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			}
		} else {
			// get public key from attestationObject
			const publicKeyBytes = extractPublicKeyFromAttestationObject(
				result.response.attestationObject
			);
			if (publicKeyBytes) {
				passkeyPubkey = Array.from(publicKeyBytes)
					.map((b) => b.toString(16).padStart(2, '0'))
					.join('');
			}
		}

		// Return credential data like WebAuthn does
		return {
			credentialId,
			passkeyPubkey,
			clientDataJSON: response.clientDataJSON,
			attestationObject: response.attestationObject,
			challenge: _challenge
		};
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		throw new Error(await handleBiometricError(err, 'mobile-webauthn'));
	}
}

/**
 * Single-flight mutex: concurrent callers share one passkey prompt
 * instead of racing and hitting "A request is already pending".
 */
let pendingBiometricRequest: Promise<Credentials | null> | null = null;

/**
 * Get biometric data using shared unPackKeys format
 * @param checkNpub For already logged in users check biometric npub against localStorage npub
 * @returns Promise<Credentials | null>
 */
export async function getBiometricData(
	checkNpub: boolean = false,
	allowCredentials: PublicKeyCredentialDescriptorJSON[] = []
): Promise<Credentials | null> {
	if (pendingBiometricRequest) {
		return pendingBiometricRequest;
	}

	pendingBiometricRequest = withSigningPrompt(() =>
		executeBiometricData(checkNpub, allowCredentials)
	);

	try {
		return await pendingBiometricRequest;
	} finally {
		pendingBiometricRequest = null;
	}
}

async function requestBiometricCredential(
	checkNpub: boolean,
	allowCredentials: PublicKeyCredentialDescriptorJSON[]
): Promise<Credentials | null> {
	// Force WebAuthn if authMethod is 'passkey'
	const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
	if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

	const { challenge } = await authService.getChallenge();
	const challengeBuffer = challenge.replace(/-/g, '+').replace(/_/g, '/');

	const options: PublicKeyCredentialRequestOptionsJSON = {
		challenge: challengeBuffer,
		timeout: 60000,
		userVerification: 'required',
		rpId: window.location.hostname,
		allowCredentials
	};
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

	if (checkNpub) {
		const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
		if (npub !== publicKey) {
			throw new Error('Passkey mismatch: Please select the correct one linked to this account.');
		}
	}

	return {
		npub: publicKey,
		exportedKey,
		credentialId: credentials.id,
		response: credentials.response,
		challenge: challenge
	};
}

async function executeBiometricData(
	checkNpub: boolean,
	allowCredentials: PublicKeyCredentialDescriptorJSON[]
): Promise<Credentials | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			return await requestBiometricCredential(checkNpub, allowCredentials);
		} catch (err) {
			// The first prompt often fails when the page loses focus. Retry once
			// before the translated error is shown.
			if (attempt === 0 && isTransientPasskeyFailure(err)) {
				continue;
			}

			const platform = 'mobile-webauthn';

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
			throw new Error(await handleBiometricError(err, platform));
		}
	}
	throw new Error('Passkey approval failed');
}
