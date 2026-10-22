/**
 * Nostr Key Management Module
 *
 * This module provides optimized key retrieval functions with a three-tier caching strategy:
 * 1. In-memory cache (appStore) - fastest, session-scoped
 * 2. Local storage (Preferences) - fast, persistent across sessions
 * 3. Biometric authentication - slowest, requires user interaction
 *
 * Each function progressively fetches only what it needs, avoiding unnecessary decryption
 * operations and biometric prompts.
 */

import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { browser } from '$app/environment';
import type { Credentials } from '$lib/types/auth';
import {
	clearSignerSession,
	mnemonicCached,
	readMnemonicSession,
	readSignerSession,
	saveMnemonicSession,
	saveSignerSession,
	signerCached
} from '$lib/utils/helpers/session-mnemonic';
import { walletUnlockRoute } from '$lib/utils/helpers/login-method';
import { NsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
import { SignerLockedError, passkeyPromptSuppressed } from '$lib/utils/helpers/passkey-prompt';
import { t } from 'svelte-i18n';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { hexToBytes } from '@noble/hashes/utils';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';
import { nip19 } from 'nostr-tools';
import {
	decryptNsecWithBiometrics,
	decryptMasterKeyDataFromBiometrics
} from '$lib/utils/helpers/auth';
import {
	cancelPasskeyPrompt,
	checkBiometricAvailability,
	getBiometricData
} from '$lib/utils/helpers/biometrics';
import authService from '$lib/api/services/auth.service';
import { syncNdkSignerFromAppStore } from '$lib/nostr/ndk';
import { restorePersistedE2EBiometricData } from '$lib/utils/helpers/e2eBiometricState';

/**
 * Internal helper to retrieve biometric credentials
 * Attempts native biometric authentication first, falls back to web-based authentication
 *
 * @returns Credentials object or null if authentication fails
 * @internal
 */
/**
 * After nsec/npub are in `appStore`, wire NDK so subscriptions and gates see `ndk.$currentPubkey`
 * without a second passkey round-trip when another flow already unlocked keys.
 */
async function notifyNdkSignerFromUnlockedKeys(): Promise<void> {
	if (!browser) return;
	await syncNdkSignerFromAppStore();
}

/**
 * Put a login-time secret into memory and the tab session.
 * Later page loads read this instead of calling WebAuthn.
 * Same contract as production master.
 */
export async function rememberUnlockedSecrets(input: {
	nsec: string;
	npub: string;
	mnemonic?: string;
}): Promise<void> {
	const nsec = decodeNsec(input.nsec);
	appStore.update((state) => ({
		...state,
		nostrKeys: {
			...state.nostrKeys,
			nsec,
			npub: input.npub,
			...(input.mnemonic ? { mnemonic: input.mnemonic } : {})
		}
	}));
	await saveSignerSession(input.nsec, input.npub).catch(() => undefined);
	if (input.mnemonic) await saveMnemonicSession(input.mnemonic).catch(() => undefined);
	await notifyNdkSignerFromUnlockedKeys();
}

const getBiometrics = async (): Promise<Credentials | null> => {
	if (walletUnlockRoute() === 'nsec') throw new NsecUnlockRequired();
	const isBiometricAvailable = await checkBiometricAvailability();
	const { value: credentialId } = await Preferences.get({
		key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
	});
	if (isBiometricAvailable) {
		const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentialId
			? [{ id: credentialId, type: 'public-key' }]
			: [];
		return await getBiometricData(true, allowCredentials);
	}
	return null;
};

/**
 * Get Nostr public key (npub)
 *
 * This function uses a three-tier optimization strategy to minimize latency and avoid
 * unnecessary biometric prompts:
 *
 * 1. **Memory cache (appStore):** Check if npub exists in session memory (fastest, no I/O)
 * 2. **Local storage (Preferences):** Check if npub was cached from previous session (fast, local I/O)
 * 3. **Biometric authentication:** If not cached, prompt user for authentication (slow, requires interaction)
 *
 * @throws {Error} If no public key can be retrieved or biometric authentication fails
 *
 * @example
 * ```typescript
 * const npub = await getNpub();
 * console.log('Public key:', npub);
 * ```
 */
export const getNpub = async (): Promise<string> => {
	await restorePersistedE2EBiometricData();
	const currentState = get(appStore);

	if (currentState.nostrKeys.npub) return currentState.nostrKeys.npub;

	const { value } = await Preferences.get({ key: StorageKeys.NPUB });

	if (value) return value;

	if (currentState.biometricData?.npub) {
		const npub = currentState.biometricData.npub;
		appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, npub } }));
		await Preferences.set({ key: StorageKeys.NPUB, value: npub });
		return npub;
	}

	// Reading a public key must not open the password manager. Logged-out
	// callers and a missing cache both get an empty string. Signing uses the
	// session key, and only an explicit unlock calls WebAuthn.
	const { value: accessToken } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
	if (!accessToken) return '';
	return '';
};

