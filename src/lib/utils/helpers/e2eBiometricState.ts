import { Preferences } from '@capacitor/preferences';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import type { BiometricData } from '$lib/types/auth';

function e2eBiometricPersistenceEnabled(): boolean {
	return import.meta.env.VITE_E2E_TURNSTILE_BYPASS === 'true';
}

function isBiometricDataShape(value: unknown): value is BiometricData {
	if (!value || typeof value !== 'object') return false;

	const biometricData = value as Partial<BiometricData>;
	return Boolean(
		typeof biometricData.npub === 'string' &&
			typeof biometricData.exportedKey === 'string' &&
			typeof biometricData.credentialId === 'string' &&
			biometricData.encryptedData &&
			typeof biometricData.encryptedData === 'object'
	);
}

export async function persistE2EBiometricData(biometricData: BiometricData): Promise<void> {
	if (!e2eBiometricPersistenceEnabled() || !isBiometricDataShape(biometricData)) return;

	await Preferences.set({
		key: StorageKeys.E2E_BIOMETRIC_DATA,
		value: JSON.stringify(biometricData)
	});
}

export async function clearPersistedE2EBiometricData(): Promise<void> {
	if (!e2eBiometricPersistenceEnabled()) return;

	await Preferences.remove({ key: StorageKeys.E2E_BIOMETRIC_DATA });
}

export async function restorePersistedE2EBiometricData(): Promise<BiometricData | null> {
	if (!e2eBiometricPersistenceEnabled()) return null;

	const currentBiometricData = get(appStore).biometricData;
	if (currentBiometricData) return currentBiometricData;

	const [{ value }, { value: currentNpub }] = await Promise.all([
		Preferences.get({ key: StorageKeys.E2E_BIOMETRIC_DATA }),
		Preferences.get({ key: StorageKeys.NPUB })
	]);
	if (!value) return null;

	try {
		const parsed = JSON.parse(value);
		if (!isBiometricDataShape(parsed)) {
			await clearPersistedE2EBiometricData();
			return null;
		}

		if (currentNpub && parsed.npub !== currentNpub) {
			return null;
		}

		appStore.update((state) => ({
			...state,
			biometricData: parsed
		}));

		return parsed;
	} catch {
		await clearPersistedE2EBiometricData();
		return null;
	}
}
