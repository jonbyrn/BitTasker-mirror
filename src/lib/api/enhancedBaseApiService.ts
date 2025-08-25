import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import createAxiosInstance from './axios';
import { enhancedApiService } from './services/enhanced-api.service';

// Enhanced API response type with offline information
export interface EnhancedApiResponse<T = any> {
	data: T;
	status: number;
	message?: string;
	offline: boolean;
	cached: boolean;
	timestamp: number;
}

// Custom error class for API errors
export class ApiError extends Error {
	status: number;
	data: any;
	offline: boolean;

	constructor(message: string, status: number, data?: any, offline: boolean = false) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
		this.offline = offline;
	}
}

export class EnhancedBaseApiService {
	private axiosInstance;
	private baseURL: string;

	constructor(baseURL: string = import.meta.env.VITE_API_URL) {
		this.axiosInstance = createAxiosInstance({ baseURL });
		this.baseURL = baseURL;
	}

	/**
	 * Make a GET request with offline support
	 */
	protected async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<EnhancedApiResponse<T>> {
		try {
			// Use enhanced API service for offline support
			const response = await enhancedApiService.get<T>(url, {
				...config,
				headers: this.getHeaders(config?.headers)
			});

			return {
				data: response.data,
				status: response.offline ? 200 : 200, // Offline responses are treated as successful
				message: response.offline ? 'Served from cache' : 'Success',
				offline: response.offline,
				cached: response.cached,
				timestamp: response.timestamp
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a POST request with offline queue support
	 */
	protected async post<T = any, D = any>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<EnhancedApiResponse<T>> {
		try {
			// Use enhanced API service for offline support
			const response = await enhancedApiService.post<T>(url, data, {
				...config,
				headers: this.getHeaders(config?.headers)
			});

			return {
				data: response.data,
				status: response.offline ? 202 : 200, // Queued requests return 202
				message: response.offline ? 'Queued for offline sync' : 'Success',
				offline: response.offline,
				cached: response.cached,
				timestamp: response.timestamp
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a PUT request with offline queue support
	 */
	protected async put<T = any, D = any>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<EnhancedApiResponse<T>> {
		try {
			// Use enhanced API service for offline support
			const response = await enhancedApiService.put<T>(url, data, {
				...config,
				headers: this.getHeaders(config?.headers)
			});

			return {
				data: response.data,
				status: response.offline ? 202 : 200, // Queued requests return 202
				message: response.offline ? 'Queued for offline sync' : 'Success',
				offline: response.offline,
				cached: response.cached,
				timestamp: response.timestamp
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a PATCH request with offline queue support
	 */
	protected async patch<T = any, D = any>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<EnhancedApiResponse<T>> {
		try {
			// Use enhanced API service for offline support
			const response = await enhancedApiService.patch<T>(url, data, {
				...config,
				headers: this.getHeaders(config?.headers)
			});

			return {
				data: response.data,
				status: response.offline ? 202 : 200, // Queued requests return 202
				message: response.offline ? 'Queued for offline sync' : 'Success',
				offline: response.offline,
				cached: response.cached,
				timestamp: response.timestamp
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a DELETE request with offline queue support
	 */
	protected async delete<T = any>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<EnhancedApiResponse<T>> {
		try {
			// Use enhanced API service for offline support
			const response = await enhancedApiService.delete<T>(url, {
				...config,
				headers: this.getHeaders(config?.headers)
			});

			return {
				data: response.data,
				status: response.offline ? 202 : 200, // Queued requests return 202
				message: response.offline ? 'Queued for offline sync' : 'Success',
				offline: response.offline,
				cached: response.cached,
				timestamp: response.timestamp
			};
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Get headers with authentication
	 */
	private getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...customHeaders
		};

		// Add authentication token if available
		const token = this.getAuthToken();
		if (token) {
			headers['Authorization'] = `Bearer ${token}`;
		}

		return headers;
	}

	/**
	 * Get authentication token from storage
	 */
	private getAuthToken(): string | null {
		try {
			return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
		} catch (error) {
			console.warn('Failed to get auth token:', error);
			return null;
		}
	}

	/**
	 * Handle API errors with offline information
	 */
	private handleError(error: unknown): never {
		if (error instanceof Error) {
			// Check if it's an offline error
			if (error.message.includes('offline') || error.message.includes('network')) {
				throw new ApiError(error.message, 503, null, true);
			}

			// Handle axios errors
			if (error instanceof AxiosError) {
				const status = error.response?.status || 500;
				const message = error.response?.data?.message || error.message || 'Unknown error occurred';
				const data = error.response?.data;

				throw new ApiError(message, status, data, false);
			}

			// Handle other errors
			throw new ApiError(error.message, 500, null, false);
		}

		throw new ApiError('Unknown error occurred', 500, null, false);
	}

	/**
	 * Check if the service is online
	 */
	protected isOnline(): boolean {
		return navigator.onLine;
	}

	/**
	 * Wait for connection to be restored
	 */
	protected async waitForConnection(): Promise<void> {
		if (this.isOnline()) return;

		return new Promise((resolve) => {
			const handleOnline = () => {
				window.removeEventListener('online', handleOnline);
				resolve();
			};

			window.addEventListener('online', handleOnline);
		});
	}

	/**
	 * Get offline queue status
	 */
	protected getOfflineQueueStatus() {
		return enhancedApiService.getOfflineQueueStatus();
	}

	/**
	 * Clear offline queue
	 */
	protected async clearOfflineQueue(): Promise<void> {
		await enhancedApiService.clearOfflineQueue();
	}
}
