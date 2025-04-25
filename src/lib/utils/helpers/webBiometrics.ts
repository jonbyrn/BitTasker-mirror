/**
 * WebAuthentication (WebAuthn) implementation for web-based biometric authentication
 * This provides similar functionality to the Capacitor Native Biometric features
 * but uses the browser's WebAuthn API for web platforms
 */

import type { Credentials, BiometricVerifyOptions, EncryptionData } from '$lib/types/auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

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
        requireResidentKey: false
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
function generateChallenge(): Uint8Array {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    return arr;
}

/**
 * Convert string to ArrayBuffer
 */
function stringToArrayBuffer(str: string): Uint8Array {
    const encoder = new TextEncoder();
    return encoder.encode(str);
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
function base64ToArrayBuffer(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
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
 * Verify user identity using WebAuthn
 */
export async function verifyIdentity(options: BiometricVerifyOptions = WEBAUTHN_VERIFY_OPTIONS): Promise<boolean> {
    try {
        if (!await checkWebBiometricAvailability()) {
            throw new Error('WebAuthn is not available on this device');
        }

        // Get the stored credential ID
        const { value: credentialId } = await Preferences.get({
            key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
        });

        if (!credentialId) {
            console.error('No WebAuthn credential found. Please register first.');
            return false;
        }

        // Create authentication options
        const authOptions: PublicKeyCredentialRequestOptions = {
            challenge: generateChallenge(),
            timeout: WEBAUTHN_VERIFY_OPTIONS.timeout,
            userVerification: WEBAUTHN_VERIFY_OPTIONS.userVerification,
            allowCredentials: [{
                id: base64ToArrayBuffer(credentialId),
                type: 'public-key'
            }]
        };

        // Request authentication
        const credential = await navigator.credentials.get({
            publicKey: authOptions
        }) as PublicKeyCredential;

        if (!credential) {
            return false;
        }

        return true;
    } catch (err) {
        console.error('Biometric verification failed:', err);
        return false;
    }
};

/**
 * Register WebAuthn credential and store encrypted data
 */
export async function setWebBiometricKey(
    publicKey: string,
    encryptionData: EncryptionData
): Promise<boolean> {
    try {
        console.log('Setting WebAuthn key');
        if (!await checkWebBiometricAvailability()) {
            throw new Error('WebAuthn is not available on this device');
        }

        // Create user info for WebAuthn
        const userId = await generateDeviceKey();

        // Create registration options
        const registrationOptions: PublicKeyCredentialCreationOptions = {
            challenge: generateChallenge(),
            rp: {
                name: 'BitTasker',
                id: window.location.hostname
            },
            user: {
                id: stringToArrayBuffer(userId),
                name: publicKey,
                displayName: 'BitTasker User'
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 }, // ES256
                { type: 'public-key', alg: -257 } // RS256
            ],
            timeout: 60000,
            attestation: WEBAUTHN_VERIFY_OPTIONS.attestation,
            authenticatorSelection: WEBAUTHN_VERIFY_OPTIONS.authenticatorSelection
        };

        // Create credential
        const credential = await navigator.credentials.create({
            publicKey: registrationOptions
        }) as PublicKeyCredential;

        const { value: currentCredentials } = await Preferences.get({
            key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
        });

        if (currentCredentials) {
            await Preferences.remove({ key: currentCredentials });
            await Preferences.remove({ key: `webAuthn_${currentCredentials}` });
        }

        // Store credential ID for future authentication
        const credentialId = arrayBufferToBase64((credential.rawId));
        await Preferences.set({
            key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID,
            value: credentialId
        })

        // Store the encrypted data
        await Preferences.set({
            key: `webAuthn_${credentialId}`,
            value: JSON.stringify({
                username: publicKey,
                password: JSON.stringify(encryptionData),
                server: userId
            })
        });

        return true;
    } catch (err) {
        console.error('Failed to set biometric key:', err);
        return false;
    }
}

/**
 * Get stored credentials after biometric verification
 */
export async function getWebBiometricData(): Promise<Credentials | null> {
    try {
        const verified = await verifyIdentity();
        if (!verified) return null;

        const { value: credentialId } = await Preferences.get({
            key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
        });

        if (!credentialId) {
            return null;
        }

        const { value: storedData } = await Preferences.get({
            key: `webAuthn_${credentialId}`
        });

        if (!storedData) return null;

        return JSON.parse(storedData) as Credentials;
    } catch (err) {
        console.error('Failed to get biometric key:', err);
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