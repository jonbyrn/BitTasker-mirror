import axios, { type AxiosRequestConfig } from 'axios';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from '$lib/utils/constants/storage';
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

interface RequestConfig extends AxiosRequestConfig {
	baseURL?: string;
}

const createAxiosInstance = async (config: RequestConfig = {}) => {
	const deviceId = await getDeviceIdentifier();
	const instance = axios.create({
		headers: {
			'Content-Type': 'application/json',
			'X-Device-ID': deviceId,
		},
		...config
	});

	// Request interceptor
	instance.interceptors.request.use(
		async (config) => {
			const { value: accessToken } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
			if (accessToken) {
				config.headers['Authorization'] = `Bearer ${accessToken}`;
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
