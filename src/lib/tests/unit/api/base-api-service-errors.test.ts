import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AxiosResponse } from 'axios';

const mockGet = vi.hoisted(() => vi.fn());
const mockPost = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());
const mockPatch = vi.hoisted(() => vi.fn());
const mockDelete = vi.hoisted(() => vi.fn());

vi.mock('$lib/api/axios', () => ({
	default: vi.fn(async () => ({
		get: mockGet,
		post: mockPost,
		put: mockPut,
		patch: mockPatch,
		delete: mockDelete
	}))
}));

describe('BaseApiService error contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('formats successful responses consistently', async () => {
		const { BaseApiService } = await import('$lib/api/apiService');
		class TestService extends BaseApiService {
			public async read<T>(url: string) {
				return await this.get<T>(url);
			}
		}

		const response = {
			data: { ok: true },
			status: 200,
			statusText: 'OK'
		} as AxiosResponse;
		mockGet.mockResolvedValueOnce(response);

		const service = new TestService('https://example.com');
		await expect(service.read('/status')).resolves.toEqual({
			data: { ok: true },
			status: 200,
			message: 'OK'
		});
	});

	it('maps axios-like object errors to ApiError even without AxiosError instance', async () => {
		const { BaseApiService, ApiError } = await import('$lib/api/apiService');
		class TestService extends BaseApiService {
			public async read<T>(url: string) {
				return await this.get<T>(url);
			}
		}

		mockGet.mockRejectedValueOnce({
			isAxiosError: true,
			response: {
				status: 401,
				data: { message: 'Unauthorized' }
			},
			message: 'Request failed'
		});

		const service = new TestService('https://example.com');
		try {
			await service.read('/secure');
			throw new Error('Expected service.read to throw');
		} catch (error) {
			expect(error).toBeInstanceOf(ApiError);
			expect(error).toMatchObject({
				name: 'ApiError',
				status: 401,
				message: 'Unauthorized'
			});
		}
	});

	it('extracts nested data.error.message from backend payloads', async () => {
		const { BaseApiService } = await import('$lib/api/apiService');
		class TestService extends BaseApiService {
			public async read<T>(url: string) {
				return await this.get<T>(url);
			}
		}

		mockGet.mockRejectedValueOnce({
			response: {
				status: 422,
				data: { error: { message: 'Validation failed' } }
			},
			message: 'Bad Request'
		});

		const service = new TestService('https://example.com');
		await expect(service.read('/validate')).rejects.toMatchObject({
			status: 422,
			message: 'Validation failed'
		});
	});

	it('maps plain Error and string throws to ApiError(500)', async () => {
		const { BaseApiService } = await import('$lib/api/apiService');
		class TestService extends BaseApiService {
			public async read<T>(url: string) {
				return await this.get<T>(url);
			}
		}

		const service = new TestService('https://example.com');

		mockGet.mockRejectedValueOnce(new Error('Network unavailable'));
		await expect(service.read('/health')).rejects.toMatchObject({
			status: 500,
			message: 'Network unavailable'
		});

		mockGet.mockRejectedValueOnce('Request timeout');
		await expect(service.read('/health')).rejects.toMatchObject({
			status: 500,
			message: 'Request timeout'
		});
	});
});
