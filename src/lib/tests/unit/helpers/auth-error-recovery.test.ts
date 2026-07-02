import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import { appStore } from '$lib/stores/app.store';
import { Preferences } from '@capacitor/preferences';
import { decryptNsecWithBiometrics } from '$lib/utils/helpers/auth';
import type { BiometricData, Credentials, EncryptedData } from '$lib/types/auth';

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

function createBiometricData(npub: string, overrides?: Partial<BiometricData>): BiometricData {
	return {
		npub,
		encryptedData: mockEncryptedData,
		exportedKey: 'exportedKey',
		...overrides
	} as unknown as BiometricData;
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
		verifyPasskey: vi.fn(),
		getChallenge: vi.fn().mockResolvedValue({ challenge: 'test-challenge' })
	}
}));

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
			set: mockStore.set,
			update: mockStore.update,
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn(),
			showInfoToast: vi.fn()
		}
	};
});

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn().mockResolvedValue(undefined),
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

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		$currentPubkey: null,
		signer: null,
		cacheAdapter: null,
		addExplicitRelay: vi.fn()
	}
}));

vi.mock('$lib/nostr/ndkSigner', () => ({
	syncNdkSignerFromAppStore: vi.fn().mockResolvedValue(undefined),
	applyNdkSignerFromNsec: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('$lib/runes/unpublishedEventsRetry.svelte', () => ({
	unpublishedEventsRetry: {
		start: vi.fn(),
		stop: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/biometricErrorHandler', () => ({
	handleBiometricError: vi.fn().mockResolvedValue('Biometric error')
}));

describe('Error Recovery and Fallback', () => {
	const _mockAppStoreUpdate = vi.mocked(appStore.update);
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
		mockDecryptNsec.mockReset();
		mockDecryptNsec.mockResolvedValue('decrypted_nsec');

		const authService = await import('$lib/api/services/auth.service');
		const mockAuthService = vi.mocked(authService.default);
		mockAuthService.getPasskeyEncryptedData = vi.fn().mockResolvedValue({
			encryptedData: mockEncryptedData
		});
	});

	it('should throw when decryption fails with cached biometricData', async () => {
		const mockBiometricData = createBiometricData('test_npub');

		appStore.set(createState(mockBiometricData));
		mockPreferencesGet.mockImplementation(async () => ({ value: null }));
		mockDecryptNsec.mockRejectedValue(new Error('Decryption failed'));

		await expect(getNostrKeyPair()).rejects.toThrow('Decryption failed');
	});

	it('should throw when Preferences.get fails before using biometricData', async () => {
		const mockBiometricData = createBiometricData('test_npub');

		appStore.set(createState(mockBiometricData));
		mockPreferencesGet.mockRejectedValue(new Error('Validation failed'));

		await expect(getNpub()).rejects.toThrow('Validation failed');
	});

	it('should never leave user in unrecoverable authentication state', async () => {
		appStore.set(createState(null));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);

		mockGetBiometricData.mockRejectedValueOnce(new Error('First failure'));
		mockPreferencesGet.mockResolvedValue({ value: null });

		await expect(getNostrKeyPair()).rejects.toThrow('First failure');

		const validNsec = 'nsec1new123456789012345678901234567890123456789012345678901234567890';
		mockGetBiometricData.mockResolvedValueOnce(createCredentials('new_npub'));
		mockDecryptNsec.mockResolvedValueOnce(validNsec);

		const result = await getNostrKeyPair();
		expect(result.npub).toBe('new_npub');
	});

	it('should throw when decryption fails without retrying', async () => {
		const mockBiometricData = createBiometricData('test_npub');

		appStore.set(createState(mockBiometricData));
		mockPreferencesGet.mockImplementation(async () => ({ value: null }));
		mockDecryptNsec.mockRejectedValue(new Error('Decryption failed'));

		await expect(getNostrKeyPair()).rejects.toThrow('Decryption failed');
	});

	it('should handle multiple consecutive failures gracefully', async () => {
		appStore.set(createState(null));

		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const mockGetBiometricData = vi.mocked(getBiometricData);

		mockGetBiometricData
			.mockRejectedValueOnce(new Error('Failure 1'))
			.mockRejectedValueOnce(new Error('Failure 2'))
			.mockRejectedValueOnce(new Error('Failure 3'));

		mockPreferencesGet.mockResolvedValue({ value: null });

		await expect(getNostrKeyPair()).rejects.toThrow('Failure 1');
		await expect(getNostrKeyPair()).rejects.toThrow('Failure 2');
		await expect(getNostrKeyPair()).rejects.toThrow('Failure 3');

		expect(mockGetBiometricData).toHaveBeenCalledTimes(3);
	});
});
