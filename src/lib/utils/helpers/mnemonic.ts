import { appStore } from "$lib/stores/app.store";
import { get } from "svelte/store";
import { checkBiometricAvailability, getBiometricData } from "./biometrics";
import { getWebBiometricData } from "./webBiometrics";
import { decryptWalletMnemonicWithBiometrics } from "./auth";

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(): Promise<string> {
    if (process.env.NODE_ENV === 'development') {
        // return 'draw mobile oven airport ostrich jar fiber motion main move mom firm';
    }
    try {
        // Check if we have biometric data with master key format
        const biometricData = get(appStore)?.biometricData;
        if (biometricData && biometricData.encryptedData) {
            return await decryptWalletMnemonicWithBiometrics(biometricData.encryptedData, biometricData.exportedKey);
        } else {
            const biometricsAvailable = await checkBiometricAvailability();
            let biometricData = null;
            if (biometricsAvailable) {
                biometricData = await getBiometricData(true);
            } else {
                biometricData = await getWebBiometricData(true);
            }

            if (!biometricData) throw new Error('No biometric data found');

            appStore.update((state) => ({ ...state, biometricData }));
            return await decryptWalletMnemonicWithBiometrics(biometricData.encryptedData, biometricData.exportedKey);
        }
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
    }
}