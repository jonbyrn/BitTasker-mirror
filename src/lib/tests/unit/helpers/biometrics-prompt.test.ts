import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { passkeyPrompt } from '$lib/utils/helpers/passkey-prompt';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const CREDENTIAL_ID = 'cGFzc2tleS1pZC0x';

function hang<T>(): Promise<T> {
	return new Promise<T>(() => undefined);
}

describe.sequential('passkey prompt', () => {
	const credentialGet = vi.fn(() => hang<Credential | null>());
	const storage = new Map<string, string>();

	beforeEach(() => {
		vi.stubEnv('VITE_API_URL', 'https://api-staging.bittasker.com');
		storage.clear();
		storage.set('CapacitorStorage.webAuthnCredentialId', CREDENTIAL_ID);
		vi.mocked(localStorage.getItem).mockImplementation((key: string) => storage.get(key) ?? null);
		vi.mocked(localStorage.setItem).mockImplementation((key: string, value: string) => {
			storage.set(key, value);
		});
		vi.mocked(localStorage.clear).mockImplementation(() => storage.clear());
		credentialGet.mockClear();
		credentialGet.mockImplementation(() => hang<Credential | null>());
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: credentialGet, create: vi.fn() }
		});
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				json: async () => ({ challenge: CHALLENGE })
			}))
		);
		passkeyPrompt.set({ active: false });
	});

	afterEach(() => {
		localStorage.clear();
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
	});

	it('opens WebAuthn in the click and names the saved passkey', async () => {
		const { getBiometricData, prefetchPasskeyChallenge } =
			await import('$lib/utils/helpers/biometrics');
		await prefetchPasskeyChallenge();

		const pending = getBiometricData(true, []);
		getBiometricData(true, []);

		expect(credentialGet).toHaveBeenCalledTimes(1);
		expect(get(passkeyPrompt).active).toBe(true);
		const request = credentialGet.mock.calls[0]?.[0] as {
			publicKey: { allowCredentials: { id: ArrayBuffer }[] };
		};
		const id = new Uint8Array(request.publicKey.allowCredentials[0].id);
		expect(Array.from(id)).toEqual(
			Array.from(Uint8Array.from(atob(CREDENTIAL_ID), (c) => c.charCodeAt(0)))
		);
		pending.catch(() => undefined);
	});

	it('does not show the approve banner or wait when no challenge is ready', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(() => hang<Response>())
		);
		vi.resetModules();
		const { getBiometricData } = await import('$lib/utils/helpers/biometrics');
		const started = Date.now();

		await expect(getBiometricData(true, [])).rejects.toThrow('Tap again to approve your passkey');

		expect(Date.now() - started).toBeLessThan(1000);
		expect(credentialGet).not.toHaveBeenCalled();
		expect(get(passkeyPrompt).active).toBe(false);
	});
});
