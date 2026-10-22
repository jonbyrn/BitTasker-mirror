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
import { storedPasskeyCredentialId } from '$lib/utils/helpers/login-method';
import { loginPrfInput } from '$lib/wallet/unlockWithPrf';
import {
	createWebAuthnCredential,
	passkeyCreateErrorName
} from '$lib/utils/helpers/webauthn-create';

const CHALLENGE_TTL_MS = 50_000;
const CHALLENGE_POOL_MAX = 2;
const CHALLENGE_FETCH_MS = 8_000;
let challengePool: { value: string; at: number }[] = [];
let fillTask: Promise<void> | null = null;
let lastChallengeFailure: 'network' | 'api' | null = null;

/** Why the last challenge fetch failed. Null when the pool holds a fresh challenge. */
export function passkeyChallengeFailure(): 'network' | 'api' | null {
	return lastChallengeFailure;
}

function freshChallenges(): { value: string; at: number }[] {
	const now = Date.now();
	challengePool = challengePool.filter((item) => now - item.at < CHALLENGE_TTL_MS);
	return challengePool;
}

async function fetchChallenge(): Promise<string> {
	const deadline = Date.now() + CHALLENGE_FETCH_MS;
	const base = String(import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
	if (base && typeof fetch === 'function') {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
		try {
			const response = await fetch(`${base}/api/v1/auth/challenge?_cb=${Date.now()}`, {
				signal: controller.signal,
				headers: { Accept: 'application/json' }
			});
			if (response.ok) {
				const body = (await response.json()) as { challenge?: unknown };
				if (typeof body?.challenge === 'string' && body.challenge) {
					lastChallengeFailure = null;
					return body.challenge;
				}
			} else if (response.status >= 500) {
				lastChallengeFailure = 'api';
				throw new Error('Auth service unavailable');
			}
		} catch (err) {
			if (lastChallengeFailure === 'api') throw err;
			lastChallengeFailure = 'network';
		} finally {
			clearTimeout(timer);
		}
	}
	const left = deadline - Date.now();
	if (left <= 0) {
		lastChallengeFailure = lastChallengeFailure ?? 'network';
		throw new Error('Network error occurred. Please check your connection');
	}
	try {
		const result = await Promise.race([
			authService.getChallenge(),
			new Promise<never>((_, reject) => {
				setTimeout(
					() => reject(new Error('Network error occurred. Please check your connection')),
					left
				);
			})
		]);
		if (!result?.challenge) throw new Error('Invalid biometric challenge received from server.');
		lastChallengeFailure = null;
		return result.challenge;
	} catch (err) {
		const status =
			(err as { status?: number }).status ??
			(err as { response?: { status?: number } }).response?.status;
		lastChallengeFailure = typeof status === 'number' && status >= 500 ? 'api' : 'network';
		throw err;
	}
}

async function fillChallenges(): Promise<void> {
	try {
		while (freshChallenges().length < CHALLENGE_POOL_MAX) {
			const value = await fetchChallenge();
			freshChallenges().push({ value, at: Date.now() });
		}
	} catch {
		// The next tap asks again. A click must not wait on this.
	}
}

/** Fetch a WebAuthn challenge before the click so credentials.get stays inside the user gesture. */
export function prefetchPasskeyChallenge(): Promise<void> {
	if (!fillTask) {
		fillTask = fillChallenges().finally(() => {
			fillTask = null;
		});
	}
	return fillTask;
}

function takeWarmedChallenge(): string | null {
	const next = freshChallenges().shift();
	if (!next) return null;
	prefetchPasskeyChallenge();
	return next.value;
}

/** A challenge fetched before the click, so credentials.create can run in that click. */
export function takePasskeyChallenge(): string | null {
	return takeWarmedChallenge();
}

/** The next warmed challenge, without consuming it. */
export function peekPasskeyChallenge(): string | null {
	return freshChallenges()[0]?.value ?? null;
}

/**
 * One registration challenge, fetched before credentials.create.
 * Fails within 8 seconds instead of waiting on the auth client.
 */
export function loadRegistrationChallenge(): Promise<string> {
	return fetchChallenge();
}

/**
 * An empty allow list asks for a discoverable credential. Chrome and Bitwarden
 * then wait out the timeout with no window when the passkey is not discoverable.
 * The id saved at registration names the passkey, so the window can open.
 */
function allowList(
	allowCredentials: PublicKeyCredentialDescriptorJSON[]
): PublicKeyCredentialDescriptorJSON[] {
	const listed = allowCredentials.length
		? allowCredentials
		: storedPasskeyCredentialId()
			? [{ id: storedPasskeyCredentialId(), type: 'public-key' as const }]
			: [];
	return listed.filter((cred) => {
		try {
			credentialIdBytes(cred.id);
			return true;
		} catch {
			return false;
		}
	});
}

function passkeyRetry(): DOMException {
	prefetchPasskeyChallenge();
	return new DOMException('Tap again to approve your passkey', 'PasskeyNotReadyError');
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
	return fetchChallenge();
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
	allowCredentials: PublicKeyCredentialDescriptorJSON[],
	requestPrf = false
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
		})),
		...(requestPrf
			? { extensions: { prf: { eval: { first: loginPrfInput() } } } }
			: {})
	};
}