/**
 * Get Nostr key pair (both public and private keys)
 *
 * This function retrieves both the private key (nsec) and public key (npub) using an
 * optimized two-tier strategy:
 *
 * 1. **Memory cache (appStore):** Check if both nsec and npub exist in session memory
 * 2. **Biometric authentication + decryption:** If not cached, authenticate and decrypt the private key
 *
 * The private key is encrypted in storage and requires biometric authentication to decrypt.
 * Once decrypted, both keys are cached in memory for the session to avoid repeated decryption.
 *
 * Note: Unlike `getNpub()`, this function cannot use localStorage cache because the private key
 * must remain encrypted at rest. It always requires decryption when not in memory.
 *
 * @returns Object containing both nsec (Uint8Array) and npub (hex string)
 * @throws {Error} If biometric authentication fails or key decryption fails
 *
 * @example
 * ```typescript
 * const { nsec, npub } = await getNostrKeyPair();
 * // Use nsec for signing operations
 * ```
 */
async function rememberSigner(nsec: string, npub: string): Promise<void> {
	await Promise.resolve(saveSignerSession(nsec, npub)).catch(() => undefined);
}

async function rememberMnemonic(mnemonic: string): Promise<void> {
	await Promise.resolve(saveMnemonicSession(mnemonic)).catch(() => undefined);
}

/** True when a routine signature can be made without WebAuthn. */
export function signerReady(): boolean {
	const current = get(appStore);
	if (current.nostrKeys.nsec && current.nostrKeys.npub) return true;
	const biometric = current.biometricData;
	if (biometric?.encryptedData && biometric.exportedKey && biometric.npub) return true;
	return signerCached();
}

let armedSigner: Promise<{ nsec: Uint8Array; npub: string }> | null = null;

/**
 * User-gesture unlock. Call this as the first synchronous line of a click that
 * will sign. WebAuthn starts in that turn when no key is cached. A warm session
 * does not prompt. Later signing awaits this same promise.
 */
export function prepareSigner(): Promise<{ nsec: Uint8Array; npub: string }> {
	const current = get(appStore);
	if ((current.nostrKeys.nsec && current.nostrKeys.npub) || passkeyPromptSuppressed()) {
		return getNostrKeyPair();
	}
	if (armedSigner) return armedSigner;
	if (walletUnlockRoute() === 'nsec') return getNostrKeyPair();
	const prompt = !signerReady();
	const prompted = prompt ? getBiometricData(true, []) : undefined;
	const pending = (
		prompt ? getNostrKeyPair({ prompt: true, prompted }) : getNostrKeyPair()
	).finally(() => {
		if (armedSigner === pending) armedSigner = null;
	});
	armedSigner = pending;
	return pending;
}

/** The unlock started by the current click, if one is in flight. */
export function takeSignerUnlock(): Promise<{ nsec: Uint8Array; npub: string }> | null {
	return armedSigner;
}

let routineSigner: Promise<{ nsec: Uint8Array; npub: string }> | null = null;

