import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, BaseApiService } from '$lib/api/apiService';
import { AuthService } from '$lib/api/services/auth.service';
import type { EncryptedData } from '$lib/types/auth';

type BaseApiServiceMethods = {
	get: (...args: unknown[]) => unknown;
	post: (...args: unknown[]) => unknown;
};

describe('AuthService error contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('preserves 401 as ApiError for onboarding status checks', async () => {
		const getSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'get');
		getSpy.mockRejectedValueOnce({
			status: 401,
			data: { message: 'Session expired' }
		});

		const service = new AuthService();

		try {
			await service.checkOnboardingStatus();
			throw new Error('Expected checkOnboardingStatus to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toMatchObject({
				status: 401,
				message: 'Session expired'
			});
		}
	});

	it('rethrows existing ApiError 401 unchanged for onboarding status checks', async () => {
		const getSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'get');
		const original = new ApiError('Unauthorized', 401, { reason: 'token-expired' });
		getSpy.mockRejectedValueOnce(original);

		const service = new AuthService();

		try {
			await service.checkOnboardingStatus();
			throw new Error('Expected checkOnboardingStatus to throw');
		} catch (error) {
			expect(error).toBe(original);
		}
	});

	it('maps nostrLogin 400 responses to the user-friendly message', async () => {
		const postSpy = vi.spyOn(BaseApiService.prototype as BaseApiServiceMethods, 'post');
		postSpy.mockRejectedValueOnce(
			new ApiError('Bad Request', 400, { message: 'No account exists for this key' })
		);

		const service = new AuthService();
		const encryptedData: EncryptedData = {
			masterSalt: 'salt',
			nostr: {
				encrypted: { data: 'x', iv: 'y', authTag: 'z' },
				iterations: 1,
				salt: 's1'
			},
			wallet: {
				encrypted: { data: 'x', iv: 'y', authTag: 'z' },
				iterations: 1,
				salt: 's2'
			}
		};
		await expect(
			service.nostrLogin({
				event: {
					id: 'event-id',
					pubkey: 'pubkey',
					created_at: Math.floor(Date.now() / 1000),
					kind: 1,
					tags: [],
					content: 'payload',
					sig: 'signature'
				},
				challenge: 'challenge',
				deviceId: 'device-id',
				authMethod: 'passkey',
				encryptedData,
				deviceName: 'Device',
				credentialId: 'credential-id',
				passkeyPubkey: 'passkey-pubkey',
				clientDataJSON: 'client-data-json',
				attestationObject: 'attestation',
				platform: 'web',
				appVersion: '1.0.0'
			})
		).rejects.toThrow('No account exists for this key');
	});
});
