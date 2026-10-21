import type { Credentials } from '$lib/types/auth';
import {
	Webauthn,
	type PublicKeyCredentialCreationOptionsJSON,
	type PublicKeyCredentialDescriptorJSON,
	type PublicKeyCredentialRequestOptionsJSON
} from 'capacitor-webauthn';
import { handleBiometricError } from './biometricErrorHandler';
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
import { createDebug } from '$lib/utils/debug';
const dbg = createDebug('auth:biometrics');
import authService from '$lib/api/services/auth.service';
import { beginPasskeyPrompt, endPasskeyPrompt } from '$lib/utils/helpers/passkey-prompt';
import {
	createWebAuthnCredential,
	passkeyCreateErrorName
} from '$lib/utils/helpers/webauthn-create';

const CHALLENGE_TTL_MS = 50_000;
let warmedChallenge: { value: string; at: number } | null = null;

/** Fetch a WebAuthn challenge before the click so credentials.get stays inside the user gesture. */
export function prefetchPasskeyChallenge(): void {
	if (warmedChallenge && Date.now() - warmedChallenge.at < CHALLENGE_TTL_MS) return;
	void authService
		.getChallenge()
		.then(({ challenge }) => {
			if (challenge) warmedChallenge = { value: challenge, at: Date.now() };
		})
		.catch(() => undefined);
}

function takeWarmedChallenge(): string | null {
	if (!warmedChallenge || Date.now() - warmedChallenge.at >= CHALLENGE_TTL_MS) return null;
	const value = warmedChallenge.value;
	warmedChallenge = null;
	prefetchPasskeyChallenge();
	return value;
}

/** Keep a challenge that was fetched too late for this click, so the next tap can prompt. */
function storeWarmChallenge(value: string): void {
	if (!value) return;
	warmedChallenge = { value, at: Date.now() };
}

function passkeyRetry(): DOMException {
	prefetchPasskeyChallenge();
	return new DOMException('unlock cancelled, tap to retry', 'NotAllowedError');
}

if (
	typeof window !== 'undefined' &&
	import.meta.env.MODE !== 'test' &&
	import.meta.env.VITEST !== 'true'
) {
	prefetchPasskeyChallenge();
}

async function nextChallenge(): Promise<string> {
	const warm = takeWarmedChallenge();
	if (warm) return warm;
	const { challenge } = await authService.getChallenge();
	if (!challenge) throw new Error('Invalid biometric challenge received from server.');
	return challenge;
}

function challengeBytes(challenge: string): ArrayBuffer {
	const challengeBase64 = challenge.replace(/-/g, '+').replace(/_/g, '/');
	const padded = challengeBase64 + '='.repeat((4 - (challengeBase64.length % 4)) % 4);
	return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)).buffer;
}

function credentialIdBytes(id: string): ArrayBuffer {
	const base64 = id.replace(/-/g, '+').replace(/_/g, '/');
	const paddedStr = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
	const binary = atob(paddedStr);
	const buffer = new ArrayBuffer(binary.length);
	const view = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
	return buffer;
}

function assertionOptions(
	challenge: string,
	allowCredentials: PublicKeyCredentialDescriptorJSON[]
): PublicKeyCredentialRequestOptions {
	return {
		challenge: challengeBytes(challenge),
		timeout: 60000,
		userVerification: 'required',
		rpId: window.location.hostname,
		allowCredentials: allowCredentials.map((cred) => ({
			...cred,
			transports: cred.transports as AuthenticatorTransport[] | undefined,
			id: credentialIdBytes(cred.id)
		}))
	};
}

interface EarlyAssertion {
	challenge: string;
	credential: Promise<Credential | null>;
}

/**
 * Call navigator.credentials.get in this turn. A later await loses the click,
 * and the browser then shows no passkey window.
 */
