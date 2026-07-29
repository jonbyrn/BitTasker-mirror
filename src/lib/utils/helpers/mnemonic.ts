import type { PublicKeyCredentialDescriptorJSON } from 'capacitor-webauthn';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { checkBiometricAvailability, getBiometricData } from './biometrics';
import { decryptWalletMnemonicWithBiometrics } from './auth';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import authService from '$lib/api/services/auth.service';
import { restorePersistedE2EBiometricData } from './e2eBiometricState';

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(): Promise<string> {
	if (import.meta.env.VITE_TEST_MNEMONIC) {
		return import.meta.env.VITE_TEST_MNEMONIC;
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

	try {
		await restorePersistedE2EBiometricData();

		// Re-read after restore — biometricData may have been hydrated from E2E persistence
		const biometricData = get(appStore).biometricData;
		if (biometricData && biometricData.encryptedData) {
			return await decryptWalletMnemonicWithBiometrics(
				biometricData.encryptedData,
				biometricData.exportedKey
			);
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

			return await decryptWalletMnemonicWithBiometrics(
				response.encryptedData,
				credentialData.exportedKey
			);
		}
	} catch (error) {
		throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
	}
}
