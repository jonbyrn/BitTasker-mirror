import type { EncryptedData, UserData } from '$lib/types/auth';
import { finalizeEvent } from 'nostr-tools';
import { encryptMasterKeyData } from '$lib/utils/helpers/auth';
import { checkBiometricAvailability, setBiometricKey } from '$lib/utils/helpers/biometrics';
import { writable, get } from 'svelte/store';
import { decodeNsec } from '$lib/utils/nostr';
import authService from '$lib/api/services/auth.service';

type MigrationState = 'info' | 'processing' | 'success' | 'error' | 'migrated';

interface MigrationContext {
	npub: string;
	username: string;
	decryptedData: { nsec: string; mnemonic: string };
	deviceId: string;
	deviceName: string;
	platform: 'mobile' | 'web';
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
	passkeyMigration.update((state) => ({
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
			passkeyMigration.update((state) => ({
				...state,
				countdown: state.countdown - 1
			}));
		} else {
			// Auto-proceed when countdown reaches 0
			clearInterval(interval);
			passkeyMigration.update((state) => ({
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
	passkeyMigration.update((state) => ({
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
	const { npub, username, decryptedData, deviceId, deviceName, platform } = context;

	// Update state to processing
	passkeyMigration.update((state) => ({
		...state,
		state: 'processing'
	}));

	const decodedNsec = decodeNsec(decryptedData.nsec);

	// Get login challenge from server
	const { challenge } = await authService.getChallenge();

	const event = {
		kind: 22242,
		created_at: Math.floor(Date.now() / 1000),
		content: challenge,
		tags: [
			['relay', window.location.origin],
			['challenge', challenge]
		],
		pubkey: npub
	};

	const signedEvent = finalizeEvent(event, decodedNsec);

	const { encryptedData, exportedKey } = await encryptMasterKeyData(
		decryptedData.nsec,
		decryptedData.mnemonic,
		decryptedData.nsec
	);

	const isBiometricsAvailable = await checkBiometricAvailability();

	let credentialData = {
		credentialId: '',
		passkeyPubkey: '',
		clientDataJSON: '',
		attestationObject: '',
		challenge: ''
	};

	if (isBiometricsAvailable) {
		credentialData = await setBiometricKey({ npub, exportedKey, challenge, username });
	}

	const response = await authService.nostrLogin({
		event: signedEvent,
		challenge,
		encryptedData,
		authMethod: 'passkey',
		deviceId,
		deviceName,
		credentialId: credentialData.credentialId,
		passkeyPubkey: credentialData.passkeyPubkey,
		clientDataJSON: credentialData.clientDataJSON,
		attestationObject: credentialData.attestationObject,
		appVersion: __APP_VERSION__,
		platform
	});

	// Update state to success
	passkeyMigration.update((state) => ({
		...state,
		state: 'success',
		error: null
	}));

	// Wait 2 seconds to show success state to user
	await new Promise((resolve) => setTimeout(resolve, 2000));

	return {
		response: { ...response, encryptedData },
		exportedKey,
		credentialId: credentialData.credentialId
	};
}

/**
 * Main migration function - stores context and initiates migration flow
 */
async function migratePasskey(params: {
	npub: string;
	username: string;
	decryptedData: { nsec: string; mnemonic: string };
	deviceId: string;
	deviceName: string;
	platform: 'mobile' | 'web';
}): Promise<{
	response: { user: UserData; access_token: string; encryptedData: EncryptedData };
	exportedKey: string;
	credentialId: string;
}> {
	try {
		// Store context for retry/skip
		passkeyMigration.update((state) => ({
			...state,
			context: params
		}));

		// Start the migration flow
		startMigrationCountdown();

		// Wait for user to proceed (either by clicking or countdown reaching 0)
		await new Promise<void>((resolve) => {
			const unsubscribe = passkeyMigration.subscribe((state) => {
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
		passkeyMigration.update((state) => ({
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
		passkeyMigration.update((state) => ({
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
			const unsubscribe = passkeyMigration.subscribe((state) => {
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
		passkeyMigration.update((state) => ({
			...state,
			state: 'error',
			error: error instanceof Error ? error.message : 'Migration retry failed'
		}));

		throw error;
	}
}

export async function continueAfterMigration() {
	// Close modal
	resetMigration();

	return true;
}

export default migratePasskey;
