import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { getNostrKeyPair, getNpub, getAllKeys } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import {
	decryptNsecWithBiometrics,
	decryptMasterKeyDataFromBiometrics
} from '$lib/utils/helpers/auth';
import type { BiometricData, EncryptedData } from '$lib/types/auth';

// Prevent VITE_TEST_MNEMONIC early-return in nostrKeys.ts
vi.stubEnv('VITE_TEST_MNEMONIC', '');

const mockEncryptedData: EncryptedData = {
	nostr: {
		encrypted: { data: 'enc', iv: 'iv', authTag: 'tag' },
		salt: 'salt',
		iterations: 100000
	},
	wallet: {
		encrypted: { data: 'enc', iv: 'iv', authTag: 'tag' },
		salt: 'salt',
		iterations: 100000
	},
	masterSalt: 'masterSalt'
};

function createCredentials(npub: string, overrides?: Partial<BiometricData>): BiometricData {
	return {
		npub,
		encryptedData: mockEncryptedData,
		exportedKey: 'exportedKey',
		...overrides
	} as unknown as BiometricData;
}

// Mock dependencies
vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadFile: vi.fn(),
		uploadMultipleFiles: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');

	// Derive the app store state type from the update() signature (AppStore is not exported).
	const createState = (biometricData: BiometricData | null) => ({
		nostrKeys: { nsec: null, npub: null, mnemonic: null },
		isLoading: false,
		error: null,
		toasts: [],
		biometricData,
		network: 'testnet' as const,
		pool: {} as Record<string, unknown>,
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
	decryptNsecWithBiometrics: vi.fn(),
	decryptMasterKeyDataFromBiometrics: vi.fn()
}));

vi.mock('nostr-tools', () => ({
	nip19: {
		decode: vi.fn((nsec: string) => {
			if (nsec.startsWith('nsec1')) {
				return {
					data: new Uint8Array([
						1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24,
						25, 26, 27, 28, 29, 30, 31, 32
					])
				};
			}
			throw new Error('Invalid nsec format');
		})
	}
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: vi.fn().mockResolvedValue(true),
	getBiometricData: vi.fn()
}));

vi.mock('$lib/nostr/ndkSigner', () => ({
	syncNdkSignerFromAppStore: vi.fn().mockResolvedValue(undefined),
	applyNdkSignerFromNsec: vi.fn().mockResolvedValue(undefined)
}));

