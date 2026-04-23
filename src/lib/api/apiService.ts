/* eslint-disable @typescript-eslint/no-explicit-any */
import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import createAxiosInstance from './axios';

export const DEFAULT_API_HOST = 'https://api.bittasker.com';

// Create a generic API response type
export interface ApiResponse<T = any> {
	data: T;
	status: number;
	message?: string;
}

// Custom error class for API errors
export class ApiError extends Error {
	status: number;
	data: any;

	constructor(message: string, status: number, data?: any) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.data = data;
	}
}

export class BaseApiService {
	private axiosInstancePromise: Promise<any>;

	constructor(baseURL: string = import.meta.env.VITE_API_URL || DEFAULT_API_HOST) {
		this.axiosInstancePromise = createAxiosInstance({ baseURL });
	}

	private async getAxiosInstance() {
		return await this.axiosInstancePromise;
	}

	/**
	 * Make a GET request to the specified endpoint
	 */
	protected async get<T = any>(url: string, config?: AxiosRequestConfig): Promise<ApiResponse<T>> {
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
	protected async post<T = any, D = any>(
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
	protected async put<T = any, D = any>(
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
	protected async patch<T = any, D = any>(
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
	protected async delete<T = any>(
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
