import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';
import { Preferences } from '@capacitor/preferences';
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import type { BiometricData, Credentials, EncryptedData } from '$lib/types/auth';

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

function createBiometricData(npub: string, overrides?: Partial<BiometricData>): BiometricData {
	return {
		npub,
		encryptedData: mockEncryptedData,
		exportedKey: 'exportedKey',
		...overrides
	};
}

function createCredentials(npub: string, overrides?: Partial<Credentials>): Credentials {
	return {
		npub,
		credentialId: 'cid',
		challenge: 'test-challenge',
		exportedKey: 'exportedKey',
		response: {
			authenticatorData: 'auth-data',
			clientDataJSON: 'client-data',
			signature: 'signature'
		},
		...overrides
	};
}

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadFile: vi.fn(),
		uploadMultipleFiles: vi.fn()
	}
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getPasskeyEncryptedData: vi.fn(),
		verifyPasskey: vi.fn()
	}
}));

// Hoist the writable implementation to avoid hoisting issues
const mockWritable = vi.hoisted(() => <T>(initialValue: T) => {
	let value = initialValue;
	const subscribers = new Set<(value: T) => void>();
	return {
		subscribe: (fn: (value: T) => void) => {
			subscribers.add(fn);
			fn(value);
			return () => subscribers.delete(fn);
		},
		set: (newValue: T) => {
			value = newValue;
			subscribers.forEach((fn) => fn(value));
		},
		update: (updateFn: (value: T) => T) => {
			value = updateFn(value);
			subscribers.forEach((fn) => fn(value));
		}
	};
});

// Mock dependencies
vi.mock('$lib/stores/app.store', () => {
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

	const mockStore = mockWritable(createState(null));
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

describe('Error Recovery and Fallback', () => {
	const mockAppStoreUpdate = vi.mocked(appStore.update);
	const mockPreferencesGet = vi.mocked(Preferences.get);
	const mockDecryptNsec = vi.mocked(decryptNsecWithBiometrics);

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

	beforeEach(async () => {
		vi.clearAllMocks();

		// Setup default mock for auth service
		const authService = await import('$lib/api/services/auth.service');
		const mockAuthService = vi.mocked(authService.default);
		mockAuthService.getPasskeyEncryptedData = vi.fn().mockResolvedValue({
			encryptedData: mockEncryptedData
		});
	});

	it('should throw when decryption fails with cached biometricData', async () => {
		const mockBiometricData = createBiometricData('test_npub');

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

	it('should throw when Preferences.get fails before using biometricData', async () => {
		const mockBiometricData = createBiometricData('test_npub');

		appStore.set(createState(mockBiometricData));
		mockPreferencesGet.mockRejectedValue(new Error('Validation failed'));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);

		await expect(getNpub()).rejects.toThrow('Validation failed');
		expect(mockGetBiometricData).not.toHaveBeenCalled();
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
		mockPreferencesGet.mockResolvedValue({ value: null });

		await expect(getNostrKeyPair()).rejects.toThrow('First failure');

		// Second attempt succeeds
		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';
		mockGetBiometricData.mockResolvedValueOnce(createCredentials('new_npub'));
		mockDecryptNsec.mockResolvedValueOnce(validNsec);

		const result = await getNostrKeyPair();
		expect(result.npub).toBe('new_npub');
	});

	it('should throw when decryption fails without retrying', async () => {
		const mockBiometricData = createBiometricData('test_npub');

		let currentState: AppState = createState(mockBiometricData);
		appStore.set(currentState);
		mockAppStoreUpdate.mockImplementation((fn) => {
			currentState = fn(currentState);
			appStore.set(currentState);
		});

		mockPreferencesGet.mockImplementation(async () => ({ value: null }));

		// Ensure the decrypt function actually rejects
		mockDecryptNsec.mockReset();
		mockDecryptNsec.mockRejectedValue(new Error('Decryption failed'));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);

		await expect(getNostrKeyPair()).rejects.toThrow('Decryption failed');
		expect(mockGetBiometricData).not.toHaveBeenCalled();
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
