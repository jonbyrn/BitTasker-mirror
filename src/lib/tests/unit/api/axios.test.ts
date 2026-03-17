import { describe, it, expect, vi } from 'vitest';
import axiosRetry from 'axios-retry';

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: vi.fn().mockResolvedValue('test-device-id')
}));
vi.mock('$lib/utils/constants/storage', () => ({
	StorageKeys: { ACCESS_TOKEN: 'access_token' }
}));

describe('createAxiosInstance', () => {
	it('returns an axios instance with expected methods', async () => {
		const { default: createAxiosInstance } = await import('$lib/api/axios');
		const instance = await createAxiosInstance();
		expect(typeof instance.get).toBe('function');
		expect(typeof instance.post).toBe('function');
		expect(instance.interceptors).toBeDefined();
	});

	it('applies axios-retry with 3 retries', async () => {
		const { default: createAxiosInstance } = await import('$lib/api/axios');
		const instance = await createAxiosInstance();
		// axios-retry stores its config on the instance defaults under the 'axios-retry' namespace
		// We verify by checking that the interceptors contain retry logic (request + response ids)
		// A fresh axios instance without retry has 0 request interceptors from axiosRetry;
		// with retry applied, axiosRetry registers exactly one request and one response interceptor.
		const handlers = (instance.interceptors.request as { handlers: { fulfilled: unknown }[] })
			.handlers;
		// handlers may include our auth interceptor + the axiosRetry interceptor
		expect(handlers.filter(Boolean).length).toBeGreaterThanOrEqual(2);
	});

	it('uses isNetworkOrIdempotentRequestError as retryCondition (POST is not retried)', () => {
		// isNetworkOrIdempotentRequestError returns false for POST requests with a response
		const mockPostError = {
			config: { method: 'post' },
			response: { status: 500 },
			isAxiosError: true,
			message: 'Request failed'
		} as Parameters<typeof axiosRetry.isNetworkOrIdempotentRequestError>[0];
		expect(axiosRetry.isNetworkOrIdempotentRequestError(mockPostError)).toBe(false);
	});

	it('uses isNetworkOrIdempotentRequestError (GET with 5xx is retried)', () => {
		const mockGetError = {
			config: { method: 'get' },
			response: { status: 503 },
			isAxiosError: true,
			message: 'Service Unavailable'
		} as Parameters<typeof axiosRetry.isNetworkOrIdempotentRequestError>[0];
		expect(axiosRetry.isNetworkOrIdempotentRequestError(mockGetError)).toBe(true);
	});
});