function startAssertionIfWarm(
	allowCredentials: PublicKeyCredentialDescriptorJSON[],
	signal?: AbortSignal
): EarlyAssertion | null {
	if (typeof window === 'undefined' || !navigator.credentials?.get) return null;
	const isNative = Capacitor.isNativePlatform();
	const isTestEnv = '__PLAYWRIGHT_TEST__' in window && window.__PLAYWRIGHT_TEST__ === true;
	if (isNative && !isTestEnv) return null;
	const challenge = takeWarmedChallenge();
	if (!challenge) return null;
	beginPasskeyPrompt();
	const credential = navigator.credentials.get({
		publicKey: assertionOptions(challenge, allowCredentials),
		signal
	});
	return { challenge, credential: credential as Promise<Credential | null> };
}

export const checkNativePlatform = (): boolean => {
	const isNative = Capacitor.isNativePlatform();
	return isNative;
};

export const checkBiometricAvailability = async (): Promise<boolean> => {
	dbg.log('checkBiometricAvailability: isNative=%s', Capacitor.isNativePlatform());
	// On native mobile, use Capacitor plugin
	if (Capacitor.isNativePlatform()) {
		try {
			const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
			dbg.log('checkBiometricAvailability: Capacitor WebAuthn available=%s', webAuthnAvailable);
			return webAuthnAvailable;
		} catch (err) {
			dbg.error('checkBiometricAvailability: Capacitor check failed', err);
			return false;
		}
	}

	// On web (browser), use native WebAuthn API directly
	// CDP virtual authenticators and platform authenticators both work
	if (
		typeof window !== 'undefined' &&
		typeof window.PublicKeyCredential !== 'undefined' &&
		navigator.credentials?.create !== undefined
	) {
		dbg.log('checkBiometricAvailability: native WebAuthn API available, returning true');
		return true;
	}

	dbg.log('checkBiometricAvailability: no WebAuthn support found');
	return false;
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

		// Determine WebAuthn path: native mobile or web browser
		let useNativeWebAuthn = false;
		if (Capacitor.isNativePlatform()) {
			// Native mobile: use Capacitor WebAuthn plugin
			try {
				const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
				if (!webAuthnAvailable) throw new Error('Capacitor WebAuthn not available');
			} catch {
				throw new Error('WebAuthn is not available on this device');
			}
		} else {
			// Web browser: use native navigator.credentials API directly
			// Works with CDP virtual authenticators and platform authenticators
			if (
				typeof window !== 'undefined' &&
				typeof window.PublicKeyCredential !== 'undefined' &&
				navigator.credentials?.create !== undefined
			) {
				useNativeWebAuthn = true;
				dbg.log('setBiometricKey: using native WebAuthn path (non-Capacitor)');
			} else {
				dbg.log('setBiometricKey: no WebAuthn support');
				throw new Error('WebAuthn is not available');
			}
		}

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
		if (!_challenge) {
			throw new Error('Invalid biometric challenge received from server.');
		}

		// Helper to convert base64url string to ArrayBuffer
		const base64urlToBuffer = (base64url: string): ArrayBuffer => {
			const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
			const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
			const binary = atob(padded);
			const buffer = new ArrayBuffer(binary.length);
			const view = new Uint8Array(buffer);
			for (let i = 0; i < binary.length; i++) view[i] = binary.charCodeAt(i);
			return buffer;
		};

		// Helper to convert ArrayBuffer to base64url string
		const bufferToBase64url = (buffer: ArrayBuffer): string => {
			const bytes = new Uint8Array(buffer);
			let binary = '';
			for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
			return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
		};

		let passkeyPubkey = '';
		let clientDataJSON = '';
		let attestationObjectB64 = '';

		if (useNativeWebAuthn) {
			// Use native browser WebAuthn API (works with CDP virtual authenticators)
			dbg.log(
				'setBiometricKey: about to call navigator.credentials.create with rpId=%s',
				window.location.hostname
			);
			const nativeOptions: PublicKeyCredentialCreationOptions = {
				challenge: base64urlToBuffer(_challenge),
				rp: {
					name: 'BitTasker',
					id: window.location.hostname
				},
				user: {
					id: base64urlToBuffer(packedKeysBase64),
					name: displayName,
					displayName: name
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				timeout: 60000,
				attestation: 'none',
				authenticatorSelection: {
					userVerification: 'required',
					requireResidentKey: true,
					residentKey: 'required'
				}
			};

			const credential = await createWebAuthnCredential(nativeOptions);
			if (!credential) throw new Error('No credential returned from WebAuthn');

			credentialId = credential.id;
			const pubCred = credential as PublicKeyCredential;
			passkeyPubkey = bufferToBase64url(pubCred.rawId);
			clientDataJSON = bufferToBase64url(
				(pubCred.response as AuthenticatorAttestationResponse).clientDataJSON as ArrayBuffer
			);
			attestationObjectB64 = bufferToBase64url(
				(pubCred.response as AuthenticatorAttestationResponse).attestationObject as ArrayBuffer
			);

			// Try to extract public key from attestation object
			const pubKeyBytes = extractPublicKeyFromAttestationObject(attestationObjectB64);
			if (pubKeyBytes) {
				passkeyPubkey = Array.from(pubKeyBytes)
					.map((b: number) => b.toString(16).padStart(2, '0'))
					.join('');
			}

			return {
				credentialId,
				passkeyPubkey,
				clientDataJSON,
				attestationObject: attestationObjectB64,
				challenge: _challenge
			};
		} else {
			// Use Capacitor WebAuthn plugin (native mobile)
			const registrationOptions: PublicKeyCredentialCreationOptionsJSON = {
				challenge: _challenge,
				rp: {
					name: 'BitTasker',
					id: window.location.hostname
				},
				user: {
					id: packedKeysBase64,
					name: displayName,
					displayName: name
				},
				pubKeyCredParams: [
					{ type: 'public-key', alg: -7 },
					{ type: 'public-key', alg: -257 }
				],
				timeout: 60000,
				attestation: 'none',
				authenticatorSelection: {
					userVerification: 'required',
					requireResidentKey: true,
					residentKey: 'required'
				}
			};

			const result = await Webauthn.startRegistration(registrationOptions);

			credentialId = result.id;
			if (!credentialId) throw new Error('No credential ID found');

			const response = result.response;
			if (response.publicKey) {
				if (typeof response.publicKey === 'string') {
					passkeyPubkey = response.publicKey;
				} else {
					const publicKeyBytes = new Uint8Array(response.publicKey);
					passkeyPubkey = Array.from(publicKeyBytes)
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('');
				}
			} else {
				const publicKeyBytes = extractPublicKeyFromAttestationObject(response.attestationObject);
				if (publicKeyBytes) {
					passkeyPubkey = Array.from(publicKeyBytes)
						.map((b) => b.toString(16).padStart(2, '0'))
						.join('');
				}
			}

			return {
				credentialId,
				passkeyPubkey,
				clientDataJSON: response.clientDataJSON,
				attestationObject: response.attestationObject,
				challenge: _challenge
			};
		}
	} catch (err) {
		console.error('Failed to set biometric key:', err);
		const message = await handleBiometricError(err, 'mobile-webauthn');
		const wrapped = new Error(message || 'Passkey setup failed');
		const kind = passkeyCreateErrorName(err);
		if (kind) wrapped.name = kind;
		throw wrapped;
	}
}