describe('Cache Validation Logic', () => {
	const mockAppStoreUpdate = vi.mocked(appStore.update);
	const mockPreferencesGet = vi.mocked(Preferences.get);
	const mockDecryptNsec = vi.mocked(decryptNsecWithBiometrics);
	const mockDecryptMasterKey = vi.mocked(decryptMasterKeyDataFromBiometrics);

	type AppState = Parameters<Parameters<typeof appStore.update>[0]>[0];
	const createState = (biometricData: BiometricData | null): AppState =>
		({
			nostrKeys: { nsec: null, npub: null, mnemonic: null },
			isLoading: false,
			error: null,
			toasts: [],
			biometricData,
			network: 'testnet' as const,
			pool: {} as Record<string, unknown>,
			relays: []
		}) as unknown as AppState;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getNostrKeyPair', () => {
		it('should use cached biometricData when valid and session active', async () => {
			const mockBiometricData = createCredentials('test_npub');
			const validNsec = 'nsec1test123456789012345678901234567890123456789012345678901234567890';

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);

			let updateCalled = false;
			mockAppStoreUpdate.mockImplementation((fn) => {
				updateCalled = true;
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});
			mockDecryptNsec.mockResolvedValue(validNsec);

			const result = await getNostrKeyPair();

			expect(result.npub).toBe('test_npub');
			expect(mockDecryptNsec).toHaveBeenCalledWith(
				mockEncryptedData,
				mockBiometricData.exportedKey
			);
			expect(updateCalled).toBe(true);
		});

		it('should use cached biometricData when access token is missing', async () => {
			const mockBiometricData = createCredentials('test_npub');
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async () => ({ value: null }));
			mockDecryptNsec.mockResolvedValue(validNsec);

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);

			const result = await getNostrKeyPair();

			expect(result.npub).toBe('test_npub');
			expect(mockDecryptNsec).toHaveBeenCalledWith(
				mockEncryptedData,
				mockBiometricData.exportedKey
			);
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			expect(mockGetBiometricData).not.toHaveBeenCalled();
		});

		it('should use cached biometricData when Preferences has different NPUB', async () => {
			const mockBiometricData = createCredentials('cached_npub');
			const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: 'stored_npub' };
				return { value: null };
			});
			mockDecryptNsec.mockResolvedValue(validNsec);

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);

			const result = await getNostrKeyPair();

			expect(result.npub).toBe('cached_npub');
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			expect(mockGetBiometricData).not.toHaveBeenCalled();
		});

		it('should throw when decryption fails with cached biometricData', async () => {
			const mockBiometricData = createCredentials('test_npub');

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async () => ({ value: null }));
			mockDecryptNsec.mockRejectedValue(new Error('Decryption failed'));

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);

			await expect(getNostrKeyPair()).rejects.toThrow('Decryption failed');
			expect(mockGetBiometricData).not.toHaveBeenCalled();
		});
	});

	describe('getNpub', () => {
		it('should use cached biometricData when valid', async () => {
			const mockBiometricData = createCredentials('test_npub');

			appStore.set(createState(mockBiometricData));

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				return { value: null };
			});

			const result = await getNpub();

			expect(result).toBe('test_npub');
			expect(mockAppStoreUpdate).toHaveBeenCalled();
		});

		it('should use cached npub when Preferences has no NPUB', async () => {
			const mockBiometricData = createCredentials('cached_npub');

			appStore.set(createState(mockBiometricData));

			mockAppStoreUpdate.mockImplementation((fn) => {
				const state = get(appStore);
				appStore.set(fn(state));
			});
			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				return { value: null };
			});

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);

			const result = await getNpub();

			expect(result).toBe('cached_npub');
			expect(mockAppStoreUpdate).toHaveBeenCalled();
			expect(mockGetBiometricData).not.toHaveBeenCalled();
		});
	});

	describe('getAllKeys', () => {
		it('should use cached biometricData when valid and session active', async () => {
			const mockBiometricData = createCredentials('test_npub');
			const validNsec = 'nsec1test123456789012345678901234567890123456789012345678901234567890';

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);

			let updateCalled = false;
			mockAppStoreUpdate.mockImplementation((fn) => {
				updateCalled = true;
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async ({ key }) => {
				if (key === StorageKeys.ACCESS_TOKEN) return { value: 'valid_token' };
				if (key === StorageKeys.NPUB) return { value: 'test_npub' };
				return { value: null };
			});
			mockDecryptMasterKey.mockResolvedValue({
				nsec: validNsec,
				mnemonic: 'test mnemonic'
			});

			const result = await getAllKeys();

			expect(result.npub).toBe('test_npub');
			expect(result.mnemonic).toBe('test mnemonic');
			expect(mockDecryptMasterKey).toHaveBeenCalledWith(
				mockEncryptedData,
				mockBiometricData.exportedKey
			);
			expect(updateCalled).toBe(true);
		});

		it('should throw when master key decryption fails', async () => {
			const mockBiometricData = createCredentials('test_npub');

			let currentState: AppState = createState(mockBiometricData);
			appStore.set(currentState);
			mockAppStoreUpdate.mockImplementation((fn) => {
				currentState = fn(currentState);
				appStore.set(currentState);
			});

			mockPreferencesGet.mockImplementation(async () => ({ value: null }));
			mockDecryptMasterKey.mockRejectedValue(new Error('Invalid master key format'));

			const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
			const mockGetBiometricData = vi.mocked(getBiometricData);

			await expect(getAllKeys()).rejects.toThrow('Invalid master key format');
			expect(mockGetBiometricData).not.toHaveBeenCalled();
		});
	});
});
