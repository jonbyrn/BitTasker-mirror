import axios, { type AxiosRequestConfig } from 'axios';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';

interface RequestConfig extends AxiosRequestConfig {
	baseURL?: string;
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
				// TODO: Handle failed requests
			}
			return Promise.reject(error);
		}
	);

	return instance;
};

export default createAxiosInstance;
