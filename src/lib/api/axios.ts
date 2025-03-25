import axios, { type AxiosRequestConfig } from 'axios';

interface RequestConfig extends AxiosRequestConfig {
	baseURL?: string;
}

const createAxiosInstance = (config: RequestConfig = {}) => {
	const instance = axios.create({
		headers: {
			'Content-Type': 'application/json'
		},
		...config
	});

	// Request interceptor
	instance.interceptors.request.use(
		(config) => {
			const nostrKeys = localStorage.getItem('nostrKeys');
			if (nostrKeys) {
				const { publicKey } = JSON.parse(nostrKeys);
				config.headers['X-Nostr-Key'] = publicKey;
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
				// Only clear local storage, let components handle their own redirects
				localStorage.removeItem('nostrKeys');
			}
			return Promise.reject(error);
		}
	);

	return instance;
};

export default createAxiosInstance;
