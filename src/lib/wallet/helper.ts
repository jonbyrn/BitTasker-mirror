import { Preferences } from '@capacitor/preferences';
import * as bip39 from 'bip39';

/**
 * Retrieves the mnemonic phrase from Capacitor storage
 * @returns The mnemonic phrase as a string
 * @throws Error if mnemonic is not found in storage
 */
export async function getMnemonic(): Promise<string> {
	const { value } = await Preferences.get({ key: 'mnemonic' });

	if (!value) {
		throw new Error('Mnemonic not found in storage');
	}

	return value;
}

/**
 * Stores a mnemonic phrase in Capacitor storage
 * @param mnemonic - The mnemonic phrase to store
 * @returns A promise that resolves when the mnemonic is stored
 */
export async function setMnemonic(mnemonic: string): Promise<void> {
	if (!mnemonic || mnemonic.trim() === '') {
		throw new Error('Cannot store empty mnemonic');
	}

	await Preferences.set({
		key: 'mnemonic',
		value: mnemonic
	});
}

/**
 * Clears the mnemonic from Capacitor storage
 * @returns A promise that resolves when the mnemonic is cleared
 */
export async function clearMnemonic(): Promise<void> {
	await Preferences.remove({ key: 'mnemonic' });
}

/**
 * Generates a new mnemonic phrase
 * @returns A promise that resolves with the new mnemonic phrase
 */
export function generateMnemonic(): string {
	return bip39.generateMnemonic();
}
