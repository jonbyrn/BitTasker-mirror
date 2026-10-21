import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { cancelPasskeyPrompt, checkBiometricAvailability, getBiometricData } from './biometrics';
import { decryptNsecWithBiometrics, decryptWalletMnemonicWithBiometrics } from './auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import authService from '$lib/api/services/auth.service';
import { restorePersistedE2EBiometricData } from './e2eBiometricState';
import { walletUnlockRoute } from './login-method';
import { NsecUnlockRequired, recoverMnemonicFromNsec } from './nsec-unlock';
import {
	clearMnemonicSession,
	mnemonicCached,
	readMnemonicSession,
	readSignerSession,
	saveMnemonicSession,
	saveSignerSession
} from './session-mnemonic';

export function describeMnemonicSeed(mnemonic: string) {
	const words = mnemonic.trim().split(/\s+/);
	return {
		wordCount: words.length,
		word6Len: words[5]?.length ?? 0,
		word6Lower: words[5]?.toLowerCase() === words[5],
		hasNsecPrefix: mnemonic.trim().startsWith('nsec')
	};
}

function assertHdSeed(mnemonic: string): string {
	if (mnemonic.trim().startsWith('nsec')) {
		throw new Error('Invalid mnemonic: seed source returned an nsec');
	}
	return mnemonic;
}

async function rememberSeed(mnemonic: string): Promise<string> {
	const seed = assertHdSeed(mnemonic);
	await saveMnemonicSession(seed).catch(() => undefined);
	return seed;
}

/** Keep the seed from a successful login so the wallet can load balances. */
export async function rememberLoginSeed(
	mnemonic: string,
	nsec: string,
	npub: string
): Promise<void> {
	if (!mnemonic.trim() || !nsec || !npub) return;
	const seed = assertHdSeed(mnemonic);
	await saveMnemonicSession(seed).catch(() => undefined);
	await saveSignerSession(nsec, npub).catch(() => undefined);
}

async function cacheSigner(
	encryptedData: Parameters<typeof decryptNsecWithBiometrics>[0],
	exportedKey: string,
	npub: string
): Promise<void> {
	try {
		const nsec = await decryptNsecWithBiometrics(encryptedData, exportedKey);
		await saveSignerSession(nsec, npub);
	} catch {
		return;
	}
}

export function unlockCancelled(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	return (
		error.name === 'NotAllowedError' ||
		error.name === 'AbortError' ||
		error.message === 'unlock cancelled, tap to retry'
	);
}

