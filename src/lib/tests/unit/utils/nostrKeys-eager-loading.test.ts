import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

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

vi.mock('svelte/store', async () => {
	const actual = await vi.importActual<typeof import('svelte/store')>('svelte/store');
	return { ...actual };
});

const mockDecryptMasterKey = vi.fn();
const mockDecryptNsecWithBiometrics = vi.fn();
const mockGetBiometricData = vi.fn();
const mockGetPasskeyEncryptedData = vi.fn();
const mockSyncNdkSigner = vi.fn();

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptNsecWithBiometrics: (...args: unknown[]) => mockDecryptNsecWithBiometrics(...args),
	decryptMasterKeyDataFromBiometrics: (...args: unknown[]) => mockDecryptMasterKey(...args)
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

vi.mock('$lib/nostr/ndkSigner', () => ({
	syncNdkSignerFromAppStore: (...args: unknown[]) => mockSyncNdkSigner(...args)
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined)
	}
}));

import { appStore } from '$lib/stores/app.store';
import { getAllKeys, getNostrKeyPair } from '$lib/utils/nostrKeys';

const TEST_NPUB = 'aabbccddee11223344556677889900aabbccddee11223344556677889900aabb';
const TEST_NSEC_HEX = '1122334455667788990011223344556677889900112233445566778899001122';
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

describe('getAllKeys', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAppStore();
		mockSyncNdkSigner.mockResolvedValue(undefined);
	});

	it('should return cached keys from appStore without biometric call (Tier 1)', async () => {
		const nsecBytes = new Uint8Array(32);
		appStore.update((s) => ({
			...s,
			nostrKeys: { nsec: nsecBytes, npub: TEST_NPUB, mnemonic: TEST_MNEMONIC }
		}));

		const result = await getAllKeys();

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.nsec).toBe(nsecBytes);
		expect(result.mnemonic).toBe(TEST_MNEMONIC);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});

	it('should use biometricData cache (Tier 2) and cache result in nostrKeys', async () => {
		appStore.update((s) => ({
			...s,
			biometricData: {
				npub: TEST_NPUB,
				exportedKey: TEST_EXPORTED_KEY,
				encryptedData: { masterSalt: 'salt', nostr: {} as never, wallet: {} as never },
				credentialId: 'cred-123'
			}
		}));

		mockDecryptMasterKey.mockResolvedValue({
			nsec: TEST_NSEC_HEX,
			mnemonic: TEST_MNEMONIC
		});

		const result = await getAllKeys();

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.mnemonic).toBe(TEST_MNEMONIC);
		expect(mockDecryptMasterKey).toHaveBeenCalledWith(
			expect.objectContaining({ masterSalt: 'salt' }),
			TEST_EXPORTED_KEY
		);
		expect(mockGetBiometricData).not.toHaveBeenCalled();

		const store = get(appStore);
		expect(store.nostrKeys.mnemonic).toBe(TEST_MNEMONIC);
		expect(store.nostrKeys.npub).toBe(TEST_NPUB);
	});

	it('should call biometric auth (Tier 3) when no cache exists and cache result', async () => {
		mockGetBiometricData.mockResolvedValue({
			npub: TEST_NPUB,
			exportedKey: TEST_EXPORTED_KEY,
			credentialId: 'cred-123',
			challenge: 'test-challenge',
			response: { userHandle: 'packed-keys' }
		});

		mockGetPasskeyEncryptedData.mockResolvedValue({
			encryptedData: { masterSalt: 'salt', nostr: {} as never, wallet: {} as never }
		});

		mockDecryptMasterKey.mockResolvedValue({
			nsec: TEST_NSEC_HEX,
			mnemonic: TEST_MNEMONIC
		});

		const result = await getAllKeys({ interactive: true });

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.mnemonic).toBe(TEST_MNEMONIC);
		expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
		expect(mockGetPasskeyEncryptedData).toHaveBeenCalledTimes(1);

		const store = get(appStore);
		expect(store.nostrKeys.mnemonic).toBe(TEST_MNEMONIC);
		expect(store.nostrKeys.npub).toBe(TEST_NPUB);
		expect(store.biometricData).not.toBeNull();
	});

	it('does not open WebAuthn on a page-load read', async () => {
		await expect(getAllKeys()).rejects.toThrow('PASSKEY_UNLOCK_REQUIRED');
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});

	it('should throw when biometric returns null (Tier 3 failure)', async () => {
		mockGetBiometricData.mockResolvedValue(null);

		await expect(getAllKeys({ interactive: true })).rejects.toThrow('No biometric data found');
	});
});

describe('getNostrKeyPair', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAppStore();
		mockSyncNdkSigner.mockResolvedValue(undefined);
	});

	it('should return cached keys from appStore without biometric call (Tier 1)', async () => {
		const nsecBytes = new Uint8Array(32);
		appStore.update((s) => ({
			...s,
			nostrKeys: { nsec: nsecBytes, npub: TEST_NPUB, mnemonic: null }
		}));

		const result = await getNostrKeyPair();

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.nsec).toBe(nsecBytes);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});
});

describe('no Alby code paths', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetAppStore();
	});

	it('getAllKeys does not check for Alby auth method', async () => {
		const nsecBytes = new Uint8Array(32);
		appStore.update((s) => ({
			...s,
			nostrKeys: { nsec: nsecBytes, npub: TEST_NPUB, mnemonic: TEST_MNEMONIC }
		}));

		const result = await getAllKeys();

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.nsec).toBe(nsecBytes);
		expect(result.mnemonic).toBe(TEST_MNEMONIC);
	});

	it('getNostrKeyPair does not check for Alby auth method', async () => {
		const nsecBytes = new Uint8Array(32);
		appStore.update((s) => ({
			...s,
			nostrKeys: { nsec: nsecBytes, npub: TEST_NPUB, mnemonic: null }
		}));

		const result = await getNostrKeyPair();

		expect(result.npub).toBe(TEST_NPUB);
		expect(result.nsec).toBe(nsecBytes);
	});
});
