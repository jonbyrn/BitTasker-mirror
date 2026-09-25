import { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import createAxiosInstance from './axios';

// Create a generic API response type
export interface ApiResponse<T = unknown> {
	data: T;
	status: number;
	message?: string;
}

// Type for API error data returned from the server
export interface ApiErrorData {
	message?: string;
	errors?: Record<string, string[]>;
	[key: string]: unknown;
}

// Custom error class for API errors
export class ApiError extends Error {
	status: number;
	data: ApiErrorData | undefined;

	constructor(message: string, status: number, data?: ApiErrorData) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
	}
}

export function isNotFoundError(error: unknown): boolean {
	if (error instanceof ApiError) return error.status === 404;
	if (!error || typeof error !== 'object') return false;

	const candidate = error as { status?: unknown; response?: { status?: unknown } };
	return candidate.status === 404 || candidate.response?.status === 404;
}

export class BaseApiService {
	private axiosInstancePromise: Promise<AxiosInstance>;

	constructor(baseURL: string = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL) {
		this.axiosInstancePromise = createAxiosInstance({ baseURL });
	}

	private async getAxiosInstance() {
		return await this.axiosInstancePromise;
	}

	/**
	 * Make a GET request to the specified endpoint
	 */
	protected async get<T = unknown>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		try {
			const axiosInstance = await this.getAxiosInstance();
			const response: AxiosResponse = await axiosInstance.get(url, config);
			return this.formatResponse<T>(response);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a POST request to the specified endpoint
	 */
	protected async post<T = unknown, D = unknown>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		try {
			const axiosInstance = await this.getAxiosInstance();
			const response: AxiosResponse = await axiosInstance.post(url, data, config);
			return this.formatResponse<T>(response);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a PUT request to the specified endpoint
	 */
	protected async put<T = unknown, D = unknown>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		try {
			const axiosInstance = await this.getAxiosInstance();
			const response: AxiosResponse = await axiosInstance.put(url, data, config);
			return this.formatResponse<T>(response);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a PATCH request to the specified endpoint
	 */
	protected async patch<T = unknown, D = unknown>(
		url: string,
		data?: D,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		try {
			const axiosInstance = await this.getAxiosInstance();
			const response: AxiosResponse = await axiosInstance.patch(url, data, config);
			return this.formatResponse<T>(response);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Make a DELETE request to the specified endpoint
	 */
	protected async delete<T = unknown>(
		url: string,
		config?: AxiosRequestConfig
	): Promise<ApiResponse<T>> {
		try {
			const axiosInstance = await this.getAxiosInstance();
			const response: AxiosResponse = await axiosInstance.delete(url, config);
			return this.formatResponse<T>(response);
		} catch (error) {
			return this.handleError(error);
		}
	}

	/**
	 * Format the API response
	 */
	private formatResponse<T>(response: AxiosResponse): ApiResponse<T> {
		return {
			data: response.data,
			status: response.status,
			message: response.statusText
		};
	}

	/**
	 * Handle API errors
	 */
	private handleError(error: unknown): never {
		if (error instanceof AxiosError) {
			const status = error.response?.status || 500;
			const message = error.response?.data?.message || error.message || 'Unknown error occurred';
			const data = error.response?.data;

			throw new ApiError(message, status, data);
		}

		// Handle non-axios errors
		if (error instanceof Error) {
			throw new ApiError(error.message, 500);
		}

		throw new ApiError('Unknown error occurred', 500);
	}
}
