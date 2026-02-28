/**
 * Tests that in-session passkey prompts (nostrKeys.getBiometrics path and mnemonic.getMnemonic)
 * do not pass allowCredentialIds by default, and do pass it when user is logged in with passkey
 * and WEB_AUTHN_CREDENTIAL_ID is stored.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import type { Credentials } from '$lib/types/auth';
import type { BiometricData } from '$lib/types/auth';

function createMockCredentials(npub = 'npub1test'): Credentials {
	return {
		npub,
		challenge: 'challenge',
		credentialId: 'cred-id-from-assertion',
		exportedKey: 'exportedKey',
		response: {
			authenticatorData: 'authData',
			clientDataJSON: 'clientData',
			signature: 'sig',
			userHandle: 'handle'
		}
	};
}

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn(),
		set: vi.fn(),
		remove: vi.fn()
	}
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
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
	const store = writable(createState(null));
	return {
		appStore: {
			subscribe: store.subscribe,
			set: vi.fn((v: unknown) => store.set(v as never)),
			update: vi.fn((fn: (s: unknown) => unknown) => store.update(fn as never)),
			showSuccessToast: vi.fn(),
			showErrorToast: vi.fn(),
			showInfoToast: vi.fn()
		}
	};
});

vi.mock('$lib/utils/helpers/auth', () => ({
	decryptNsecWithBiometrics: vi
		.fn()
		.mockResolvedValue('nsec1test123456789012345678901234567890123456789012345678901234567890'),
	decryptMasterKeyDataFromBiometrics: vi.fn().mockResolvedValue({
		nsec: 'nsec1test123456789012345678901234567890123456789012345678901234567890',
		mnemonic: 'test mnemonic'
	}),
	decryptWalletMnemonicWithBiometrics: vi.fn().mockResolvedValue('test mnemonic twelve words')
}));

vi.mock('nostr-tools', () => ({
	nip19: {
		decode: vi.fn((nsec: string) => {
			if (nsec.startsWith('nsec1')) {
				return {
					data: new Uint8Array(32).fill(1)
				};
			}
			throw new Error('Invalid nsec');
		})
	}
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getPasskeyEncryptedData: vi.fn().mockResolvedValue({
			encryptedData: {
				nostr: { encrypted: { data: '', iv: '', authTag: '' }, salt: '', iterations: 100000 },
				wallet: { encrypted: { data: '', iv: '', authTag: '' }, salt: '', iterations: 100000 },
				masterSalt: ''
			}
		})
	}
}));

const mockGetBiometricData = vi.fn();
const mockGetWebBiometricData = vi.fn();

vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: vi.fn().mockResolvedValue(true),
	getBiometricData: (...args: unknown[]) => mockGetBiometricData(...args)
}));

vi.mock('$lib/utils/helpers/webBiometrics', () => ({
	getWebBiometricData: (...args: unknown[]) => mockGetWebBiometricData(...args)
}));

describe('in-session passkey credential ID', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetBiometricData.mockResolvedValue(createMockCredentials());
		mockGetWebBiometricData.mockResolvedValue(createMockCredentials());
	});

	describe('nostrKeys getBiometrics path', () => {
		it('calls getBiometricData with (true) only when no stored credential ID (current behavior)', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				return { value: null };
			});

			await getNpub();

			expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
			expect(mockGetBiometricData).toHaveBeenCalledWith(true);
			expect(mockGetBiometricData.mock.calls[0]).toHaveLength(1);
		});

		it('calls getBiometricData with (true, [storedCredentialId]) when AUTH_METHOD is passkey and WEB_AUTHN_CREDENTIAL_ID is set', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			const storedCredentialId = 'stored-cred-id-base64url';
			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				if (key === StorageKeys.AUTH_METHOD) return { value: 'passkey' };
				if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: storedCredentialId };
				return { value: null };
			});

			await getNpub();

			expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
			expect(mockGetBiometricData).toHaveBeenCalledWith(true, [storedCredentialId]);
		});

		it('calls getBiometricData with (true) only when AUTH_METHOD is not passkey', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				if (key === StorageKeys.AUTH_METHOD) return { value: 'alby' };
				if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: 'some-id' };
				return { value: null };
			});

			await getNpub();

			expect(mockGetBiometricData).toHaveBeenCalledWith(true);
			expect(mockGetBiometricData.mock.calls[0]).toHaveLength(1);
		});

		it('calls getBiometricData with (true) only when WEB_AUTHN_CREDENTIAL_ID is empty', async () => {
			const { getNpub } = await import('$lib/utils/nostrKeys');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.NPUB) return { value: null };
				if (key === StorageKeys.AUTH_METHOD) return { value: 'passkey' };
				if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: '' };
				return { value: null };
			});

			await getNpub();

			expect(mockGetBiometricData).toHaveBeenCalledWith(true);
			expect(mockGetBiometricData.mock.calls[0]).toHaveLength(1);
		});
	});

	describe('mnemonic getMnemonic', () => {
		it('calls getBiometricData with (true) only when no stored credential ID (current behavior)', async () => {
			const { getMnemonic } = await import('$lib/utils/helpers/mnemonic');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			vi.mocked(Preferences.get).mockResolvedValue({ value: null });

			await getMnemonic();

			expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
			expect(mockGetBiometricData).toHaveBeenCalledWith(true);
			expect(mockGetBiometricData.mock.calls[0]).toHaveLength(1);
		});

		it('calls getBiometricData with (true, [storedCredentialId]) when AUTH_METHOD is passkey and WEB_AUTHN_CREDENTIAL_ID is set', async () => {
			const { getMnemonic } = await import('$lib/utils/helpers/mnemonic');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			const storedCredentialId = 'mnemonic-stored-cred-id';
			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.AUTH_METHOD) return { value: 'passkey' };
				if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: storedCredentialId };
				return { value: null };
			});

			await getMnemonic();

			expect(mockGetBiometricData).toHaveBeenCalledTimes(1);
			expect(mockGetBiometricData).toHaveBeenCalledWith(true, [storedCredentialId]);
		});

		it('calls getBiometricData with (true) only when AUTH_METHOD is not passkey', async () => {
			const { getMnemonic } = await import('$lib/utils/helpers/mnemonic');
			const { appStore } = await import('$lib/stores/app.store');

			appStore.set({
				nostrKeys: { nsec: null, npub: null, mnemonic: null },
				isLoading: false,
				error: null,
				toasts: [],
				biometricData: null,
				network: 'testnet',
				pool: {},
				relays: []
			} as never);

			vi.mocked(Preferences.get).mockImplementation(async ({ key }) => {
				if (key === StorageKeys.AUTH_METHOD) return { value: 'alby' };
				if (key === StorageKeys.WEB_AUTHN_CREDENTIAL_ID) return { value: 'some-id' };
				return { value: null };
			});

			await getMnemonic();

			expect(mockGetBiometricData).toHaveBeenCalledWith(true);
			expect(mockGetBiometricData.mock.calls[0]).toHaveLength(1);
		});
	});
});