/**
 * Single-flight mutex: concurrent callers share one passkey prompt
 * instead of racing and hitting "A request is already pending".
 */
let pendingBiometricRequest: Promise<Credentials | null> | null = null;
let assertionAbort: AbortController | null = null;

/** Drop a hung WebAuthn request so the next click can open the dialog. */
export function cancelPasskeyPrompt(): void {
	assertionAbort?.abort();
	assertionAbort = null;
	pendingBiometricRequest = null;
}

/**
 * Get biometric data using shared unPackKeys format
 * @param checkNpub For already logged in users check biometric npub against localStorage npub
 * @returns Promise<Credentials | null>
 */
export async function getBiometricData(
	checkNpub: boolean = false,
	allowCredentials: PublicKeyCredentialDescriptorJSON[] = [],
	signal?: AbortSignal
): Promise<Credentials | null> {
	if (signal?.aborted) throw new DOMException('unlock cancelled, tap to retry', 'AbortError');
	// A click must not join a request that already missed its user gesture.
	// That request sits for the WebAuthn timeout and never opens a dialog.
	cancelPasskeyPrompt();

	const controller = new AbortController();
	assertionAbort = controller;
	if (signal) {
		signal.addEventListener('abort', () => controller.abort(), { once: true });
	}
	const early = startAssertionIfWarm(allowCredentials, controller.signal);
	const run = executeBiometricData(checkNpub, allowCredentials, signal, early);
	pendingBiometricRequest = run;

	try {
		return await run;
	} finally {
		if (pendingBiometricRequest === run) {
			pendingBiometricRequest = null;
		}
	}
}

