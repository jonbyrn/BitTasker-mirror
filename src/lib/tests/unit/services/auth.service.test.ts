import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPatch = vi.fn().mockResolvedValue({ data: { success: true, lang: 'es' } });
const mockPost = vi.fn().mockResolvedValue({ data: {} });
const mockGet = vi.fn().mockResolvedValue({ data: {} });
const mockDelete = vi.fn().mockResolvedValue({ data: {} });

vi.mock('$lib/api/apiService', () => ({
	BaseApiService: class {
		patch = mockPatch;
		post = mockPost;
		get = mockGet;
		delete = mockDelete;
	}
}));

const { AuthService } = await import('$lib/api/services/auth.service');

describe('AuthService', () => {
	let authService: InstanceType<typeof AuthService>;

	beforeEach(() => {
		vi.clearAllMocks();
		authService = new AuthService();
	});

	describe('encryptedNostrData', () => {
		it('continues to passkey setup when the account lookup fails', async () => {
			mockPost.mockRejectedValueOnce(Object.assign(new Error('fail'), { status: 500 }));

			const result = await authService.encryptedNostrData({
				event: {
					kind: 22242,
					created_at: 1,
					content: 'challenge',
					tags: [],
					pubkey: 'a'.repeat(64),
					id: 'b'.repeat(64),
					sig: 'c'.repeat(128)
				},
				deviceId: 'device',
				deviceName: 'browser',
				platform: 'web',
				appVersion: '0.0.1'
			});

			expect(result).toBeUndefined();
		});
	});

	describe('updateLanguage', () => {
		it('should call PATCH /api/v1/auth/language with the lang parameter', async () => {
			await authService.updateLanguage('es');

			expect(mockPatch).toHaveBeenCalledWith('/api/v1/auth/language', { lang: 'es' });
		});

		it('should support en language', async () => {
			await authService.updateLanguage('en');

			expect(mockPatch).toHaveBeenCalledWith('/api/v1/auth/language', { lang: 'en' });
		});
	});
});
