import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { shouldClearSessionOnAuthFailure } from '$lib/utils/auth/session-auth';
import { clearFormDataContentType } from '$lib/utils/media/upload-file';
import { ENDPOINTS } from './endpoints';

interface RequestConfig extends AxiosRequestConfig {
	baseURL?: string;
}

interface RetryableRequest extends InternalAxiosRequestConfig {
	_retry?: boolean;
	skipAuthRedirect?: boolean;
}

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (error: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null): void {
	failedQueue.forEach(({ resolve, reject }) => {
		if (token) resolve(token);
		else reject(error);
	});
	failedQueue = [];
}

/**
 * Called when refresh fails — tokens are already invalid on the server,
 * so we only need local cleanup (skip the backend /logout call).
 */
async function clearTokensAndRedirect(): Promise<void> {
	try {
		const { destroySession } = await import('$lib/utils/session');
		await destroySession();

		const { goto } = await import('$app/navigation');
		await goto('/auth/login');
	} catch {
		if (typeof window !== 'undefined') {
			window.location.href = '/auth/login';
		}
	}
}

const createAxiosInstance = async (config: RequestConfig = {}) => {
	const instance = axios.create({
		headers: {
			'Content-Type': 'application/json'
		},
		...config
	});

	// Request interceptor - lazy import getDeviceIdentifier to avoid circular dependency
	// (deviceIdentity -> profile -> nostrKeys -> auth.service -> apiService)
	instance.interceptors.request.use(
		async (config) => {
			const { value: accessToken } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			if (accessToken) {
				config.headers['Authorization'] = `Bearer ${accessToken}`;
				const { getDeviceIdentifier } = await import('$lib/utils/helpers/deviceIdentity');
				const deviceId = await getDeviceIdentifier();
				config.headers['X-Device-ID'] = deviceId;
			}
			// A FormData body must not keep application/json or a boundary-less
			// multipart type. The browser sets the multipart boundary.
			clearFormDataContentType(config);
			return config;
		},
		(error) => {
			return Promise.reject(error);
		}
	);

	// Response interceptor
	instance.interceptors.response.use(
		(response) => response,
		async (error) => {
			const originalRequest = error.config as RetryableRequest | undefined;
			const status = error.response?.status as number | undefined;
			const skipAuthRedirect = Boolean(originalRequest?.skipAuthRedirect);

			// Network failures and opted-out calls (translation, ancillary reads)
			// must not destroy a still-valid session.
			if (status !== 401 || !originalRequest || originalRequest._retry || skipAuthRedirect) {
				return Promise.reject(error);
			}

			// Don't retry refresh or logout endpoints — just force re-login
			const url = originalRequest.url ?? '';
			if (url.includes(ENDPOINTS.AUTH.REFRESH) || url.includes(ENDPOINTS.AUTH.LOGOUT)) {
				if (shouldClearSessionOnAuthFailure(status, skipAuthRedirect)) {
					await clearTokensAndRedirect();
				}
				return Promise.reject(error);
			}

			if (isRefreshing) {
				return new Promise<string>((resolve, reject) => {
					failedQueue.push({ resolve, reject });
				}).then((token) => {
					originalRequest.headers['Authorization'] = `Bearer ${token}`;
					return instance(originalRequest);
				});
			}

			originalRequest._retry = true;
			isRefreshing = true;

			try {
				const { value: refreshToken } = await Preferences.get({
					key: StorageKeys.REFRESH_TOKEN
				});

				if (!refreshToken) {
					throw new Error('No refresh token available');
				}

				const { data } = await instance.post(ENDPOINTS.AUTH.REFRESH, {
					refresh_token: refreshToken
				});

				await Preferences.set({ key: StorageKeys.ACCESS_TOKEN, value: data.access_token });
				await Preferences.set({ key: StorageKeys.REFRESH_TOKEN, value: data.refresh_token });

				processQueue(null, data.access_token);

				originalRequest.headers['Authorization'] = `Bearer ${data.access_token}`;
				return instance(originalRequest);
			} catch (refreshError) {
				processQueue(refreshError, null);
				const refreshStatus = (refreshError as { response?: { status?: number } })?.response
					?.status;
				if (shouldClearSessionOnAuthFailure(refreshStatus, false)) {
					await clearTokensAndRedirect();
				}
				return Promise.reject(refreshError);
			} finally {
				isRefreshing = false;
			}
		}
	);

	return instance;
};

export default createAxiosInstance;
