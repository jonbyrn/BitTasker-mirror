import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import type { BiometricData } from '$lib/types/auth';

/**
 * Whether E2E biometric persistence is enabled.
 * Gated on the same env var used for Turnstile bypass in Playwright config.
 */
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

/**
 * Persist biometric data to localStorage for E2E test continuity.
 * Only active when VITE_E2E_TURNSTILE_BYPASS is 'true'.
 */
export async function persistE2EBiometricData(biometricData: BiometricData): Promise<void> {
	if (!e2eBiometricPersistenceEnabled() || !isBiometricDataShape(biometricData)) return;

	try {
		localStorage.setItem(StorageKeys.E2E_BIOMETRIC_DATA, JSON.stringify(biometricData));
	} catch {
		// Silent failure — non-critical E2E helper
	}
}

/**
 * Clear persisted E2E biometric data.
 */
export async function clearPersistedE2EBiometricData(): Promise<void> {
	if (!e2eBiometricPersistenceEnabled()) return;

	try {
		localStorage.removeItem(StorageKeys.E2E_BIOMETRIC_DATA);
	} catch {
		// Silent failure
	}
}

/**
 * Restore persisted biometric data into appStore if not already present.
 * Called before key retrieval functions to avoid triggering a real passkey prompt mid-test.
 */
export async function restorePersistedE2EBiometricData(): Promise<BiometricData | null> {
	if (!e2eBiometricPersistenceEnabled()) return null;

	const currentBiometricData = get(appStore).biometricData;
	if (currentBiometricData) return currentBiometricData;

	try {
		const value = localStorage.getItem(StorageKeys.E2E_BIOMETRIC_DATA);
		if (!value) return null;

		const parsed: unknown = JSON.parse(value);
		if (!isBiometricDataShape(parsed)) {
			localStorage.removeItem(StorageKeys.E2E_BIOMETRIC_DATA);
			return null;
		}

		appStore.update((state) => ({
			...state,
			biometricData: parsed
		}));

		return parsed;
	} catch {
		localStorage.removeItem(StorageKeys.E2E_BIOMETRIC_DATA);
		return null;
	}
}
