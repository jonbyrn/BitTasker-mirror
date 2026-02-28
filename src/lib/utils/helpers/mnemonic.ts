import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { checkBiometricAvailability, getBiometricData } from './biometrics';
import { getWebBiometricData } from './webBiometrics';
import { decryptWalletMnemonicWithBiometrics } from './auth';
import authService from '$lib/api/services/auth.service';

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(): Promise<string> {
	if (process.env.NODE_ENV === 'development') {
		// return 'draw mobile oven airport ostrich jar fiber motion main move mom firm';
	}
	try {
		// Check if we have biometric data with master key format
		const biometricData = get(appStore)?.biometricData;
		if (biometricData && biometricData.encryptedData) {
			return await decryptWalletMnemonicWithBiometrics(
				biometricData.encryptedData,
				biometricData.exportedKey
			);
		} else {
			const biometricsAvailable = await checkBiometricAvailability();
			let credentialData = null;

			let allowCredentialIds: string[] | undefined;
			const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
			const { value: storedCredentialId } = await Preferences.get({
				key: StorageKeys.WEB_AUTHN_CREDENTIAL_ID
			});
			if (authMethod === 'passkey' && storedCredentialId != null && storedCredentialId !== '') {
				allowCredentialIds = [storedCredentialId];
			}

			if (biometricsAvailable) {
				credentialData = await (allowCredentialIds != null
					? getBiometricData(true, allowCredentialIds)
					: getBiometricData(true));
			} else {
				credentialData = await (allowCredentialIds != null
					? getWebBiometricData(true, allowCredentialIds)
					: getWebBiometricData(true));
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
