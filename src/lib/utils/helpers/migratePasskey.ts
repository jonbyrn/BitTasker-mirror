import { type NostrEvent } from "nostr-tools";
import { encryptMasterKeyData } from "$lib/utils/helpers/auth";
import { setWebBiometricKey } from "$lib/utils/helpers/webBiometrics";
import { checkBiometricAvailability, setBiometricKey } from "$lib/utils/helpers/biometrics";
import { writable, get } from "svelte/store";

type MigrationState = 'info' | 'processing' | 'success' | 'error';

interface PasskeyMigrationStore {
    isOpen: boolean;
    state: MigrationState;
    countdown: number;
    error: string | null;
    shouldProceed: boolean;
}

export const passkeyMigration = writable<PasskeyMigrationStore>({
    isOpen: false,
    state: 'info',
    countdown: 30,
    error: null,
    shouldProceed: false
});

/**
 * Start the countdown timer and wait for user action
 */
export function startMigrationCountdown() {
    passkeyMigration.update(state => ({
        ...state,
        isOpen: true,
        state: 'info',
        countdown: 30,
        error: null,
        shouldProceed: false
    }));

    const interval = setInterval(() => {
        const currentState = get(passkeyMigration);

        // If user clicked continue, clear interval
        if (currentState.shouldProceed) {
            clearInterval(interval);
            return;
        }

        // Countdown
        if (currentState.countdown > 0) {
            passkeyMigration.update(state => ({
                ...state,
                countdown: state.countdown - 1
            }));
        } else {
            // Auto-proceed when countdown reaches 0
            clearInterval(interval);
            passkeyMigration.update(state => ({
                ...state,
                shouldProceed: true
            }));
        }
    }, 1000);

    return interval;
}

/**
 * User clicked continue button - skip countdown
 */
export function skipCountdown() {
    passkeyMigration.update(state => ({
        ...state,
        shouldProceed: true,
        countdown: 0
    }));
}

/**
 * Reset migration state
 */
export function resetMigration() {
    passkeyMigration.set({
        isOpen: false,
        state: 'info',
        countdown: 30,
        error: null,
        shouldProceed: false
    });
}

async function migratePasskey(
    {
        signedEvent,
        nsec,
        mnemonic,
        deviceId,
        deviceName,
        platform,
        oldCredentialId
    }: {
        signedEvent: NostrEvent;
        nsec: string;
        mnemonic: string;
        deviceId: string;
        deviceName: string;
        platform: string;
        oldCredentialId: string;
    }
) {
    try {
        // Start the migration flow
        startMigrationCountdown();

        // Wait for user to proceed (either by clicking or countdown reaching 0)
        await new Promise<void>((resolve) => {
            const unsubscribe = passkeyMigration.subscribe(state => {
                if (state.shouldProceed) {
                    unsubscribe();
                    resolve();
                }
            });
        });

        // Update state to processing
        passkeyMigration.update(state => ({
            ...state,
            state: 'processing'
        }));

        const npub = signedEvent.pubkey;

        const { encryptedData, exportedKey } = await encryptMasterKeyData(nsec, mnemonic, nsec);

        const isMobileBiometrics = await checkBiometricAvailability();

        let credentialId = '';
        if (isMobileBiometrics) {
            credentialId = await setBiometricKey(npub, exportedKey);
        } else {
            credentialId = await setWebBiometricKey(npub, exportedKey);
        }

        // Dynamically import authService to avoid circular dependency
        const authService = (await import('$lib/api/services/auth.service')).default;

        const response = await authService.migratePasskey({
            event: signedEvent,
            newCredentialId: credentialId,
            oldCredentialId,
            deviceId,
            masterKeyData: encryptedData,
            deviceName,
            platform: platform
        });

        // Update state to success
        passkeyMigration.update(state => ({
            ...state,
            state: 'success',
            error: null
        }));

        // Wait 2 seconds to show success state to user
        await new Promise(resolve => setTimeout(resolve, 2000));

        return response;
    } catch (error) {
        console.error('Error migrating passkey:', error);

        // Update state to error
        passkeyMigration.update(state => ({
            ...state,
            state: 'error',
            error: error instanceof Error ? error.message : 'Migration failed'
        }));

        throw error;
    }
}

export default migratePasskey;