import type { Credentials } from '$lib/types/auth';
import { Capacitor } from '@capacitor/core';
import { handleBiometricError } from './biometricErrorHandler';
import { packKeysMobile, unPackKeysMobile, generateMobileChallenge } from '$lib/utils/helpers/encoding';
import { Webauthn, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from 'capacitor-webauthn';
import { createUserDeviceShortName, generatePasskeyName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '../constants/storage';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { goto } from '$app/navigation';
import authService from '$lib/api/services/auth.service';

export const checkBiometricAvailability = async (): Promise<boolean> => {
	const isNative = Capacitor.isNativePlatform();
	if (!isNative) return false;
	const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
	return webAuthnAvailable;
};

/**
 * Set biometric key using shared packKeys format - matches web implementation exactly
 * @param publicKey User's Nostr public key  
 * @param exportedKey The exported private key for decryption
 * @param authMethod Authentication method: 'biometrics' for native, 'passkey' for WebAuthn
 * @param customName Optional custom name for the passkey (mobile device name)
 * @returns Promise with credential ID (like WebAuthn)
 */
export async function setBiometricKey(
	npub: string,
	exportedKey: string,
	username?: string
): Promise<string> {
	try {
		let credentialId: string | null = null;

		// Use the same packKeys function as web implementation
		const packedKeysBase64 = packKeysMobile(npub, exportedKey);

		const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
		if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

		let name = '';
		let displayName = '';
		if (username) {
			name = username;
			displayName = username;
		} else {
			const passkeyName = await generatePasskeyName(npub);
			name = passkeyName.name;
			displayName = passkeyName.displayName;
		}

		const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
			challenge: generateMobileChallenge(),
			rp: {
				name: 'BitTasker',
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
		}

		const result = await Webauthn.startRegistration(registrationOptions);

		credentialId = result.id;

		if (!credentialId) {
			throw new Error('No credential ID found');
		}

		// Return credential ID like WebAuthn does
		return credentialId;
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		throw new Error(await handleBiometricError(err, 'mobile-webauthn'));
	}
}

/**
 * Get biometric data using shared unPackKeys format
 * @param checkNpub For already logged in users check biometric npub against localStorage npub
 * @returns Promise<Credentials | null>
 */
export async function getBiometricData(checkNpub: boolean = false): Promise<Credentials | null> {
	try {
		const deviceId = await getDeviceIdentifier();

		// Force WebAuthn if authMethod is 'passkey'
		const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
		if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

		const options: PublicKeyCredentialRequestOptionsJSON = {
			challenge: generateMobileChallenge(),
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

		if (checkNpub) {
			const { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });
			if (npub !== publicKey) {
				throw new Error("Passkey mismatch: Please select the correct one linked to this account.");
			}
		}

		const deviceName = await createUserDeviceShortName(publicKey);

		try {
			const { encryptionData, isLegacyFormat } = await authService.getEncryptedData(publicKey, deviceId, credentials.id, deviceName);

			if (encryptionData) {
				return {
					npub: publicKey,
					encryptedData: encryptionData,
					// @ts-ignore - Legacy format type check can be ignored as it will be removed in the future
					exportedKey: isLegacyFormat ? encryptionData.exportedMasterKey : exportedKey,
					deviceId,
					deviceName,
					credentialId: credentials.id,
					isLegacyFormat
				};
			} else {
				throw new Error('We could not find data associated with this passkey.');
			}
		} catch (error) {
			console.warn('Master key not available:', error);
			throw new Error('We could not find data associated with this passkey.');
		}
	} catch (err) {
		const platform = 'mobile-webauthn';

		// Silently ignore "A request is already pending" errors
		if (err instanceof Error && (
			err.message.includes('A request is already pending') ||
			err.message.includes('request is already pending') ||
			err.message.includes('OperationError') && err.message.includes('already pending')
		)) {
			console.log('Biometric request already in progress, ignoring duplicate request');
			return null;
		}

		console.error('Failed to get biometric data:', err);
		if (err instanceof Error && err.message.includes('device has been revoked')) {
			appStore.showInfoToast('Your device access has been revoked');
			await authState.logout();
			goto('/auth/login');
		}
		throw new Error(await handleBiometricError(err, platform));
	}
}
