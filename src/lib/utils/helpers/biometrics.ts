import type { Credentials, BiometricVerifyOptions } from '$lib/types/auth';
import { Capacitor } from '@capacitor/core';
import { NativeBiometric } from 'capacitor-native-biometric';
import { handleBiometricError } from './biometricErrorHandler';
import { packKeysMobile, unPackKeysMobile, generateCredentialId, generateMobileChallenge } from '$lib/utils/helpers/encoding';
import { Webauthn, type PublicKeyCredentialCreationOptionsJSON, type PublicKeyCredentialRequestOptionsJSON } from 'capacitor-webauthn';
import { createDisplayName, createUserDeviceShortName, createUserFriendlyName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '../constants/storage';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { goto } from '$app/navigation';
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
 * Set biometric key using shared packKeys format - matches web implementation exactly
 * @param publicKey User's Nostr public key  
 * @param exportedKey The exported private key for decryption
 * @param authMethod Authentication method: 'biometrics' for native, 'passkey' for WebAuthn
 * @param customName Optional custom name for the passkey (mobile device name)
 * @returns Promise with credential ID (like WebAuthn)
 */
export async function setBiometricKey(
	publicKey: string,
	exportedKey: string,
	authMethod: 'biometrics' | 'passkey' = 'biometrics',
	customName?: string,
	credId?: string // used when updating a native passkey
): Promise<string> {
	try {
		let credentialId: string | null = null;

		// Use the same packKeys function as web implementation
		const packedKeysBase64 = packKeysMobile(publicKey, exportedKey);

		const userName = createUserFriendlyName(publicKey);

		if (authMethod === 'passkey') {
			const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
			if (!webAuthnAvailable) throw new Error('WebAuthn is not available');

			// Handle empty/whitespace-only customName by falling back to public key-based name
			const validCustomName = customName?.trim() || null;
			const displayName = validCustomName || createDisplayName(publicKey);
			// Use customName for user.name so it appears in password managers (no prefix)
			const passkeyUserName = validCustomName || createDisplayName(publicKey);

			const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
				challenge: generateMobileChallenge(),
				rp: {
					name: 'BitTasker',
					id: window.location.hostname
				},
				user: {
					id: packedKeysBase64,
					name: passkeyUserName,
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
		} else {
			// Generate unique credential ID for this mobile passkey
			credentialId = credId ? credId : generateCredentialId();

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
			}).catch(async (err) => {
				console.error('Failed to set native biometrics:', err);
				throw new Error(await handleBiometricError(err, 'mobile-native'));
			});
		}

		if (!credentialId) {
			throw new Error('No credential ID found');
		}

		// Return credential ID like WebAuthn does
		return credentialId;
	} catch (err) {
		const platform = authMethod === 'passkey' ? 'mobile-webauthn' : 'mobile-native';
		console.error('Failed to set biometric key:', err);
		throw new Error(await handleBiometricError(err, platform));
	}
}

/**
 * Get biometric data using shared unPackKeys format
 * @param authMethod Authentication method: 'biometrics' for native, 'passkey' for WebAuthn
 * @returns Promise<Credentials | null>
 */