async function loadNostrKeyPair(options?: {
	prompted?: Promise<Credentials | null>;
	prompt?: boolean;
}): Promise<{ nsec: Uint8Array; npub: string }> {
	const currentState = get(appStore);
	if (currentState.nostrKeys.nsec && currentState.nostrKeys.npub) {
		const result = {
			nsec: currentState.nostrKeys.nsec,
			npub: currentState.nostrKeys.npub
		};
		await notifyNdkSignerFromUnlockedKeys();
		return result;
	}

	// E2E test bypass: read keys from localStorage without passkey.
	// Triggered by __PLAYWRIGHT_TEST__ (automated tests) or by __E2E_NSEC__
	// existing in localStorage during development (manual playwright open).
	if (typeof window !== 'undefined') {
		const isPlaywright = '__PLAYWRIGHT_TEST__' in window;
		const isDevE2E = import.meta.env.DEV && localStorage.getItem('__E2E_NSEC__');
		if (isPlaywright || isDevE2E) {
			const testNsec = localStorage.getItem('__E2E_NSEC__');
			const testNpub = localStorage.getItem('__E2E_NPUB__');
			if (testNsec && testNpub) {
				const nsec = decodeNsec(testNsec);
				appStore.update((state) => ({
					...state,
					nostrKeys: { ...state.nostrKeys, nsec, npub: testNpub }
				}));
				await Preferences.set({ key: StorageKeys.NPUB, value: testNpub });
				await notifyNdkSignerFromUnlockedKeys();
				return { nsec, npub: testNpub };
			}
		}
	}

	const cachedSigner = await readSignerSession().catch(() => null);
	if (cachedSigner) {
		const nsec = decodeNsec(cachedSigner.nsec);
		appStore.update((state) => ({
			...state,
			nostrKeys: { ...state.nostrKeys, nsec, npub: cachedSigner.npub }
		}));
		await Preferences.set({ key: StorageKeys.NPUB, value: cachedSigner.npub });
		await notifyNdkSignerFromUnlockedKeys();
		return { nsec, npub: cachedSigner.npub };
	}
	if (signerCached()) {
		await clearSignerSession().catch(() => undefined);
	}

	if (process.env.NODE_ENV === 'development') {
		// const npub = "ceda26d39d2e9aeee53c2a475b6b056145213ec6ac6acdb183357f66f8de76b2";
		// Preferences.set({ key: StorageKeys.NPUB, value: npub });
		// return {
		//     nsec: new Uint8Array([64, 85, 53, 116, 137, 216, 86, 105, 25, 84, 68, 96, 227, 45, 78, 105, 29, 245, 10, 190, 172, 102, 107, 78, 164, 177, 164, 186, 209, 169, 14, 54]),
		//     npub: npub
		// }
	}

	// Restore persisted E2E biometric data before attempting a real passkey prompt
	await restorePersistedE2EBiometricData();
	const currentStateAfterRestore = get(appStore);

	if (currentStateAfterRestore.biometricData) {
		const encryptedData = currentStateAfterRestore.biometricData.encryptedData;
		const exportedKey = currentStateAfterRestore.biometricData.exportedKey;
		let sk: string;
		try {
			sk = await decryptNsecWithBiometrics(encryptedData, exportedKey);
		} catch (err) {
			appStore.update((state) => ({ ...state, biometricData: null }));
			throw err;
		}
		const nsec: Uint8Array = decodeNsec(sk);

		const npub = currentStateAfterRestore.biometricData.npub;
		appStore.update((state) => ({ ...state, nostrKeys: { ...state.nostrKeys, nsec, npub } }));
		await Preferences.set({ key: StorageKeys.NPUB, value: npub });
		await rememberSigner(sk, npub);
		await notifyNdkSignerFromUnlockedKeys();
		return { nsec, npub };
	}

	if (walletUnlockRoute() === 'nsec') throw new NsecUnlockRequired();
	if (!options?.prompt && !options?.prompted) throw new SignerLockedError();

	const credentialData: Credentials | null = options?.prompted
		? await options.prompted
		: await getBiometrics();

	if (!credentialData) throw new Error('No biometric data found');

	const npub = credentialData.npub;
	const exportedKey = credentialData.exportedKey;

	const response = await authService.getPasskeyEncryptedData({
		npub: credentialData.npub,
		challenge: credentialData.challenge,
		credentialId: credentialData.credentialId,
		response: credentialData.response
	});

	if (!response.encryptedData) throw new Error('No encrypted data found');

	const sk = await decryptNsecWithBiometrics(response.encryptedData, exportedKey);
	const nsec: Uint8Array = decodeNsec(sk);

	appStore.update((state) => ({
		...state,
		nostrKeys: {
			...state.nostrKeys,
			nsec,
			npub
		},
		biometricData: {
			npub,
			exportedKey,
			credentialId: credentialData.credentialId,
			encryptedData: response.encryptedData
		}
	}));

	await Preferences.set({ key: StorageKeys.NPUB, value: npub });
	await rememberSigner(sk, npub);
	await notifyNdkSignerFromUnlockedKeys();
	return { nsec, npub };
}

export const getNostrKeyPair = async (options?: {
	prompted?: Promise<Credentials | null>;
	/** Open WebAuthn when every cache misses. Routine callers leave this false. */
	prompt?: boolean;
}): Promise<{ nsec: Uint8Array; npub: string }> => {
	const current = get(appStore);
	if (current.nostrKeys.nsec && current.nostrKeys.npub) {
		await notifyNdkSignerFromUnlockedKeys();
		return { nsec: current.nostrKeys.nsec, npub: current.nostrKeys.npub };
	}
	// The layout and /messages both ask at once. One session read serves both.
	if (!options?.prompt && !options?.prompted) {
		if (!routineSigner) {
			const pending = loadNostrKeyPair(options).finally(() => {
				if (routineSigner === pending) routineSigner = null;
			});
			routineSigner = pending;
		}
		return routineSigner;
	}
	if (routineSigner) {
		try {
			return await routineSigner;
		} catch (error) {
			if (!(error instanceof SignerLockedError)) throw error;
		}
	}
	return loadNostrKeyPair(options);
};

