import { afterEach, describe, expect, it, vi } from 'vitest';
import { unlockWithPrf } from '$lib/wallet/unlockWithPrf';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('login PRF seam', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('leaves the wallet locked when Hotfix 2 has not shipped unlockWithPrf', async () => {
		await expect(unlockWithPrf(new Uint8Array(32).buffer, 'cred-1')).resolves.toBe(false);
		await expect(unlockWithPrf(null, 'cred-1')).resolves.toBe(false);
	});

	it('asks the login assertion for PRF and keeps other prompts unchanged', async () => {
		vi.stubEnv('VITE_API_URL', 'https://api-staging.bittasker.com');
		vi.stubEnv('VITE_E2E_TEST', '');
		vi.stubEnv('VITE_E2E_TURNSTILE_BYPASS', '');
		vi.stubEnv('VITE_SKIP_PASSKEY', '');
		const credentialGet = vi.fn(() => new Promise<Credential | null>(() => undefined));
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

		const { cancelPasskeyPrompt, getBiometricData, prefetchPasskeyChallenge } = await import(
			'$lib/utils/helpers/biometrics'
		);
		await prefetchPasskeyChallenge();
		const login = getBiometricData(false, [], undefined, { requestPrf: true });
		login.catch(() => undefined);

		const loginKey = credentialGet.mock.calls[0]?.[0] as {
			publicKey: { extensions?: { prf?: { eval?: { first?: BufferSource } } } };
		};
		expect(loginKey.publicKey.extensions?.prf?.eval?.first).toBeTruthy();

		cancelPasskeyPrompt();
		await prefetchPasskeyChallenge();
		const other = getBiometricData(false, []);
		other.catch(() => undefined);
		const otherKey = credentialGet.mock.calls.at(-1)?.[0] as {
			publicKey: { extensions?: { prf?: unknown } };
		};
		expect(otherKey.publicKey.extensions?.prf).toBeUndefined();
	});
});
