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
import { NsecUnlockRequired } from '$lib/utils/helpers/nsec-unlock';
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

	it('treats nsec, nostr, and a key account with no passkey as key login', () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		expect(walletUnlockRoute()).toBe('nsec');
		expect(storedLoginMethod()).toBe('nsec');

		localStorage.setItem('auth_method', 'nostr');
		localStorage.removeItem('CapacitorStorage.auth_method');
		expect(walletUnlockRoute()).toBe('nsec');

		localStorage.clear();
		localStorage.setItem('CapacitorStorage.npub', 'abc123');
		expect(walletUnlockRoute()).toBe('nsec');

		localStorage.setItem('CapacitorStorage.webAuthnCredentialId', 'cred-1');
		expect(walletUnlockRoute()).toBe('passkey');
		localStorage.setItem('CapacitorStorage.auth_method', 'passkey');
		localStorage.removeItem('CapacitorStorage.webAuthnCredentialId');
		expect(walletUnlockRoute()).toBe('passkey');
	});

	it('asks for the nsec and does not call WebAuthn when the new window has no session', async () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		localStorage.setItem('CapacitorStorage.npub', 'viewer');

		await expect(getMnemonic()).rejects.toBeInstanceOf(NsecUnlockRequired);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});

	it('rebuilds the wallet seed from the pasted nsec', async () => {
		const secret = generateSecretKey();
		const nsec = nip19.nsecEncode(secret);
		const npub = getPublicKey(secret);
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');
		localStorage.setItem('CapacitorStorage.npub', npub);

		const mnemonic = await getMnemonic({ nsec });

		expect(mnemonic.trim().split(/\s+/)).toHaveLength(12);
		expect(get(appStore).nostrKeys.npub).toBe(npub);
		expect(get(appStore).nostrKeys.mnemonic).toBe(mnemonic);
		expect(mockGetBiometricData).not.toHaveBeenCalled();
	});

	it('does not start a passkey approval for an nsec account', async () => {
		localStorage.setItem('CapacitorStorage.auth_method', 'nsec');

		await expect(requirePasskeyApproval()).resolves.toBeUndefined();
		expect(mockGetBiometricData).not.toHaveBeenCalled();
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
		mockGetBiometricData.mockResolvedValue(null);

		await expect(requirePasskeyApproval()).rejects.toThrow();
		expect(mockGetBiometricData).toHaveBeenCalled();
	});
});
