/**
 * Store and retrieve the wallet mnemonic using the EXISTING biometric/passkey
 * that protects the user's Nostr keys. We reuse the exported AES key contained
 * in the biometric payload and store the encrypted mnemonic in Capacitor
 * Preferences. No additional passkey is created.
 */

import { validateMnemonic } from 'bip39';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { importKey, encrypt, decrypt } from '$lib/utils/helpers/crypto';
import type { EncryptedData } from '$lib/types/auth';
import type { Credentials } from '$lib/types/auth';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
const MNEMONIC_KEY = 'bittasker_wallet_mnemonic';

async function obtainBiometricData(): Promise<Credentials> {
	// Try from store first
	const current = get(appStore) as unknown as { biometricData: Credentials | null };
	if (current?.biometricData) return current.biometricData;

	// Otherwise, perform biometric/WebAuthn verification to fetch it
	const { checkBiometricAvailability, getBiometricData } = await import(
		'$lib/utils/helpers/biometrics'
	);
	const isNative = await checkBiometricAvailability();
	if (isNative) {
		const creds = await getBiometricData();
		if (!creds) throw new Error('Biometric verification failed');
		appStore.update((s) => ({ ...s, biometricData: creds }));
		return creds;
	}

	const { getWebBiometricData } = await import('$lib/utils/helpers/webBiometrics');
	const creds = await getWebBiometricData();
	if (!creds) throw new Error('Biometric verification failed');
	appStore.update((s) => ({ ...s, biometricData: creds }));
	return creds;
}

/**
 * Encrypts and stores the mnemonic using the exported AES key from existing biometrics
 * Returns a dummy string for compatibility with previous callers.
 */
export async function setupMnemonicPasskey(mnemonic: string): Promise<string> {
	if (!validateMnemonic(mnemonic)) {
		throw new Error('Invalid mnemonic phrase');
	}

	const biometrics = await obtainBiometricData();
	const { key } = JSON.parse(biometrics.password);
	const cryptoKey = await importKey(key);
	const encrypted = await encrypt(mnemonic, cryptoKey);

	await Preferences.set({ key: StorageKeys.WALLET_MNEMONIC, value: JSON.stringify(encrypted) });

	// Return a stable string; callers only check success
	return 'stored';
}

/**
 * Decrypts and returns the mnemonic after biometric verification
 */
export async function getMnemonicPasskey(): Promise<string> {
	const { value } = await Preferences.get({ key: StorageKeys.WALLET_MNEMONIC });
	if (!value) {
		// Try legacy locations and migrate if found
		const migrated = await tryMigrateFromLegacyStorage();
		if (!migrated) throw new Error('No mnemonic found');
		// After migration, read again
		const reread = await Preferences.get({ key: StorageKeys.WALLET_MNEMONIC });
		if (!reread.value) throw new Error('No mnemonic found');
		return await decryptWithExistingBiometrics(JSON.parse(reread.value));
	}

	const mnemonic = await decryptWithExistingBiometrics(JSON.parse(value) as EncryptedData);

	if (!validateMnemonic(mnemonic)) {
		throw new Error('Retrieved mnemonic is invalid');
	}

	return mnemonic;
}

async function decryptWithExistingBiometrics(encrypted: EncryptedData): Promise<string> {
	const biometrics = await obtainBiometricData();
	const { key } = JSON.parse(biometrics.password);
	const cryptoKey = await importKey(key);
	return await decrypt(encrypted, cryptoKey);
}

async function tryMigrateFromLegacyStorage(): Promise<boolean> {
	// 1) Native biometrics legacy location
	try {
		const { NativeBiometric } = await import('capacitor-native-biometric');
		const creds = await NativeBiometric.getCredentials({ server: MNEMONIC_KEY });
		if (creds?.password && validateMnemonic(creds.password)) {
			await persistWithExistingBiometrics(creds.password);
			// Best effort: clear old record
			try {
				await NativeBiometric.deleteCredentials({ server: MNEMONIC_KEY });
			} catch {
				/* ignore */
			}
			return true;
		}
	} catch {
		/* ignore */
	}

	return false;
}

async function persistWithExistingBiometrics(mnemonic: string): Promise<void> {
	const biometrics = await obtainBiometricData();
	const { key } = JSON.parse(biometrics.password);
	const cryptoKey = await importKey(key);
	const encrypted = await encrypt(mnemonic, cryptoKey);
	await Preferences.set({ key: StorageKeys.WALLET_MNEMONIC, value: JSON.stringify(encrypted) });
}

export async function hasMnemonicPasskey(): Promise<boolean> {
	const { value } = await Preferences.get({ key: StorageKeys.WALLET_MNEMONIC });
	return !!value;
}

export async function getPasskeyDescription(): Promise<string> {
	// We no longer create a separate passkey. Describe based on environment.
	try {
		const { checkBiometricAvailability } = await import('$lib/utils/helpers/biometrics');
		const isNative = await checkBiometricAvailability();
		return isNative ? 'Biometrics (platform keychain)' : 'WebAuthn platform authenticator';
	} catch {
		return 'Biometric/Passkey';
	}
}
