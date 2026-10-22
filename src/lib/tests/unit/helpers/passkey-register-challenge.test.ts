import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CHALLENGE = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NPUB = 'ab'.repeat(32);
const EXPORTED_KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

function hang<T>(): Promise<T> {
	return new Promise<T>(() => undefined);
}

async function loadBiometrics() {
	vi.resetModules();
	const { default: authService } = await import('$lib/api/services/auth.service');
	vi.spyOn(authService, 'getChallenge').mockImplementation(() => hang());
	const biometrics = await import('$lib/utils/helpers/biometrics');
	return { authService, ...biometrics };
}

describe.sequential('passkey registration challenge', () => {
	const credentialCreate = vi.fn(() => hang<Credential | null>());

	beforeEach(() => {
		vi.stubEnv('VITE_API_URL', 'https://api-staging.bittasker.com');
		credentialCreate.mockClear();
		credentialCreate.mockImplementation(() => hang<Credential | null>());
		Object.defineProperty(window, 'PublicKeyCredential', {
			configurable: true,
			value: class PublicKeyCredential {}
		});
		Object.defineProperty(navigator, 'credentials', {
			configurable: true,
			value: { get: vi.fn(), create: credentialCreate }
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.unstubAllEnvs();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	it('opens WebAuthn with a challenge fetched before the click', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => ({
				ok: true,
				status: 200,
				json: async () => ({ challenge: CHALLENGE })
			}))
		);
		const { authService, prefetchPasskeyChallenge, setBiometricKey } = await loadBiometrics();
		await prefetchPasskeyChallenge();

		const pending = setBiometricKey({
			npub: NPUB,
			exportedKey: EXPORTED_KEY,
			username: 'ada'
		});

		expect(credentialCreate).toHaveBeenCalledTimes(1);
		expect(authService.getChallenge).not.toHaveBeenCalled();
		const request = credentialCreate.mock.calls[0]?.[0] as {
			publicKey: { challenge: ArrayBuffer; rp: { id: string } };
		};
		const bytes = new Uint8Array(request.publicKey.challenge);
		expect(Array.from(bytes)).toEqual(
			Array.from(Uint8Array.from(atob(CHALLENGE), (c) => c.charCodeAt(0)))
		);
		expect(request.publicKey.rp.id).toBe(window.location.hostname);
		pending.catch(() => undefined);
	});

	it('does not open WebAuthn or wait on the auth API when no challenge is ready', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn((url: string) => {
				if (String(url).includes('/auth/challenge')) return hang<Response>();
				return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
			})
		);
		const { authService, setBiometricKey } = await loadBiometrics();
		const started = Date.now();

		const outcome = await Promise.race([
			setBiometricKey({
				npub: NPUB,
				exportedKey: EXPORTED_KEY,
				username: 'ada'
			}).then(
				() => 'resolved',
				() => 'rejected'
			),
			new Promise<string>((resolve) => setTimeout(() => resolve('timeout'), 1000))
		]);

		expect(outcome).toBe('rejected');
		expect(Date.now() - started).toBeLessThan(1000);
		expect(credentialCreate).not.toHaveBeenCalled();
		expect(authService.getChallenge).not.toHaveBeenCalled();
	});

	it('gives up on a hung challenge fetch within 8 seconds', async () => {
		vi.useFakeTimers();
		vi.stubGlobal(
			'fetch',
			vi.fn((_url: string, init?: RequestInit) => {
				return new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => {
						reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
					});
				});
			})
		);
		const { authService, prefetchPasskeyChallenge, passkeyChallengeFailure, peekPasskeyChallenge } =
			await loadBiometrics();

		const pending = prefetchPasskeyChallenge();
		await vi.advanceTimersByTimeAsync(8_000);
		await pending;

		expect(peekPasskeyChallenge()).toBeNull();
		expect(passkeyChallengeFailure()).toBe('network');
		expect(authService.getChallenge).not.toHaveBeenCalled();
	});
});
