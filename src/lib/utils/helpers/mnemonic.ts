import { appStore } from "$lib/stores/app.store";
import { get } from "svelte/store";
import { checkBiometricAvailability, getBiometricData } from "./biometrics";
import { Preferences } from "@capacitor/preferences";
import { StorageKeys } from "../constants/storage";
import { getWebBiometricData } from "./webBiometrics";
import { decryptWalletMnemonicWithBiometrics } from "./auth";

// Helper function to get mnemonic using the same logic as wallet.store.ts
export async function getMnemonic(): Promise<string> {
    if(process.env.NODE_ENV === 'development') {
        // privatekey = '0xc8f40856557b8c9867b18eebcbe6510d12a9d3bd0fdbaee3e895bb50442ca619'
        return 'draw mobile oven airport ostrich jar fiber motion main move mom firm';
    }
    try {
        // Check if we have biometric data with master key format
        const currentState = get(appStore);
        if (currentState.biometricData && currentState.biometricData.password) {
            return await decryptWalletMnemonicWithBiometrics(currentState.biometricData.password);
        } else {
            const biometricsAvailable = await checkBiometricAvailability();
            let biometricData = null;
            if (biometricsAvailable) {
                const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
                biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
            } else {
                biometricData = await getWebBiometricData(true);
            }

            if (!biometricData) throw new Error('No biometric data found');

            appStore.update((state) => ({ ...state, biometricData }));
            return await decryptWalletMnemonicWithBiometrics(biometricData.password);
        }
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
    }
}