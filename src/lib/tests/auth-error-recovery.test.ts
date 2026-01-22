import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import type { Credentials } from '$lib/types/auth';

// Mock dependencies
vi.mock('$lib/stores/app.store', () => {
	const { writable } = require('svelte/store');

	const createState = (biometricData: Credentials | null) => ({
		nostrKeys: { nsec: null, npub: null, mnemonic: null },
		isLoading: false,
		error: null,
		toasts: [],
		biometricData,
		network: 'testnet',
		pool: {} as any,
		relays: []
	});

	const mockStore = writable(createState(null));
	return {
		appStore: {
			subscribe: mockStore.subscribe,
			set: vi.fn((value) => mockStore.set(value)),
			update: vi.fn((fn) => mockStore.update(fn)),
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn(),
			showInfoToast: vi.fn()
		}
	};
});

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptNsecWithBiometrics: vi.fn()
}));

vi.mock('nostr-tools', () => ({
	nip19: {
		decode: vi.fn((nsec: string) => {
			if (nsec.startsWith('nsec1')) {
				return { data: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) };
			}
			throw new Error('Invalid nsec format');
		})
	}
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: vi.fn().mockResolvedValue(true),
	getBiometricData: vi.fn()
}));

vi.mock('$lib/utils/helpers/webBiometrics', () => ({
	getWebBiometricData: vi.fn()
}));

describe('Error Recovery and Fallback', () => {
	const mockAppStoreUpdate = vi.mocked(appStore.update);
	const mockPreferencesGet = vi.mocked(Preferences.get);
	const mockDecryptNsec = vi.mocked(decryptNsecWithBiometrics);

	type AppState = Parameters<Parameters<typeof appStore.update>[0]>[0];
	const createState = (biometricData: Credentials | null): AppState =>
		({
			nostrKeys: { nsec: null, npub: null, mnemonic: null },
			isLoading: false,
			error: null,
			toasts: [],
			biometricData,
			network: 'testnet',
			pool: {} as any,
			relays: []
		}) as unknown as AppState;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should fall back to authentication prompt when decryption fails', async () => {
		const mockBiometricData: Credentials = {
			username: 'test_npub',
			password: JSON.stringify({ encrypted: 'data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

		// Set up store with biometric data - need to track state changes
		let currentState: AppState = createState(mockBiometricData);
		appStore.set(currentState);
		
		// Update state when store.update is called
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		mockPreferencesGet.mockImplementation(async ({ key }) => {
			if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
			if (key === StorageKeys.NPUB) return { value: 'test_npub' };
			return { value: null };
		});
		// First call fails, second succeeds
		mockDecryptNsec.mockRejectedValueOnce(new Error('Decryption failed'));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);
		const freshBiometricData: Credentials = {
			username: 'new_npub',
			password: JSON.stringify({ encrypted: 'new_data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		mockGetBiometricData.mockResolvedValue(freshBiometricData);
		mockDecryptNsec.mockResolvedValueOnce(validNsec);

		const result = await getNostrKeyPair();

		// Should have cleared cache
		expect(mockAppStoreUpdate).toHaveBeenCalled();
		// Should have prompted for fresh authentication
		expect(mockGetBiometricData).toHaveBeenCalled();
		// Should return fresh data
		expect(result.npub).toBe('new_npub');
	});

	it('should fall back to authentication prompt when validation fails', async () => {
		const mockBiometricData: Credentials = {
			username: 'test_npub',
			password: JSON.stringify({ encrypted: 'data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

		let currentState: AppState = createState(mockBiometricData);
		appStore.set(currentState);
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		// Simulate validation failure (Preferences.get throws on first call)
		mockPreferencesGet.mockRejectedValueOnce(new Error('Validation failed'));
		// Subsequent calls succeed
		mockPreferencesGet.mockResolvedValue({ value: null });

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);
		const freshBiometricData: Credentials = {
			username: 'new_npub',
			password: JSON.stringify({ encrypted: 'new_data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		mockGetBiometricData.mockResolvedValue(freshBiometricData);
		mockDecryptNsec.mockResolvedValueOnce(validNsec);

		const result = await getNostrKeyPair();

		// Should have cleared cache
		expect(mockAppStoreUpdate).toHaveBeenCalled();
		// Should have prompted for fresh authentication
		expect(mockGetBiometricData).toHaveBeenCalled();
		// Should return fresh data
		expect(result.npub).toBe('new_npub');
	});

	it('should never leave user in unrecoverable authentication state', async () => {
		let currentState: AppState = createState(null);
		appStore.set(currentState);
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);
		
		// First attempt fails
		mockGetBiometricData.mockRejectedValueOnce(new Error('First failure'));
		
		// Second attempt succeeds
		const freshBiometricData: Credentials = {
			username: 'new_npub',
			password: JSON.stringify({ encrypted: 'new_data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';
		mockGetBiometricData.mockResolvedValueOnce(freshBiometricData);
		mockDecryptNsec.mockResolvedValueOnce(validNsec);
		mockPreferencesGet.mockResolvedValue({ value: null });

		// Should allow retry after failure
		await expect(getNostrKeyPair()).rejects.toThrow('First failure');

		// Second call should succeed
		const result = await getNostrKeyPair();
		expect(result.npub).toBe('new_npub');
	});

	it('should clear all caches when error occurs', async () => {
		const mockBiometricData: Credentials = {
			username: 'test_npub',
			password: JSON.stringify({ encrypted: 'data' }),
			server: 'test-device',
			isLegacyFormat: true
		};
		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

		let currentState: AppState = createState(mockBiometricData);
		appStore.set(currentState);
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		mockPreferencesGet.mockImplementation(async ({ key }) => {
			if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
			if (key === StorageKeys.NPUB) return { value: 'test_npub' };
			return { value: null };
		});
		// First call fails, second succeeds
		mockDecryptNsec.mockRejectedValueOnce(new Error('Decryption failed'));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);
		mockGetBiometricData.mockResolvedValue({
			username: 'new_npub',
			password: JSON.stringify({ encrypted: 'new_data' }),
			server: 'test-device',
			isLegacyFormat: true
		});
		mockDecryptNsec.mockResolvedValueOnce(validNsec);

		await getNostrKeyPair();

		// Should clear cache
		expect(mockAppStoreUpdate).toHaveBeenCalled();
		
		// Verify the update function clears biometricData
		const updateCall = mockAppStoreUpdate.mock.calls[0][0];
		const state: AppState = createState(mockBiometricData);
		const newState = updateCall(state);
		expect(newState.biometricData).toBeNull();
	});

	it('should handle multiple consecutive failures gracefully', async () => {
		let currentState: AppState = createState(null);
		appStore.set(currentState);
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);
		
		// Multiple failures
		mockGetBiometricData
			.mockRejectedValueOnce(new Error('Failure 1'))
			.mockRejectedValueOnce(new Error('Failure 2'))
			.mockRejectedValueOnce(new Error('Failure 3'));
		
		mockPreferencesGet.mockResolvedValue({ value: null });

		// Each failure should be handled gracefully
		await expect(getNostrKeyPair()).rejects.toThrow('Failure 1');
		await expect(getNostrKeyPair()).rejects.toThrow('Failure 2');
		await expect(getNostrKeyPair()).rejects.toThrow('Failure 3');

		// No unrecoverable state - can still retry
		expect(mockGetBiometricData).toHaveBeenCalledTimes(3);
	});
});

