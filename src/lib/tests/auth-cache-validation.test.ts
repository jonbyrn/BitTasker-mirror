import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNostrKeyPair, getNpub, getAllKeys } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { decryptNsecWithBiometrics, decryptMasterKeyDataFromBiometrics } from '$lib/utils/helpers/auth';

// Mock dependencies
vi.mock('$lib/stores/app.store', () => {
	const { writable } = require('svelte/store');
	const mockStore = writable({ biometricData: null });
	return {
		appStore: {
			get: vi.fn((fn) => fn ? fn(mockStore) : mockStore),
			update: vi.fn((fn) => {
				mockStore.update(fn);
			}),
			subscribe: mockStore.subscribe
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
	decryptNsecWithBiometrics: vi.fn(),
	decryptMasterKeyDataFromBiometrics: vi.fn()
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

describe('Cache Validation Logic', () => {
	const mockAppStoreGet = vi.mocked(appStore.get);
	const mockAppStoreUpdate = vi.mocked(appStore.update);
	const mockPreferencesGet = vi.mocked(Preferences.get);
	const mockDecryptNsec = vi.mocked(decryptNsecWithBiometrics);
	const mockDecryptMasterKey = vi.mocked(decryptMasterKeyDataFromBiometrics);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getNostrKeyPair', () => {
		it('should use cached biometricData when valid and session active', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};
			// Use valid nsec format
			const validNsec = 'nsec1test123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data - need to track state changes
			const { writable } = await import('svelte/store');
			let currentState = { biometricData: mockBiometricData };
			const testStore = writable(currentState);
			
			// Track if update was called (should not be called for valid cached data)
			let updateCalled = false;
			mockAppStoreUpdate.mockImplementation((fn) => {
				updateCalled = true;
				currentState = fn(currentState);
				testStore.set(currentState);
			});
			
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					// get() with function - return the result of calling fn with current state
					return fn(currentState);
				}
				// get() without function - return current state
				return currentState;
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});
			mockDecryptNsec.mockResolvedValue(validNsec);

			const result = await getNostrKeyPair();

			expect(result.npub).toBe('test_npub');
			expect(mockDecryptNsec).toHaveBeenCalledWith(mockBiometricData.password);
			// Should not update store when using valid cached data (returns early)
			expect(updateCalled).toBe(false);
		});

		it('should clear cache and prompt when access token is missing', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data
			const { writable } = await import('svelte/store');
			const testStore = writable({ biometricData: mockBiometricData });
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					let state: any;
					testStore.subscribe((s) => { state = s; })();
					return fn(state);
				}
				let state: any;
				testStore.subscribe((s) => { state = s; })();
				return state;
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: null };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);
			mockGetBiometricData.mockResolvedValue({
				username: 'new_npub',
				password: JSON.stringify({ encrypted: 'new_data' })
			});
			mockDecryptNsec.mockResolvedValue(validNsec);

			await getNostrKeyPair();

			// Should clear cache
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			// Should prompt for fresh authentication
			expect(mockGetBiometricData).toHaveBeenCalled();
		});

		it('should clear cache when cached NPUB does not match stored NPUB', async () => {
			const mockBiometricData = {
				username: 'cached_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data
			const { writable } = await import('svelte/store');
			const testStore = writable({ biometricData: mockBiometricData });
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					let state: any;
					testStore.subscribe((s) => { state = s; })();
					return fn(state);
				}
				let state: any;
				testStore.subscribe((s) => { state = s; })();
				return state;
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'stored_npub' }; // Different!
				return { value: null };
			});

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);
			mockGetBiometricData.mockResolvedValue({
				username: 'new_npub',
				password: JSON.stringify({ encrypted: 'new_data' })
			});
			mockDecryptNsec.mockResolvedValue(validNsec);

			await getNostrKeyPair();

			// Should clear cache
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			// Should prompt for fresh authentication
			expect(mockGetBiometricData).toHaveBeenCalled();
		});

		it('should clear cache and prompt when decryption fails', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data - need to track state changes
			const { writable } = await import('svelte/store');
			let currentState = { biometricData: mockBiometricData };
			const testStore = writable(currentState);
			
			// Update state when store.update is called
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				testStore.set(currentState);
			});
			
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					return fn(currentState);
				}
				return currentState;
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
				password: JSON.stringify({ encrypted: 'new_data' })
			});
			mockDecryptNsec.mockResolvedValueOnce(validNsec);

			await getNostrKeyPair();

			// Should clear cache
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			// Should prompt for fresh authentication
			expect(mockGetBiometricData).toHaveBeenCalled();
		});
	});

	describe('getNpub', () => {
		it('should use cached biometricData when valid', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};

			// Set up store with biometric data
			const { writable } = await import('svelte/store');
			const testStore = writable({ biometricData: mockBiometricData });
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					let state: any;
					testStore.subscribe((s) => { state = s; })();
					return fn(state);
				}
				let state: any;
				testStore.subscribe((s) => { state = s; })();
				return state;
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});

			const result = await getNpub();

			expect(result).toBe('test_npub');
			expect(mockAppStoreUpdate).not.toHaveBeenCalled();
		});

		it('should clear cache when NPUB mismatch detected', async () => {
			const mockBiometricData = {
				username: 'cached_npub',
				password: JSON.stringify({ encrypted: 'data' })
			};

			// Set initial state in store - track state changes
			const { writable } = await import('svelte/store');
			let currentState = { biometricData: mockBiometricData };
			const testStore = writable(currentState);
			
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				testStore.set(currentState);
			});
			
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					return fn(currentState);
				}
				return currentState;
			});

			// Stored NPUB is different from cached, so validation should fail
			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: 'stored_npub' }; // Different from cached!
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				return { value: null };
			});

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);
			mockGetBiometricData.mockResolvedValue({
				username: 'new_npub',
				password: JSON.stringify({ encrypted: 'new_data' })
			});

			await getNpub();

			// Should clear cache when NPUB mismatch is detected
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			// Should prompt for fresh authentication
			expect(mockGetBiometricData).toHaveBeenCalled();
		});
	});

	describe('getAllKeys', () => {
		it('should use cached biometricData when valid and session active', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({
					masterKeyData: { encrypted: 'data' },
					key: 'key'
				})
			};
			const validNsec = 'nsec1test123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data - track state changes
			const { writable } = await import('svelte/store');
			let currentState = { biometricData: mockBiometricData };
			const testStore = writable(currentState);
			
			let updateCalled = false;
			mockAppStoreUpdate.mockImplementation((fn) => {
				updateCalled = true;
				currentState = fn(currentState);
				testStore.set(currentState);
			});
			
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					return fn(currentState);
				}
				return currentState;
			});

			// Ensure NPUB matches to avoid cache clearing
			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' }; // Must match cached username
				return { value: null };
			});
			mockDecryptMasterKey.mockResolvedValue({
				nsec: validNsec,
				mnemonic: 'test mnemonic'
			});

			const result = await getAllKeys();

			expect(result.npub).toBe('test_npub');
			expect(result.mnemonic).toBe('test mnemonic');
			expect(mockDecryptMasterKey).toHaveBeenCalled();
			// Should not update store when using valid cached data (returns early)
			expect(updateCalled).toBe(false);
		});

		it('should clear cache when master key data format is invalid', async () => {
			const mockBiometricData = {
				username: 'test_npub',
				password: JSON.stringify({ invalid: 'format' }) // Missing masterKeyData
			};
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			// Set up store with biometric data
			const { writable } = await import('svelte/store');
			const testStore = writable({ biometricData: mockBiometricData });
			mockAppStoreGet.mockImplementation((fn) => {
				if (fn) {
					let state: any;
					testStore.subscribe((s) => { state = s; })();
					return fn(state);
				}
				let state: any;
				testStore.subscribe((s) => { state = s; })();
				return state;
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);
			mockGetBiometricData.mockResolvedValue({
				username: 'new_npub',
				password: JSON.stringify({
					masterKeyData: { encrypted: 'new_data' },
					key: 'key'
				})
			});
			mockDecryptMasterKey.mockResolvedValue({
				nsec: validNsec,
				mnemonic: 'new mnemonic'
			});

			await getAllKeys();

			// Should clear cache and prompt
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			expect(mockGetBiometricData).toHaveBeenCalled();
		});
	});
});

