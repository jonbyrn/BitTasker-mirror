import { generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { nip19 } from 'nostr-tools';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

vi.stubEnv('VITE_TEST_MNEMONIC', '');

const mockGetBiometricData = vi.fn();

vi.mock('$lib/utils/helpers/biometrics', () => ({
	checkBiometricAvailability: vi.fn().mockResolvedValue(true),
	getBiometricData: (...args: unknown[]) => mockGetBiometricData(...args),
	cancelPasskeyPrompt: vi.fn(),
	prefetchPasskeyChallenge: vi.fn()
}));

vi.mock('$lib/api/services/auth.service', () => ({
	default: {
		getChallenge: vi.fn().mockResolvedValue({ challenge: 'challenge-1' }),
		encryptedNostrData: vi.fn().mockResolvedValue(undefined),
		getPasskeyEncryptedData: vi.fn()
	}
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn().mockResolvedValue('device-1'),
	createUserDeviceShortName: vi.fn().mockResolvedValue('web-test')
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null }),
		set: vi.fn().mockResolvedValue(undefined)
	}
}));

import { appStore } from '$lib/stores/app.store';
import { getMnemonic } from '$lib/utils/helpers/mnemonic';
import { storedLoginMethod, walletUnlockRoute } from '$lib/utils/helpers/login-method';
import { requirePasskeyApproval } from '$lib/utils/helpers/passkey-approval';

const browserStore = new Map<string, string>();

function installBrowserStore() {
	vi.mocked(localStorage.getItem).mockImplementation(
		(key: string) => browserStore.get(key) ?? null
	);
	vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
		browserStore.set(key, value);
	});
	vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
		browserStore.delete(key);
	});
	vi.mocked(localStorage.clear).mockImplementation(() => {
		browserStore.clear();
	});
}

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

describe('nsec wallet unlock', () => {
	beforeEach(() => {
		mockGetBiometricData.mockReset();
		browserStore.clear();
		installBrowserStore();
		sessionStorage.clear();
		resetAppStore();
	});

	it('unlocks with a passkey even when the stored method is nsec, nostr, or a bare key', () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		expect(walletUnlockRoute()).toBe('passkey');
		expect(storedLoginMethod()).toBe('nsec');

		localStorage.setItem('auth_method', 'nostr');
		localStorage.removeItem('CapacitorStorage.auth_method');
		expect(walletUnlockRoute()).toBe('passkey');

		localStorage.clear();
		localStorage.setItem('CapacitorStorage.npub', 'abc123');
		expect(walletUnlockRoute()).toBe('passkey');

		localStorage.setItem('CapacitorStorage.webAuthnCredentialId', 'cred-1');
		expect(walletUnlockRoute()).toBe('passkey');
		localStorage.setItem('CapacitorStorage.auth_method', 'passkey');
		expect(walletUnlockRoute()).toBe('passkey');
		localStorage.removeItem('CapacitorStorage.webAuthnCredentialId');
		expect(walletUnlockRoute()).toBe('passkey');

		localStorage.setItem('CapacitorStorage.webAuthnCredentialId', 'cred-1');
		localStorage.setItem('bittasker.wallet_login', 'nsec');
		expect(walletUnlockRoute()).toBe('passkey');
	});

	it('keeps a passkey account on the passkey when the credential id is missing', () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'passkey');
		localStorage.setItem('CapacitorStorage.npub', 'viewer');

		expect(walletUnlockRoute()).toBe('passkey');
	});

	it('asks for the passkey and does not throw an nsec unlock when the window has no session', async () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		localStorage.setItem('CapacitorStorage.npub', 'viewer');
		mockGetBiometricData.mockResolvedValue(null);

		await expect(getMnemonic()).rejects.toThrow('No biometric data found');
		expect(mockGetBiometricData).toHaveBeenCalled();
	});

	it('does not rebuild the wallet seed from a pasted nsec', async () => {
		const secret = generateSecretKey();
		const nsec = nip19.nsecEncode(secret);
		const npub = getPublicKey(secret);
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		localStorage.setItem('CapacitorStorage.npub', npub);
		mockGetBiometricData.mockResolvedValue(null);

		await expect(getMnemonic({ nsec })).rejects.toThrow('No biometric data found');
		expect(mockGetBiometricData).toHaveBeenCalled();
		expect(get(appStore).nostrKeys.mnemonic).toBeNull();
	});

	it('starts a passkey approval for an account whose stored method is nsec', async () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		mockGetBiometricData.mockResolvedValue(null);

		await expect(requirePasskeyApproval()).rejects.toThrow();
		expect(mockGetBiometricData).toHaveBeenCalled();
	});

	afterAll(() => {
		vi.mocked(localStorage.getItem)
			.mockReset()
			.mockImplementation(() => null);
		vi.mocked(localStorage.setItem).mockReset();
		vi.mocked(localStorage.removeItem).mockReset();
		vi.mocked(localStorage.clear).mockReset();
	});

	it('still starts WebAuthn for a passkey account', async () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'passkey');
		localStorage.setItem('CapacitorStorage.webAuthnCredentialId', 'cred-1');
		mockGetBiometricData.mockResolvedValue(null);

		await expect(requirePasskeyApproval()).rejects.toThrow();
		expect(mockGetBiometricData).toHaveBeenCalled();
	});
});