export async function getBiometricData(authMethod: 'biometrics' | 'passkey' = 'biometrics', checkNpub: boolean = false): Promise<Credentials | null> {
	try {
		const deviceId = await getDeviceIdentifier();

		// Force WebAuthn if authMethod is 'passkey'
		if (authMethod === 'passkey') {
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
				const { masterKeyData, legacyEncryptedData, isLegacyFormat } = await authService.getMasterKeyEncryptedData(publicKey, deviceId, credentials.id, deviceName);

				if (!isLegacyFormat && masterKeyData) {
					return {
						username: publicKey,
						password: JSON.stringify({
							key: exportedKey,
							masterKeyData: masterKeyData,
							data: masterKeyData.nostr.encrypted.data,
							iv: masterKeyData.nostr.encrypted.iv,
							authTag: masterKeyData.nostr.encrypted.authTag,
							salt: masterKeyData.nostr.salt
						}),
						server: deviceId,
						isLegacyFormat: false
					};
				} else if (isLegacyFormat && legacyEncryptedData) {
					return {
						username: publicKey,
						password: JSON.stringify({
							key: exportedKey,
							data: legacyEncryptedData.encryptedPrivateKey,
							iv: legacyEncryptedData.iv,
							authTag: legacyEncryptedData.authTag,
							salt: legacyEncryptedData.salt
						}),
						server: deviceId,
						isLegacyFormat: true
					};
				} else {
					throw new Error('No encrypted data found');
				}
			} catch (error) {
				console.warn('Master key not available, falling back to legacy:', error);
				const { encryptedPrivateKey, iv, authTag, salt } = await authService.getEncryptedKey(publicKey, deviceId, credentials.id, deviceName);

				if (!encryptedPrivateKey) {
					throw new Error('No encrypted data found');
				}

				return {
					username: publicKey,
					password: JSON.stringify({ key: exportedKey, data: encryptedPrivateKey, iv, authTag, salt }),
					server: deviceId,
					isLegacyFormat: true
				};
			}
		} else {
			// Use native biometrics
			const verified = await verifyIdentity();
			if (!verified) return null;

			const credentials = await NativeBiometric.getCredentials({
				server: deviceId
			});

			// Parse the stored credential data
			const credentialData = JSON.parse(credentials.password);
			const packedKeysBase64 = credentialData.keys;
			const credentialId = credentialData.credentialId;

			// Use unPackKeysMobile to properly decode the base64url string
			const unpackedKeys = unPackKeysMobile(packedKeysBase64);

			const deviceName = await createUserDeviceShortName(unpackedKeys.publicKey);

			// Try to get master key encrypted data first, fallback to legacy
			try {
				const { masterKeyData, legacyEncryptedData, isLegacyFormat } =
					await authService.getMasterKeyEncryptedData(
						unpackedKeys.publicKey,
						deviceId,
						credentialId,
						deviceName
					);

				if (!isLegacyFormat && masterKeyData) {
					// New master key format
					return {
						username: unpackedKeys.publicKey,
						password: JSON.stringify({
							key: masterKeyData.exportedMasterKey, // TODO: To be replaced with unpackedKeys.exportedKey once all legacy users update their passkeys
							masterKeyData: masterKeyData,
							// Legacy compatibility fields
							data: masterKeyData.nostr.encrypted.data,
							iv: masterKeyData.nostr.encrypted.iv,
							authTag: masterKeyData.nostr.encrypted.authTag,
							salt: masterKeyData.nostr.salt
						}),
						server: deviceId,
						isLegacyFormat: false
					};
				} else if (isLegacyFormat && legacyEncryptedData) {
					// Legacy format
					return {
						username: unpackedKeys.publicKey,
						password: JSON.stringify({
							key: unpackedKeys.exportedKey,
							data: legacyEncryptedData.encryptedPrivateKey,
							iv: legacyEncryptedData.iv,
							authTag: legacyEncryptedData.authTag,
							salt: legacyEncryptedData.salt
						}),
						server: deviceId,
						isLegacyFormat: true
					};
				} else {
					throw new Error('No encrypted data found');
				}
			} catch (error) {
				// Fallback to legacy method if master key endpoint doesn't exist yet
				console.warn('Master key, falling back to legacy:', error);
				const { encryptedPrivateKey, iv, authTag, salt } = await authService.getEncryptedKey(
					unpackedKeys.publicKey,
					deviceId,
					credentialId,
					deviceName
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
					server: deviceId,
					isLegacyFormat: true
				};
			}
		}
	} catch (err) {
		const platform = authMethod === 'passkey' ? 'mobile-webauthn' : 'mobile-native';

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