async function mnemonicForKeyLogin(nsec?: string): Promise<string> {
	const currentState = get(appStore);
	if (currentState.nostrKeys.mnemonic) {
		const mnemonic = assertHdSeed(currentState.nostrKeys.mnemonic);
		await saveMnemonicSession(mnemonic).catch(() => undefined);
		return mnemonic;
	}

	let cached: string | null = null;
	try {
		cached = await readMnemonicSession(Date.now(), 0);
	} catch {
		await clearMnemonicSession().catch(() => undefined);
	}
	if (cached) return assertHdSeed(cached);

	const pasted = nsec?.trim();
	if (pasted) return assertHdSeed(await recoverMnemonicFromNsec(pasted));

	const signer = await readSignerSession().catch(() => null);
	if (signer?.nsec) return assertHdSeed(await recoverMnemonicFromNsec(signer.nsec));

	throw new NsecUnlockRequired();
}

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(options?: {
	signal?: AbortSignal;
	nsec?: string;
}): Promise<string> {
	if (import.meta.env.VITE_TEST_MNEMONIC) {
		return assertHdSeed(import.meta.env.VITE_TEST_MNEMONIC);
	}

	// E2E test bypass: read mnemonic directly from localStorage
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('__E2E_MNEMONIC__');
		if (stored?.trim().startsWith('nsec')) {
			throw new Error('Invalid mnemonic: seed source returned an nsec');
		}
		const isPlaywright = '__PLAYWRIGHT_TEST__' in window;
		const isDevE2E = import.meta.env.DEV && Boolean(stored);
		if ((isPlaywright || isDevE2E) && stored) {
			return assertHdSeed(stored);
		}
	}

	// Key logins have no passkey. Do this before any WebAuthn call.
	if (walletUnlockRoute() === 'nsec') {
		try {
			return await mnemonicForKeyLogin(options?.nsec);
		} catch (error) {
			if (error instanceof NsecUnlockRequired) throw error;
			const message = error instanceof Error ? error.message : '';
			if (
				message === 'Invalid private key' ||
				message === 'This key does not match the signed-in account'
			) {
				throw error;
			}
			throw new Error(message || 'Failed to get mnemonic');
		}
	}

	// Tier 1: memory. This is synchronous, so a click that already has the seed never prompts.
	const currentState = get(appStore);
	if (currentState.nostrKeys.mnemonic) {
		const mnemonic = assertHdSeed(currentState.nostrKeys.mnemonic);
		await saveMnemonicSession(mnemonic).catch(() => undefined);
		return mnemonic;
	}

	// Start WebAuthn before the session read. A later get is outside the click and shows no dialog.
	const armedPrompt =
		currentState.biometricData?.encryptedData || mnemonicCached()
			? null
			: getBiometricData(false, [], options?.signal);
	const releasePrompt = () => {
		if (!armedPrompt) return;
		armedPrompt.catch(() => undefined);
		if (typeof cancelPasskeyPrompt === 'function') cancelPasskeyPrompt();
	};

	let cached: string | null = null;
	try {
		cached = await readMnemonicSession(Date.now(), 0);
	} catch {
		await clearMnemonicSession().catch(() => undefined);
	}
	if (cached) {
		releasePrompt();
		return assertHdSeed(cached);
	}

	try {
		await restorePersistedE2EBiometricData();

		// Re-read after restore — biometricData may have been hydrated from E2E persistence
		const biometricData = get(appStore).biometricData;
		if (biometricData && biometricData.encryptedData) {
			releasePrompt();
			const mnemonic = assertHdSeed(
				await decryptWalletMnemonicWithBiometrics(
					biometricData.encryptedData,
					biometricData.exportedKey
				)
			);
			await saveMnemonicSession(mnemonic).catch(() => undefined);
			await cacheSigner(biometricData.encryptedData, biometricData.exportedKey, biometricData.npub);
			return mnemonic;
		} else {
			const biometricsAvailable = armedPrompt ? true : await checkBiometricAvailability();
			let credentialData = null;
			if (armedPrompt) {
				credentialData = await armedPrompt;
			} else if (biometricsAvailable) {
				const { value: credentialId } = await Preferences.get({
					key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
				});
				const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentialId
					? [{ id: credentialId, type: 'public-key' }]
					: [];
				credentialData = await getBiometricData(true, allowCredentials, options?.signal);
			}

			if (!credentialData) throw new Error('No biometric data found');

			const response = await authService.getPasskeyEncryptedData({
				npub: credentialData.npub,
				challenge: credentialData.challenge,
				credentialId: credentialData.credentialId,
				response: credentialData.response
			});

			if (!response.encryptedData) throw new Error('No encrypted data found');

			appStore.update((state) => ({
				...state,
				biometricData: {
					credentialId: credentialData.credentialId,
					npub: credentialData.npub,
					exportedKey: credentialData.exportedKey,
					encryptedData: response.encryptedData
				}
			}));

			const mnemonic = await rememberSeed(
				await decryptWalletMnemonicWithBiometrics(
					response.encryptedData,
					credentialData.exportedKey
				)
			);
			await cacheSigner(response.encryptedData, credentialData.exportedKey, credentialData.npub);
			return mnemonic;
		}
	} catch (error) {
		if (unlockCancelled(error)) throw new Error('unlock cancelled, tap to retry');
		throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
	}
}
