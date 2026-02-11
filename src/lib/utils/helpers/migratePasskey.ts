import { type NostrEvent } from "nostr-tools";
import { encryptMasterKeyData } from "$lib/utils/helpers/auth";
import { setWebBiometricKey } from "$lib/utils/helpers/webBiometrics";
import { checkBiometricAvailability, setBiometricKey } from "$lib/utils/helpers/biometrics";
import { writable, get } from "svelte/store";

type MigrationState = 'info' | 'processing' | 'success' | 'error';

interface MigrationContext {
    signedEvent: NostrEvent;
    nsec: string;
    mnemonic: string;
    deviceId: string;
    deviceName: string;
    platform: 'mobile' | 'web';
    oldCredentialId: string;
}

interface PasskeyMigrationStore {
    isOpen: boolean;
    state: MigrationState;
    countdown: number;
    error: string | null;
    shouldProceed: boolean;
    context: MigrationContext | null;
}

export const passkeyMigration = writable<PasskeyMigrationStore>({
    isOpen: false,
    state: 'info',
    countdown: 30,
    error: null,
    shouldProceed: false,
    context: null
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
        shouldProceed: false,
        context: null
    });
}

/**
 * Internal function to perform the actual migration process
 */
async function performMigration(context: MigrationContext) {
    const { signedEvent, nsec, mnemonic, deviceId, deviceName, platform, oldCredentialId } = context;

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
}

/**
 * Main migration function - stores context and initiates migration flow
 */
async function migratePasskey(
    params: {
        signedEvent: NostrEvent;
        nsec: string;
        mnemonic: string;
        deviceId: string;
        deviceName: string;
        platform: 'mobile' | 'web';
        oldCredentialId: string;
    }
) {
    try {
        // Store context for retry/skip
        passkeyMigration.update(state => ({
            ...state,
            context: params
        }));

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

        // Perform the actual migration
        return await performMigration(params);
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

/**
 * Retry migration after an error
 */
export async function retryMigration() {
    const currentState = get(passkeyMigration);
    if (!currentState.context) {
        throw new Error('No migration context available');
    }

    try {
        // Reset state and restart countdown
        passkeyMigration.update(state => ({
            ...state,
            state: 'info',
            countdown: 30,
            error: null,
            shouldProceed: false
        }));

        // Restart countdown
        startMigrationCountdown();

        // Wait for user to proceed again
        await new Promise<void>((resolve) => {
            const unsubscribe = passkeyMigration.subscribe(state => {
                if (state.shouldProceed) {
                    unsubscribe();
                    resolve();
                }
            });
        });

        // Perform the migration with stored context
        return await performMigration(currentState.context);
    } catch (error) {
        console.error('Error retrying migration:', error);

        // Update state to error
        passkeyMigration.update(state => ({
            ...state,
            state: 'error',
            error: error instanceof Error ? error.message : 'Migration retry failed'
        }));

        throw error;
    }
}

/**
 * Skip migration and use regular passkey login instead
 */
export async function skipMigration() {
    const currentState = get(passkeyMigration);
    if (!currentState.context) {
        throw new Error('No migration context available');
    }

    try {
        const { signedEvent, deviceId, deviceName, platform } = currentState.context;

        // Update state to processing
        passkeyMigration.update(state => ({
            ...state,
            state: 'processing'
        }));

        // Dynamically import authService
        const authService = (await import('$lib/api/services/auth.service')).default;

        // Use regular passkey login instead of migration
        const response = await authService.loginWithPasskey({
            event: signedEvent,
            deviceId,
            deviceName,
            platform
        });

        // Update state to success
        passkeyMigration.update(state => ({
            ...state,
            state: 'success',
            error: null
        }));

        // Wait 2 seconds to show success state to user
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Close modal
        resetMigration();

        return response;
    } catch (error) {
        console.error('Error skipping migration:', error);

        // Update state to error
        passkeyMigration.update(state => ({
            ...state,
            state: 'error',
            error: error instanceof Error ? error.message : 'Skip migration failed'
        }));

        throw error;
    }
}

export default migratePasskey;