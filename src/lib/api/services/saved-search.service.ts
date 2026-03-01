import { ApiError, BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import { normalizeToError } from '$lib/utils/helpers/normalizeError';

/**
 * DTO for task body sent to saved search check endpoint
 */
export interface TaskBodyDto {
	eventId: string;
	title: string;
	taskType: string;
	description: string;
	budget: {
		currency: string;
		type: string;
		tier: string;
	};
	deadline?: string;
	dateRange?: {
		start: string;
		end: string;
	};
	skills: string[];
	categories: string[];
	pickupLocation?: {
		longitude: number;
		latitude: number;
		displayName?: string;
	};
	dropOffLocation?: {
		longitude: number;
		latitude: number;
		displayName?: string;
	};
}

/**
 * Response from saved search notification endpoint
 */
export interface SavedSearchNotificationResult {
	success: boolean;
	matchCount: number;
	message: string;
}

/**
 * Saved Search Service
 * Handles saved search notifications and checks
 */
export class SavedSearchService extends BaseApiService {
	private getErrorStatus(error: unknown): number | undefined {
		if (typeof error !== 'object' || error === null) return undefined;
		const candidate = error as { status?: unknown; response?: { status?: unknown } };
		if (typeof candidate.status === 'number') return candidate.status;
		if (typeof candidate.response?.status === 'number') return candidate.response.status;
		return undefined;
	}

	private getErrorMessage(error: unknown): string | undefined {
		if (typeof error !== 'object' || error === null) return undefined;
		const candidate = error as {
			message?: unknown;
			data?: { message?: unknown };
			response?: { data?: { message?: unknown } };
		};
		if (typeof candidate.data?.message === 'string' && candidate.data.message.trim()) {
			return candidate.data.message;
		}
		if (
			typeof candidate.response?.data?.message === 'string' &&
			candidate.response.data.message.trim()
		) {
			return candidate.response.data.message;
		}
		if (typeof candidate.message === 'string' && candidate.message.trim()) {
			return candidate.message;
		}
		return undefined;
	}

	/**
	 * Trigger saved search check for a new task
	 * @param taskBody Task data to check against saved searches
	 * @returns Promise with the notification result
	 * @throws {Error} 401 - Unauthorized
	 * @throws {Error} 500 - Internal server error
	 */
	async triggerSavedSearchCheck(taskBody: TaskBodyDto): Promise<SavedSearchNotificationResult> {
		try {
			const response = await this.post<SavedSearchNotificationResult>(
				ENDPOINTS.SAVED_SEARCHES.TRIGGER_CHECK,
				taskBody
			);
			return response.data;
		} catch (error: unknown) {
			const status = this.getErrorStatus(error);
			if (status === 401) {
				if (error instanceof ApiError) throw error;
				throw new ApiError(this.getErrorMessage(error) || 'Unauthorized. Please login again.', 401);
			}
			if (status === 500) {
				if (error instanceof ApiError) throw error;
				throw new ApiError(
					this.getErrorMessage(error) || 'Internal server error. Please try again later.',
					500
				);
			}
			throw normalizeToError(error, 'Failed to trigger saved search check. Please try again.');
		}
	}
}

// Create singleton instance
const savedSearchService = new SavedSearchService();
export default savedSearchService;
