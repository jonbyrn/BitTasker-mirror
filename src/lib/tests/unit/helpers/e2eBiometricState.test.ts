import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { appStore } from '$lib/stores/app.store';
import {
	clearPersistedE2EBiometricData,
	persistE2EBiometricData,
	restorePersistedE2EBiometricData
} from '$lib/utils/helpers/e2eBiometricState';
import type { BiometricData } from '$lib/types/auth';

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined)
	}
}));

const sampleBiometricData: BiometricData = {
	npub: 'npub-test',
	exportedKey: 'exported-key',
	credentialId: 'credential-id',
	encryptedData: {
		masterSalt: 'master-salt',
		nostr: {
			encrypted: {
				data: 'ciphertext',
				iv: 'nostr-iv',
				authTag: 'nostr-tag'
			},
			iterations: 100_000,
			salt: 'nostr-salt'
		},
		wallet: {
			encrypted: {
				data: 'wallet-ciphertext',
				iv: 'wallet-iv',
				authTag: 'wallet-tag'
			},
			iterations: 100_000,
			salt: 'wallet-salt'
		}
	}
};

describe('e2eBiometricState', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', 'true');
		appStore.resetUserState();
	});

	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('persists biometric data only in E2E mode', async () => {
		await persistE2EBiometricData(sampleBiometricData);

		expect(Preferences.set).toHaveBeenCalledWith({
			key: 'e2eBiometricData',
			value: JSON.stringify(sampleBiometricData)
		});
	});

	it('restores persisted biometric data into appStore', async () => {
		vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
			if (key === 'e2eBiometricData') {
				return { value: JSON.stringify(sampleBiometricData) };
			}
			if (key === 'npub') {
				return { value: sampleBiometricData.npub };
			}
			return { value: null };
		});

		const restored = await restorePersistedE2EBiometricData();

		expect(restored).toEqual(sampleBiometricData);
		expect(get(appStore).biometricData).toEqual(sampleBiometricData);
	});

	it('clears invalid persisted biometric data', async () => {
		vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
			if (key === 'e2eBiometricData') {
				return { value: '{"bad":true}' };
			}
			return { value: null };
		});

		const restored = await restorePersistedE2EBiometricData();

		expect(restored).toBeNull();
		expect(Preferences.remove).toHaveBeenCalledWith({ key: 'e2eBiometricData' });
	});

	it('clears persisted biometric data on demand', async () => {
		await clearPersistedE2EBiometricData();

		expect(Preferences.remove).toHaveBeenCalledWith({ key: 'e2eBiometricData' });
	});
});
