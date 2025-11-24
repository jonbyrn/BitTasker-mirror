/* eslint-disable @typescript-eslint/no-explicit-any */
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
        // return 'draw mobile oven airport ostrich jar fiber motion main move mom firm';
    }
    try {
        // Check if we have biometric data with master key format
        const currentState = get(appStore);
        if (currentState.biometricData && currentState.biometricData.password) {
            // Validate cached data before using it
            try {
                // Validate session before using cached data
                const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
                if (!token) {
                    // No access token means user is not logged in, clear cache and prompt
                    console.warn('No access token found in getMnemonic, clearing cached biometricData');
                    appStore.update((state) => ({ ...state, biometricData: null }));
                } else {
                    // Validate NPUB match
                    const { value: storedNpub } = await Preferences.get({ key: StorageKeys.NPUB });
                    if (storedNpub && storedNpub !== currentState.biometricData.username) {
                        // NPUB mismatch - different user, clear cache and prompt
                        console.warn('Cached biometricData NPUB does not match stored NPUB in getMnemonic, clearing cache');
                        appStore.update((state) => ({ ...state, biometricData: null }));
                    } else {
                        // Cached data is valid, try to decrypt
                        try {
                            return await decryptWalletMnemonicWithBiometrics(currentState.biometricData.password);
                        } catch (decryptError) {
                            // Decryption failed - clear cache and fall through to prompt
                            console.warn('Failed to decrypt cached biometricData in getMnemonic, clearing cache:', decryptError);
                            appStore.update((state) => ({ ...state, biometricData: null }));
                            // Fall through to prompt for fresh authentication
                        }
                    }
                }
            } catch (validationError) {
                // Validation failed - clear cache and fall through to prompt
                console.warn('Failed to validate cached biometricData in getMnemonic, clearing cache:', validationError);
                appStore.update((state) => ({ ...state, biometricData: null }));
                // Fall through to prompt for fresh authentication
            }
        }
        
        // If we reach here, either no cached data or validation/decryption failed - prompt for fresh auth
        {
            const biometricsAvailable = await checkBiometricAvailability();
            let biometricData = null;
            if (biometricsAvailable) {
                const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });
                biometricData = await getBiometricData(authMethod as 'biometrics' | 'passkey', true);
            } else {
                biometricData = await getWebBiometricData(true);
            }

            if (!biometricData) {
                // User cancelled or authentication failed silently - return null instead of throwing
                return null as any; // Type assertion needed for backward compatibility
            }

            appStore.update((state) => ({ ...state, biometricData }));
            return await decryptWalletMnemonicWithBiometrics(biometricData.password);
        }
    } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Failed to get mnemonic');
    }
}