function readPrfOutput(credential: PublicKeyCredential): ArrayBuffer | null {
	const results = credential.getClientExtensionResults?.() as
		| { prf?: { results?: { first?: ArrayBuffer } } }
		| undefined;
	const first = results?.prf?.results?.first;
	return first && first.byteLength > 0 ? first : null;
}

interface EarlyAssertion {
	challenge: string;
	credential: Promise<Credential | null>;
}

/**
 * Call navigator.credentials.get in this turn. A later await loses the click,
 * and the browser then shows no passkey window.
 * This does not pre-open a dialog. getBiometricData calls it once per action
 * and reuses that promise while the dialog is still open.
 */
function startAssertionIfWarm(
	allowCredentials: PublicKeyCredentialDescriptorJSON[],
	signal?: AbortSignal,
	requestPrf = false
): EarlyAssertion | null {
	if (typeof window === 'undefined' || !navigator.credentials?.get) return null;
	const isNative = Capacitor.isNativePlatform();
	const isTestEnv = '__PLAYWRIGHT_TEST__' in window && window.__PLAYWRIGHT_TEST__ === true;
	if (isNative && !isTestEnv) return null;
	const challenge = takeWarmedChallenge();
	if (!challenge) return null;
	beginPasskeyPrompt();
	const credential = navigator.credentials.get({
		publicKey: assertionOptions(challenge, allowList(allowCredentials), requestPrf),
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

		// A challenge has to already be in hand. Fetching it here waits out the user
		// gesture, so the passkey prompt opens late and then times out.
		const _challenge = challenge || takePasskeyChallenge();
		if (!_challenge) {
			prefetchPasskeyChallenge();
			if (passkeyChallengeFailure() === 'api') {
				const unavailable = new Error('Auth service unavailable');
				(unavailable as Error & { status: number }).status = 503;
				throw unavailable;
			}
			throw new DOMException(
				'Network error occurred. Please check your connection',
				'NetworkError'
			);
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
 * Single-flight mutex: one Unlock shares one credentials.get.
 * A second caller reuses the pending promise instead of opening another dialog.
 */
let pendingBiometricRequest: Promise<Credentials | null> | null = null;
let assertionAbort: AbortController | null = null;
let gate: Promise<Credentials | null> | null = null;
let liveAssertion: {
	startedAt: number;
	pending: boolean;
	promise: Promise<Credentials | null>;
} | null = null;

/** Drop a hung WebAuthn request so the next click can open the dialog. */
export function cancelPasskeyPrompt(): void {
	assertionAbort?.abort();
	assertionAbort = null;
	pendingBiometricRequest = null;
	liveAssertion = null;
	gate = null;
}

/**
 * Get biometric data using shared unPackKeys format
 * @param checkNpub For already logged in users check biometric npub against localStorage npub
 * @returns Promise<Credentials | null>
 */
export function getBiometricData(
	checkNpub: boolean = false,
	allowCredentials: PublicKeyCredentialDescriptorJSON[] = [],
	signal?: AbortSignal,
	options?: { requestPrf?: boolean }
): Promise<Credentials | null> {
	if (signal?.aborted) {
		return Promise.reject(new DOMException('unlock cancelled, tap to retry', 'AbortError'));
	}
	// One action, one dialog. A later Unlock while this is open joins it.
	// Do not abort and start another credentials.get.
	if (gate) return gate;

	let settle!: (value: Credentials | null) => void;
	let fail!: (reason: unknown) => void;
	const shell = new Promise<Credentials | null>((resolve, reject) => {
		settle = resolve;
		fail = reject;
	});
	// Reserve before credentials.get so a re-entrant call cannot open a second dialog.
	const shared = shell.finally(() => {
		if (gate === shared) gate = null;
	});
	gate = shared;

	const controller = new AbortController();
	assertionAbort = controller;
	if (signal) {
		signal.addEventListener('abort', () => controller.abort(), { once: true });
	}
	const named = allowList(allowCredentials);
	const requestPrf = options?.requestPrf === true;
	const early = startAssertionIfWarm(named, controller.signal, requestPrf);
	const run = executeBiometricData(checkNpub, named, signal, early, requestPrf);
	pendingBiometricRequest = run;
	if (early) {
		liveAssertion = { startedAt: Date.now(), pending: true, promise: shared };
	}
	void run.then(
		(value) => {
			if (pendingBiometricRequest === run) pendingBiometricRequest = null;
			if (liveAssertion?.promise === shared) liveAssertion = null;
			settle(value);
		},
		(error: unknown) => {
			if (pendingBiometricRequest === run) pendingBiometricRequest = null;
			if (liveAssertion?.promise === shared) liveAssertion = null;
			fail(error);
		}
	);
	return shared;
}

async function executeBiometricData(
	checkNpub: boolean,
	allowCredentials: PublicKeyCredentialDescriptorJSON[],
	signal?: AbortSignal,
	early: EarlyAssertion | null = null,
	requestPrf = false
): Promise<Credentials | null> {
	try {
		// Platform-aware: skip Capacitor plugin in browser/CDP environments
		const isNative = Capacitor.isNativePlatform();
		const isTestEnv =
			typeof window !== 'undefined' &&
			'__PLAYWRIGHT_TEST__' in window &&
			window.__PLAYWRIGHT_TEST__;

		if (!isNative || isTestEnv) {
			// Waiting for a challenge here leaves the click, so the browser shows no
			// window and then times out. Ask again once a challenge is ready.
			if (!early) {
				prefetchPasskeyChallenge();
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
				challenge: challenge,
				prfOutput: readPrfOutput(pubKeyCred)
			};
		}

		// Native Capacitor environment: use Capacitor WebAuthn plugin
		const { value: webAuthnAvailable } = await Webauthn.isWebAuthnAvailable();
		if (!webAuthnAvailable) {
			dbg.log('setBiometricKey: no WebAuthn support');
			throw new Error('WebAuthn is not available');
		}

		const challenge = await nextChallenge();
		beginPasskeyPrompt();
		const challengeBuffer = challenge.replace(/-/g, '+').replace(/_/g, '/');

		const options = {
			challenge: challengeBuffer,
			timeout: 60000,
			userVerification: 'required',
			rpId: window.location.hostname,
			allowCredentials,
			...(requestPrf ? { extensions: { prf: { eval: { first: loginPrfInput() } } } } : {})
		} as PublicKeyCredentialRequestOptionsJSON;
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

		const nativePrf = (
			credentials as {
				clientExtensionResults?: { prf?: { results?: { first?: ArrayBuffer } } };
			}
		).clientExtensionResults?.prf?.results?.first;
		return {
			npub: publicKey,
			exportedKey,
			credentialId: credentials.id,
			response: credentials.response,
			challenge: challenge,
			prfOutput: nativePrf && nativePrf.byteLength > 0 ? nativePrf : null
		};
	} catch (err) {
		if (err instanceof DOMException && err.name === 'PasskeyNotReadyError') throw err;
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
