import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { checkBiometricAvailability, getBiometricData } from './biometrics';
import { decryptWalletMnemonicWithBiometrics } from './auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import authService from '$lib/api/services/auth.service';
import { readMnemonicSession, saveMnemonicSession } from '$lib/utils/helpers/signer-session';

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(): Promise<string> {
	if (process.env.NODE_ENV === 'development') {
		// return 'draw mobile oven airport ostrich jar fiber motion main move mom firm';
	}

	// E2E test bypass: read mnemonic directly from localStorage
	if (typeof window !== 'undefined') {
		const isPlaywright = '__PLAYWRIGHT_TEST__' in window;
		const isDevE2E = import.meta.env.DEV && localStorage.getItem('__E2E_MNEMONIC__');
		if (isPlaywright || isDevE2E) {
			const mnemonic = localStorage.getItem('__E2E_MNEMONIC__');
			if (mnemonic) return mnemonic;
		}
	}

	// Tier 1: Check if mnemonic is already decrypted in store
	const currentState = get(appStore);
	if (currentState.nostrKeys.mnemonic) {
		return currentState.nostrKeys.mnemonic;
	}

	const cachedMnemonic = await readMnemonicSession().catch(() => null);
	if (cachedMnemonic) {
		appStore.update((state) => ({
			...state,
			nostrKeys: { ...state.nostrKeys, mnemonic: cachedMnemonic }
		}));
		return cachedMnemonic;
	}

	try {
		// Tier 2: Check if we have biometric data with master key format
		const biometricData = currentState.biometricData;
		if (biometricData && biometricData.encryptedData) {
			const mnemonic = await decryptWalletMnemonicWithBiometrics(
				biometricData.encryptedData,
				biometricData.exportedKey
			);
			appStore.update((state) => ({
				...state,
				nostrKeys: { ...state.nostrKeys, mnemonic }
			}));
			await saveMnemonicSession(mnemonic).catch(() => undefined);
			return mnemonic;
		} else {
			const biometricsAvailable = await checkBiometricAvailability();
			let credentialData = null;
			if (biometricsAvailable) {
				const { value: credentialId } = await Preferences.get({
					key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
				});
				const allowCredentials: PublicKeyCredentialDescriptorJSON[] = credentialId
					? [{ id: credentialId, type: 'public-key' }]
					: [];
				credentialData = await getBiometricData(true, allowCredentials);
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

			const mnemonic = await decryptWalletMnemonicWithBiometrics(
				response.encryptedData,
				credentialData.exportedKey
			);
			appStore.update((state) => ({
				...state,
				nostrKeys: { ...state.nostrKeys, mnemonic }
			}));
			await saveMnemonicSession(mnemonic).catch(() => undefined);
			return mnemonic;
		}
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
	}
}