/**
 * Get all cryptographic keys (public key, private key, and mnemonic)
 *
 * This function retrieves the complete set of user keys using an optimized two-tier strategy:
 *
 * 1. **Memory cache (appStore):** Check if all three keys (nsec, npub, mnemonic) exist in session memory
 * 2. **Biometric authentication + master key decryption:** If not cached, authenticate and decrypt the master key data
 *
 * The master key data contains both the private key and mnemonic, both encrypted and requiring
 * biometric authentication to decrypt. This is the most expensive operation as it:
 * - Requires user biometric authentication
 * - Decrypts the master key data structure
 * - Extracts and decodes both nsec and mnemonic
 *
 * All keys are cached in memory after first retrieval to avoid repeated authentication and decryption.
 *
 * @returns Object containing npub (hex string), nsec (Uint8Array), and mnemonic (string)
 * @throws {Error} If biometric authentication fails, decryption fails, or no biometric data found
 *
 * @example
 * ```typescript
 * const { npub, nsec, mnemonic } = await getAllKeys();
 * // Use mnemonic for wallet recovery or backup
 * ```
 */
export const getAllKeys = async (options?: {
	/** Settings export and recovery pass true. Opening a page does not. */
	prompt?: boolean;
}): Promise<{
	npub: string;
	nsec: Uint8Array;
	mnemonic: string;
}> => {
	const currentState = get(appStore);
	const keysInMemory = Boolean(
		currentState.nostrKeys.nsec && currentState.nostrKeys.npub && currentState.nostrKeys.mnemonic
	);
	// Start WebAuthn before any await. A later get is outside the click and shows no dialog.
	const keyLogin = walletUnlockRoute() === 'nsec';
	const armedPrompt =
		!keyLogin &&
		options?.prompt &&
		!keysInMemory &&
		!currentState.biometricData?.encryptedData &&
		!(signerCached() && mnemonicCached())
			? getBiometricData(true, [])
			: null;
	const dropPrompt = () => {
		if (!armedPrompt) return;
		armedPrompt.catch(() => undefined);
		if (typeof cancelPasskeyPrompt === 'function') cancelPasskeyPrompt();
	};

	if (
		currentState.nostrKeys.nsec &&
		currentState.nostrKeys.npub &&
		currentState.nostrKeys.mnemonic
	) {
		const result = {
			npub: currentState.nostrKeys.npub,
			nsec: currentState.nostrKeys.nsec,
			mnemonic: currentState.nostrKeys.mnemonic
		};
		await notifyNdkSignerFromUnlockedKeys();
		return result;
	}

	// E2E test bypass: read keys + mnemonic from localStorage without passkey.
	if (typeof window !== 'undefined') {
		const isPlaywright = '__PLAYWRIGHT_TEST__' in window;
		const isDevE2E = import.meta.env.DEV && localStorage.getItem('__E2E_NSEC__');
		if (isPlaywright || isDevE2E) {
			const testNsec = localStorage.getItem('__E2E_NSEC__');
			const testNpub = localStorage.getItem('__E2E_NPUB__');
			const testMnemonic = localStorage.getItem('__E2E_MNEMONIC__');
			if (testNsec && testNpub && testMnemonic) {
				dropPrompt();
				const nsec = decodeNsec(testNsec);
				appStore.update((state) => ({
					...state,
					nostrKeys: { ...state.nostrKeys, nsec, npub: testNpub, mnemonic: testMnemonic }
				}));
				await Preferences.set({ key: StorageKeys.NPUB, value: testNpub });
				await notifyNdkSignerFromUnlockedKeys();
				return { nsec, npub: testNpub, mnemonic: testMnemonic };
			}
		}
	}

	const cachedSigner = await readSignerSession().catch(() => null);
	const cachedMnemonic = await readMnemonicSession().catch(() => null);
	if (cachedSigner && cachedMnemonic) {
		dropPrompt();
		const nsec = decodeNsec(cachedSigner.nsec);
		appStore.update((state) => ({
			...state,
			nostrKeys: { ...state.nostrKeys, nsec, npub: cachedSigner.npub, mnemonic: cachedMnemonic }
		}));
		await Preferences.set({ key: StorageKeys.NPUB, value: cachedSigner.npub });
		await notifyNdkSignerFromUnlockedKeys();
		return { nsec, npub: cachedSigner.npub, mnemonic: cachedMnemonic };
	}

	// Restore persisted E2E biometric data before attempting a real passkey prompt
	await restorePersistedE2EBiometricData();
	const currentStateAfterRestore = get(appStore);

	if (currentStateAfterRestore.biometricData) {
		dropPrompt();
		const encryptedData = currentStateAfterRestore.biometricData.encryptedData;
		const exportedKey = currentStateAfterRestore.biometricData.exportedKey;
		let sk: string;
		let mnemonic: string;
		try {
			const decrypted = await decryptMasterKeyDataFromBiometrics(encryptedData, exportedKey);
			sk = decrypted.nsec;
			mnemonic = decrypted.mnemonic;
		} catch (err) {
			appStore.update((state) => ({ ...state, biometricData: null }));
			throw err;
		}

		const nsec: Uint8Array = decodeNsec(sk);

		const npub = currentStateAfterRestore.biometricData.npub;
		appStore.update((state) => ({
			...state,
			nostrKeys: { ...state.nostrKeys, nsec, npub, mnemonic }
		}));
		await Preferences.set({ key: StorageKeys.NPUB, value: npub });
		await rememberMnemonic(mnemonic);
		await rememberSigner(sk, npub);
		await notifyNdkSignerFromUnlockedKeys();
		return { nsec, npub, mnemonic };
	}

	if (keyLogin) throw new NsecUnlockRequired();
	if (!options?.prompt && !armedPrompt) throw new SignerLockedError();

	const credentialData: Credentials | null = armedPrompt
		? await armedPrompt
		: await getBiometrics();

	if (!credentialData) throw new Error('No biometric data found');

	const response = await authService.getPasskeyEncryptedData({
		npub: credentialData.npub,
		challenge: credentialData.challenge,
		credentialId: credentialData.credentialId,
		response: credentialData.response
	});

	if (!response.encryptedData) throw new Error('No encrypted data found');

	const { nsec: sk, mnemonic } = await decryptMasterKeyDataFromBiometrics(
		response.encryptedData,
		credentialData.exportedKey
	);

	const nsec: Uint8Array = decodeNsec(sk);
	const npub = credentialData.npub;

	appStore.update((state) => ({
		...state,
		nostrKeys: {
			...state.nostrKeys,
			nsec,
			npub,
			mnemonic
		},
		biometricData: {
			npub,
			exportedKey: credentialData.exportedKey,
			encryptedData: response.encryptedData,
			credentialId: credentialData.credentialId
		}
	}));

	await Preferences.set({ key: StorageKeys.NPUB, value: npub });
	await rememberMnemonic(mnemonic);
	await rememberSigner(sk, npub);
	await notifyNdkSignerFromUnlockedKeys();
	return { nsec, npub, mnemonic };
};

