import { beforeEach, describe, expect, it, vi } from 'vitest';

const credentialGet = vi.fn();
const credentialCreate = vi.fn();

vi.mock('$lib/api/services/auth.service', () => ({
	default: { getChallenge: vi.fn(), nostrLogin: vi.fn() }
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' }
}));
vi.mock('capacitor-webauthn', () => ({
	Webauthn: {
		isWebAuthnAvailable: vi.fn(),
		startRegistration: vi.fn(),
		startAuthentication: vi.fn()
	}
}));

import { getBiometricData, setBiometricKey } from '$lib/utils/helpers/biometrics';
import { suppressWebAuthnForNsec } from '$lib/utils/helpers/nsec-webauthn-guard';

describe('nsec sessions never call WebAuthn', () => {
	beforeEach(() => {
		localStorage.clear();
		credentialGet.mockReset();
		credentialCreate.mockReset();
		suppressWebAuthnForNsec(false);
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: credentialGet, create: credentialCreate }
		});
	});

	it('does not call credentials.get or credentials.create for an nsec session', async () => {
		vi.mocked(localStorage.getItem).mockImplementation((key: string) =>
			key === 'CapacitorStorage.auth_method' || key === 'bittasker.wallet_login' ? 'nsec' : null
		);
		await expect(getBiometricData()).rejects.toMatchObject({ name: 'NsecWebAuthnBlocked' });
		await expect(setBiometricKey({ npub: 'abc', exportedKey: 'key' })).rejects.toMatchObject({
			name: 'NsecWebAuthnBlocked'
		});
		expect(credentialGet).not.toHaveBeenCalled();
		expect(credentialCreate).not.toHaveBeenCalled();
	});

	it('does not call WebAuthn while nsec login is in progress', async () => {
		suppressWebAuthnForNsec(true);
		await expect(getBiometricData(true, [])).rejects.toMatchObject({ name: 'NsecWebAuthnBlocked' });
		await expect(setBiometricKey({ npub: 'abc', exportedKey: 'key' })).rejects.toMatchObject({
			name: 'NsecWebAuthnBlocked'
		});
		expect(credentialGet).not.toHaveBeenCalled();
		expect(credentialCreate).not.toHaveBeenCalled();
	});
});
