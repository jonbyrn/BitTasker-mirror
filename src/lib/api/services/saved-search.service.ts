import type { SearchTasksParams } from '$lib/types/task';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/** Payload to register a saved search with the backend (same pattern as messages: backend knows who to notify) */
export interface RegisterSavedSearchDto {
	npub: string;
	id: string;
	name: string;
	params: SearchTasksParams;
	notifyOnMatch: boolean;
	isActive: boolean;
	notificationFrequency: string;
}

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
 * Response from saved search notification endpoint.
 * When the backend returns npubs, the frontend sends the notification via sendNotificationToNpubs
 * (same as messages/contracts), so no extra FCM configuration is needed on the backend.
 */
export interface SavedSearchNotificationResult {
	success: boolean;
	matchCount: number;
	message: string;
	/** Npubs to notify (when present, frontend calls sendNotificationToNpubs) */
	npubs?: string[];
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
			const status = (error as { status?: number })?.status;
			if (status === 401) {
				throw new Error('Unauthorized. Please login again.');
			}
			if (status === 500) {
				throw new Error('Internal server error. Please try again later.');
			}
			throw new Error(
				(error as Error)?.message || 'Failed to trigger saved search check. Please try again.'
			);
		}
	}

	/**
	 * Register a saved search with the backend so it can return npubs when a matching task is created.
	 * Same logic as messages: we "register" the recipient (here: this user's npub + search criteria).
	 */
	async registerSavedSearch(payload: RegisterSavedSearchDto): Promise<void> {
		await this.post(ENDPOINTS.SAVED_SEARCHES.REGISTER, payload);
	}

	/**
	 * Update a saved search on the backend.
	 */
	async updateSavedSearchInBackend(
		id: string,
		updates: Partial<Omit<RegisterSavedSearchDto, 'npub' | 'id'>>
	): Promise<void> {
		await this.put(ENDPOINTS.SAVED_SEARCHES.UPDATE(id), updates);
	}

	/**
	 * Delete a saved search from the backend.
	 */
	async deleteSavedSearchInBackend(id: string): Promise<void> {
		await this.delete(ENDPOINTS.SAVED_SEARCHES.DELETE(id));
	}
}

// Create singleton instance
const savedSearchService = new SavedSearchService();
export default savedSearchService;
