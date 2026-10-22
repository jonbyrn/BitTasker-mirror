import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewTimeline } from '$lib/utils/helpers/task-schedule';
import { suppressWebAuthnForNsec } from '$lib/utils/helpers/login-method';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('nsec marks do not block WebAuthn', () => {
	const credentialGet = vi.fn();
	const credentialCreate = vi.fn();
	const storage = new Map<string, string>();

	beforeEach(() => {
		storage.clear();
		suppressWebAuthnForNsec(false);
		vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
		vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
			storage.set(key, value);
		});
		vi.mocked(localStorage.removeItem).mockImplementation((key: string) => {
			storage.delete(key);
		});
		credentialGet.mockReset();
		credentialCreate.mockReset();
		credentialGet.mockResolvedValue(null);
		credentialCreate.mockResolvedValue(null);
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: credentialGet, create: credentialCreate }
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ challenge: CHALLENGE })
			}))
		);
	});

	afterEach(() => {
		suppressWebAuthnForNsec(false);
		vi.unstubAllGlobals();
	});

	it('does not reject an nsec mark as an nsec unlock, and sign-up can still create a passkey', async () => {
		storage.set('CapacitorStorage.access_token', 'session');
		storage.set('CapacitorStorage.auth_method', 'nsec');
		storage.set('bittasker.wallet_login', 'nsec');
		storage.set('CapacitorStorage.webAuthnCredentialId', 'cred-1');
		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const { createWebAuthnCredential } = await import('$lib/utils/helpers/webauthn-create');

		await expect(getBiometricData(true, [])).rejects.not.toMatchObject({
			name: 'NsecUnlockRequired'
		});

		credentialCreate.mockResolvedValue({ id: 'created' });
		await expect(
			createWebAuthnCredential({
				challenge: new Uint8Array(32),
				rp: { name: 'BitTasker' },
				user: { id: new Uint8Array(16), name: 'ada', displayName: 'Ada' },
				pubKeyCredParams: [{ type: 'public-key', alg: -7 }]
			})
		).resolves.toEqual({ id: 'created' });
		expect(credentialCreate).toHaveBeenCalled();
	});

	it('creates a passkey when logout left the previous nsec mark', async () => {
		storage.set('bittasker.wallet_login', 'nsec');
		const { webAuthnBlocked } = await import('$lib/utils/helpers/login-method');
		const { createWebAuthnCredential } = await import('$lib/utils/helpers/webauthn-create');

		expect(webAuthnBlocked()).toBe(false);
		credentialCreate.mockResolvedValue({ id: 'created' });
		await expect(
			createWebAuthnCredential({
				challenge: new Uint8Array(32),
				rp: { name: 'BitTasker' },
				user: { id: new Uint8Array(16), name: 'ada', displayName: 'Ada' },
				pubKeyCredParams: [{ type: 'public-key', alg: -7 }]
			})
		).resolves.toEqual({ id: 'created' });
		expect(credentialCreate).toHaveBeenCalled();
	});

	it('does not reject passkey get while an nsec login flag is set', async () => {
		suppressWebAuthnForNsec(true);
		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');

		await expect(getBiometricData(true, [])).rejects.not.toMatchObject({
			name: 'NsecUnlockRequired'
		});
	});
});

describe('flexible schedule review', () => {
	it('shows flexible copy when a stale date range is still on the draft', () => {
		expect(
			reviewTimeline({
				flexibleSchedule: true,
				dateRange: { start: '2026-10-21T00:00:00.000Z', end: '2026-10-24T00:00:00.000Z' },
				deadline: '2026-10-24T23:59:59.999Z'
			})
		).toBe('flexible');
	});

	it('keeps a chosen range when the poster did not pick flexible', () => {
		expect(
			reviewTimeline({
				flexibleSchedule: false,
				dateRange: { start: '2026-10-21T00:00:00.000Z', end: '2026-10-24T00:00:00.000Z' }
			})
		).toBe('range');
	});
});
