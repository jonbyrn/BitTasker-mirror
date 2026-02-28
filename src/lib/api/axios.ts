import axios, { type AxiosRequestConfig } from 'axios';
import { StorageKeys } from '$lib/utils/constants/storage';

interface RequestConfig extends AxiosRequestConfig {
	baseURL?: string;
}

type UnauthorizedListener = (error: unknown) => void | Promise<void>;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export const onUnauthorizedResponse = (listener: UnauthorizedListener): (() => void) => {
	unauthorizedListeners.add(listener);
	return () => unauthorizedListeners.delete(listener);
};

const notifyUnauthorizedListeners = async (error: unknown) => {
	if (unauthorizedListeners.size === 0) return;
	await Promise.allSettled(
		Array.from(unauthorizedListeners).map(async (listener) => {
			await listener(error);
		})
	);
};

let preferencesModulePromise: Promise<typeof import('@capacitor/preferences')> | null = null;
const getPreferencesModule = async () => {
	preferencesModulePromise ??= import('@capacitor/preferences');
	return await preferencesModulePromise;
};

let deviceIdentityModulePromise: Promise<
	typeof import('$lib/utils/helpers/deviceIdentity')
> | null = null;
const getDeviceIdentityModule = async () => {
	deviceIdentityModulePromise ??= import('$lib/utils/helpers/deviceIdentity');
	return await deviceIdentityModulePromise;
};

const createAxiosInstance = async (config: RequestConfig = {}) => {
	const instance = axios.create({
		headers: {
			'Content-Type': 'application/json'
		},
		...config
	});

	// Request interceptor
	instance.interceptors.request.use(
		async (config) => {
			const { Preferences } = await getPreferencesModule();
			const { value: accessToken } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			if (accessToken) {
				config.headers['Authorization'] = `Bearer ${accessToken}`;
				const { getDeviceIdentifier } = await getDeviceIdentityModule();
				const deviceId = await getDeviceIdentifier();
				config.headers['X-Device-ID'] = deviceId;
			}
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
			if (error.response?.status === 401) {
				await notifyUnauthorizedListeners(error);
			}
			return Promise.reject(error);
		}
	);

	return instance;
};

export default createAxiosInstance;