async function executeBiometricData(
	checkNpub: boolean,
	allowCredentials: PublicKeyCredentialDescriptorJSON[],
	signal?: AbortSignal,
	early: EarlyAssertion | null = null
): Promise<Credentials | null> {
	if (!early) beginPasskeyPrompt();
	try {
		// Platform-aware: skip Capacitor plugin in browser/CDP environments
		const isNative = Capacitor.isNativePlatform();
		const isTestEnv =
			typeof window !== 'undefined' &&
			'__PLAYWRIGHT_TEST__' in window &&
			window.__PLAYWRIGHT_TEST__;

		if (!isNative || isTestEnv) {
			// credentials.get after await is outside the click, so Bitwarden never opens
			// and the browser waits out the 60s timeout.
			if (!early) {
				const challenge = await nextChallenge();
				storeWarmChallenge(challenge);
				throw passkeyRetry();
			}
			const challenge = early.challenge;
			const credential = await early.credential;
			if (!credential) throw new Error('No credentials found');

			const pubKeyCred = credential as PublicKeyCredential;
			const response = pubKeyCred.response as AuthenticatorAssertionResponse;
			if (!response.userHandle) {
				console.error('No user handle in credential response');
				throw new Error('No user handle in credential response');
			}

			// Convert ArrayBuffer to base64url string (same format as packKeysMobile outputs)
			const userHandleBytes = new Uint8Array(response.userHandle);
			let binary = '';
			for (let i = 0; i < userHandleBytes.length; i++)
				binary += String.fromCharCode(userHandleBytes[i]);
			const packedKeysBase64 = btoa(binary)
				.replace(/\+/g, '-')
				.replace(/\//g, '_')
				.replace(/=/g, '');
			const unpackedKeys = unPackKeysMobile(packedKeysBase64);
			const publicKey = unpackedKeys.publicKey;
			const exportedKey = unpackedKeys.exportedKey;

			if (checkNpub) {
				const { value: storedNpub } = await Preferences.get({ key: StorageKeys.NPUB });
				if (storedNpub !== publicKey) {
					throw new Error(
						'Passkey mismatch: Please select the correct one linked to this account.'
					);
				}
			}

			// Helper to convert ArrayBuffer to base64url string
			const toBase64url = (buf: ArrayBuffer): string => {
				const bytes = new Uint8Array(buf);
				let binary = '';
				for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
				return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
			};

			// Convert all ArrayBuffer fields to base64url strings for backend validation
			return {
				npub: publicKey,
				exportedKey,
				credentialId: pubKeyCred.id,
				response: {
					authenticatorData: toBase64url(response.authenticatorData),
					clientDataJSON: toBase64url(response.clientDataJSON),
					signature: toBase64url(response.signature),
					userHandle: packedKeysBase64
				},
				challenge: challenge
			};
		}

		// Native Capacitor environment: use Capacitor WebAuthn plugin
		const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
		if (!webAuthnAvailable) {
			dbg.log('setBiometricKey: no WebAuthn support');
			throw new Error('WebAuthn is not available');
		}

		const challenge = await nextChallenge();
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
	} catch (err) {
		if (
			err instanceof DOMException &&
			(err.name === 'NotAllowedError' || err.name === 'AbortError')
		) {
			throw new DOMException('unlock cancelled, tap to retry', err.name);
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
	} finally {
		endPasskeyPrompt();
	}
}
