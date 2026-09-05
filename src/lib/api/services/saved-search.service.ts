import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

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
			const status =
				typeof error === 'object' && error !== null && 'status' in error
					? (error.status as number)
					: undefined;
			if (status === 401) {
				throw new Error('Unauthorized. Please login again.');
			}
			if (status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}
			throw new Error(
				error instanceof Error
					? error.message
					: 'Failed to trigger saved search check. Please try again.'
			);
		}
	}
}

// Create singleton instance
const savedSearchService = new SavedSearchService();
export default savedSearchService;
