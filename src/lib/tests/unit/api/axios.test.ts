import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAxiosCreate = vi.hoisted(() => vi.fn());
const mockRequestUse = vi.hoisted(() => vi.fn());
const mockResponseUse = vi.hoisted(() => vi.fn());
const mockPreferencesGet = vi.hoisted(() => vi.fn());
const mockGetDeviceIdentifier = vi.hoisted(() => vi.fn());

vi.mock('axios', () => ({
	default: {
		create: (...args: unknown[]) => mockAxiosCreate(...args)
	}
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: (...args: unknown[]) => mockPreferencesGet(...args)
	}
}));

vi.mock('$lib/utils/helpers/deviceIdentity', () => ({
	getDeviceIdentifier: (...args: unknown[]) => mockGetDeviceIdentifier(...args)
}));

describe('axios instance setup', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockAxiosCreate.mockReturnValue({
			interceptors: {
				request: {
					use: mockRequestUse
				},
				response: {
					use: mockResponseUse
				}
			}
		});
	});

	it('adds Authorization and X-Device-ID when token exists', async () => {
		mockPreferencesGet.mockResolvedValueOnce({ value: 'token-123' });
		mockGetDeviceIdentifier.mockResolvedValueOnce('device-123');

		const { default: createAxiosInstance } = await import('$lib/api/axios');
		await createAxiosInstance({ baseURL: 'https://example.com' });

		expect(mockRequestUse).toHaveBeenCalledTimes(1);
		const requestInterceptor = mockRequestUse.mock.calls[0][0] as (config: {
			headers: Record<string, string>;
		}) => Promise<{ headers: Record<string, string> }>;

		const config = { headers: {} };
		const result = await requestInterceptor(config);

		expect(result.headers.Authorization).toBe('Bearer token-123');
		expect(result.headers['X-Device-ID']).toBe('device-123');
	});

	it('notifies unauthorized listeners for 401 responses', async () => {
		const { default: createAxiosInstance, onUnauthorizedResponse } = await import('$lib/api/axios');
		const listener = vi.fn().mockResolvedValue(undefined);
		const unsubscribe = onUnauthorizedResponse(listener);

		await createAxiosInstance({ baseURL: 'https://example.com' });
		expect(mockResponseUse).toHaveBeenCalledTimes(1);

		const responseErrorInterceptor = mockResponseUse.mock.calls[0][1] as (
			error: unknown
		) => Promise<never>;
		const unauthorizedError = { response: { status: 401 } };

		await expect(responseErrorInterceptor(unauthorizedError)).rejects.toBe(unauthorizedError);
		expect(listener).toHaveBeenCalledWith(unauthorizedError);

		unsubscribe();
	});
});