/**
 * Decode Nostr secret key from various formats to Uint8Array
 *
 * Supports three input formats:
 * 1. **NIP-19 nsec format:** Keys starting with 'nsec1' (bech32 encoded)
 * 2. **Hex format:** 64-character hexadecimal string (with or without '0x' prefix)
 * 3. **Invalid formats:** Throws descriptive error for unsupported formats
 *
 * @param sk - Secret key string in nsec1 or hex format
 * @returns Decoded secret key as Uint8Array (32 bytes)
 * @throws {Error} If the key format is invalid or hex length is incorrect
 *
 * @internal This is an internal helper function used by key retrieval functions
 *
 * @example
 * ```typescript
 * // NIP-19 format
 * const key1 = decodeNsec('nsec1...'); // Uint8Array(32)
 *
 * // Hex format
 * const key2 = decodeNsec('a1b2c3d4...'); // Uint8Array(32)
 *
 * // Hex with 0x prefix
 * const key3 = decodeNsec('0xa1b2c3d4...'); // Uint8Array(32)
 * ```
 */
function decodeNsec(sk: string): Uint8Array {
	if (sk.startsWith('nsec1')) {
		const { data } = nip19.decode(sk);
		return data as Uint8Array;
	} else if (/^[0-9a-fA-F]+$/.test(sk)) {
		if (sk.length % 2 !== 0) {
			sk = '0' + sk;
		}
		if (sk.length === 64) {
			return hexToBytes(sk);
		} else if (sk.length === 66 && sk.startsWith('0x')) {
			return hexToBytes(sk.slice(2));
		} else {
			throw new Error(`Invalid hex private key length: ${sk.length} characters (expected 64)`);
		}
	} else {
		const _ = get(t);
		throw new Error(_('settings.error.invalidPrivateKey'));
	}
}
