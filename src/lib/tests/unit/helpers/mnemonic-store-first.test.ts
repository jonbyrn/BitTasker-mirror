import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$lib/api/services/upload.service', () => ({
	default: {
		uploadSingleFile: vi.fn(),
		uploadMultipleFiles: vi.fn(),
		deleteFile: vi.fn(),
		getImageUrl: vi.fn(),
		generateResponsiveUrls: vi.fn()
	}
}));

vi.mock('svelte-i18n', () => ({
	t: { subscribe: () => () => {} },
	locale: { subscribe: () => () => {} }
}));

const mockDecryptWalletMnemonic = vi.fn();
const mockGetBiometricData = vi.fn();
const mockGetPasskeyEncryptedData = vi.fn();

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptWalletMnemonicWithBiometrics: (...args: unknown[]) => mockDecryptWalletMnemonic(...args)
}));

vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: vi.fn().mockResolvedValue(true),
	getBiometricData: (...args: unknown[]) => mockGetBiometricData(...args)
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getPasskeyEncryptedData: (...args: unknown[]) => mockGetPasskeyEncryptedData(...args)
	}
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: 'cred-123' }),
		set: vi.fn().mockResolvedValue(undefined)
	}
}));

import { appStore } from '$lib/stores/app.store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { get } from 'svelte/store';

const TEST_MNEMONIC =
	'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TEST_EXPORTED_KEY = 'test-exported-key-base64';

function resetAppStore() {
	appStore.set({
		nostrKeys: { nsec: null, npub: null, mnemonic: null },
		isLoading: false,
		error: null,
		toasts: [],
		biometricData: null,
		network: 'testnet',
		pool: { subscribe: () => () => {}, publish: () => [], querySync: () => [] } as never,
		relays: []
	});
}

describe('getMnemonic', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAppStore();
	});

	it('should return mnemonic from appStore.nostrKeys (Tier 1) without biometric call', async () => {
		appStore.update((s) => ({
			...s,
			nostrKeys: { ...s.nostrKeys, mnemonic: TEST_MNEMONIC }
		}));

		const result = await getMnemonic();

		expect(result).toBe(TEST_MNEMONIC);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
		expect(mockDecryptWalletMnemonic).not.toHaveBeenCalled();
	});

	it('should fall back to biometricData decryption (Tier 2) when mnemonic not in store', async () => {
		appStore.update((s) => ({
			...s,
			biometricData: {
				npub: 'test-npub',
				exportedKey: TEST_EXPORTED_KEY,
				encryptedData: { masterSalt: 'salt', nostr: {} as never, wallet: {} as never },
				credentialId: 'cred-123'
			}
		}));

		mockDecryptWalletMnemonic.mockResolvedValue(TEST_MNEMONIC);

		const result = await getMnemonic();

		expect(result).toBe(TEST_MNEMONIC);
		expect(mockDecryptWalletMnemonic).toHaveBeenCalledWith(
			expect.objectContaining({ masterSalt: 'salt' }),
			TEST_EXPORTED_KEY
		);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});

	it('should fall back to full biometric auth (Tier 3) when no cache exists', async () => {
		mockGetBiometricData.mockResolvedValue({
			npub: 'test-npub',
			exportedKey: TEST_EXPORTED_KEY,
			credentialId: 'cred-123',
			challenge: 'test-challenge',
			response: { userHandle: 'packed-keys' }
		});

		mockGetPasskeyEncryptedData.mockResolvedValue({
			encryptedData: { masterSalt: 'salt', nostr: {} as never, wallet: {} as never }
		});

		mockDecryptWalletMnemonic.mockResolvedValue(TEST_MNEMONIC);

		const result = await getMnemonic({ interactive: true });

		expect(result).toBe(TEST_MNEMONIC);
		expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
		expect(mockGetPasskeyEncryptedData).toHaveBeenCalledTimes(1);
	});

	it('should cache biometricData in appStore after Tier 3 success', async () => {
		const encryptedData = { masterSalt: 'salt', nostr: {} as never, wallet: {} as never };

		mockGetBiometricData.mockResolvedValue({
			npub: 'test-npub',
			exportedKey: TEST_EXPORTED_KEY,
			credentialId: 'cred-123',
			challenge: 'test-challenge',
			response: { userHandle: 'packed-keys' }
		});

		mockGetPasskeyEncryptedData.mockResolvedValue({ encryptedData });
		mockDecryptWalletMnemonic.mockResolvedValue(TEST_MNEMONIC);

		await getMnemonic({ interactive: true });

		const store = get(appStore);
		if (!store.biometricData) {
			throw new Error('biometricData should not be null after Tier 3 success');
		}
		expect(store.biometricData).not.toBeNull();
		expect(store.biometricData.npub).toBe('test-npub');
		expect(store.biometricData.exportedKey).toBe(TEST_EXPORTED_KEY);
		expect(store.biometricData.encryptedData).toBe(encryptedData);
	});

	it('should throw when biometric returns null', async () => {
		mockGetBiometricData.mockResolvedValue(null);

		await expect(getMnemonic({ interactive: true })).rejects.toThrow('No biometric data found');
	});
});
