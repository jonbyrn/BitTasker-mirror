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
