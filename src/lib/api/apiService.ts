import { AxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import createAxiosInstance from './axios';

// Create a generic API response type
export interface ApiResponse<T = unknown> {
	data: T;
	status: number;
	message?: string;
}

// Custom error class for API errors
export class ApiError extends Error {
	status: number;
	data: unknown;

	constructor(message: string, status: number, data?: unknown, cause?: unknown) {
		super(message, { cause });
		this.name = 'ApiError';
		Object.setPrototypeOf(this, new.target.prototype);
		this.status = status;
		this.data = data;
	}
}

export class BaseApiService {
	private axiosInstancePromise: Promise<AxiosInstance>;

	constructor(baseURL: string = import.meta.env.VITE_API_URL) {
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
		const status = this.extractStatusCode(error);
		const data = this.extractErrorData(error);
		const message = this.extractErrorMessage(error, data);
		throw new ApiError(message, status, data, error);
	}

	private extractStatusCode(error: unknown): number {
		const fallbackStatus = 500;
		if (error instanceof AxiosError) {
			return error.response?.status ?? fallbackStatus;
		}
		if (typeof error === 'object' && error !== null) {
			const maybeError = error as {
				status?: unknown;
				response?: { status?: unknown };
			};
			const responseStatus =
				typeof maybeError.response?.status === 'number' ? maybeError.response.status : undefined;
			if (responseStatus != null) return responseStatus;
			if (typeof maybeError.status === 'number') return maybeError.status;
		}
		return fallbackStatus;
	}

	private extractErrorData(error: unknown): unknown {
		if (error instanceof AxiosError) {
			return error.response?.data;
		}
		if (typeof error === 'object' && error !== null) {
			const maybeError = error as { data?: unknown; response?: { data?: unknown } };
			if (maybeError.response?.data !== undefined) return maybeError.response.data;
			return maybeError.data;
		}
		return undefined;
	}

	private extractErrorMessage(error: unknown, data: unknown): string {
		const fallbackMessage = 'Unknown error occurred';
		if (typeof data === 'object' && data !== null) {
			const asRecord = data as Record<string, unknown>;
			if (typeof asRecord.message === 'string' && asRecord.message.trim()) {
				return asRecord.message;
			}
			if (
				typeof asRecord.error === 'object' &&
				asRecord.error !== null &&
				typeof (asRecord.error as Record<string, unknown>).message === 'string'
			) {
				return (asRecord.error as Record<string, unknown>).message as string;
			}
		}
		if (error instanceof Error && error.message.trim()) {
			return error.message;
		}
		if (typeof error === 'string' && error.trim()) {
			return error;
		}
		if (typeof error === 'object' && error !== null) {
			const asRecord = error as Record<string, unknown>;
			if (typeof asRecord.message === 'string' && asRecord.message.trim()) {
				return asRecord.message;
			}
		}
		return fallbackMessage;
	}
}
