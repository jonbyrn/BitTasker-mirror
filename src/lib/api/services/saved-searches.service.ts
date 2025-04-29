import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type { SavedSearch, SavedSearchNotification } from '$lib/types/saved-search';
import type { SearchTasksParams } from '$lib/types/task';
import { NotificationFrequency } from '$lib/utils/enums/task.enum';

/**
 * Saved Searches Service
 * Handles creation, retrieval, and management of saved searches
 */
export class SavedSearchesService extends BaseApiService {
	/**
	 * Create a new saved search
	 * @param name The name for the saved search
	 * @param searchParams The search parameters to save
	 * @param notifyOnMatch Whether to enable notifications for this search
	 * @param notificationFrequency The frequency of notifications (INSTANT, DAILY, WEEKLY)
	 */
	async createSavedSearch(
		name: string,
		searchParams: SearchTasksParams,
		notifyOnMatch: boolean,
		notificationFrequency: NotificationFrequency = NotificationFrequency.DAILY
	): Promise<SavedSearch> {
		const response = await this.post<SavedSearch>(ENDPOINTS.SAVED_SEARCHES.CREATE, {
			name,
			searchParams,
			notifyOnMatch,
			notificationFrequency
		});
		return response.data;
	}

	/**
	 * Get all saved searches for the current user
	 */
	async getSavedSearches(): Promise<SavedSearch[]> {
		const response = await this.get<SavedSearch[]>(ENDPOINTS.SAVED_SEARCHES.LIST);
		return response.data;
	}

	/**
	 * Get a specific saved search by ID
	 * @param id The ID of the saved search to retrieve
	 */
	async getSavedSearchById(id: string): Promise<SavedSearch> {
		const response = await this.get<SavedSearch>(ENDPOINTS.SAVED_SEARCHES.DETAILS(id));
		return response.data;
	}

	/**
	 * Update an existing saved search
	 * @param id The ID of the saved search to update
	 * @param updates The updated saved search data
	 */
	async updateSavedSearch(id: string, updates: Partial<SavedSearch>): Promise<SavedSearch> {
		// Map frontend frequency terms to backend enum values if present
		let processedUpdates = { ...updates };

		if (updates.notificationFrequency) {
			if (updates.notificationFrequency in NotificationFrequency) {
				processedUpdates.notificationFrequency = updates.notificationFrequency;
			}
		}

		const response = await this.put<SavedSearch>(
			ENDPOINTS.SAVED_SEARCHES.UPDATE(id),
			processedUpdates
		);
		return response.data;
	}

	/**
	 * Delete a saved search by ID
	 * @param id The ID of the saved search to delete
	 */
	async deleteSavedSearch(id: string): Promise<void> {
		await this.delete(ENDPOINTS.SAVED_SEARCHES.DELETE(id));
	}

	/**
	 * Get notifications for a specific saved search
	 * @param id The ID of the saved search
	 */
	async getNotifications(id: string): Promise<SavedSearchNotification[]> {
		const response = await this.get<SavedSearchNotification[]>(
			ENDPOINTS.SAVED_SEARCHES.NOTIFICATIONS(id)
		);
		return response.data;
	}

	/**
	 * Mark notifications for a saved search as read
	 * @param id The ID of the saved search
	 * @param notificationIds Optional array of specific notification IDs to mark as read
	 */
	async markNotificationsAsRead(id: string, notificationIds?: string[]): Promise<void> {
		await this.put(ENDPOINTS.SAVED_SEARCHES.MARK_AS_READ(id), { notificationIds });
	}

	/**
	 * Update notification preferences for a saved search
	 * @param id The ID of the saved search
	 * @param notifyOnMatch Whether notifications should be enabled
	 * @param frequency Notification frequency (INSTANT, DAILY, WEEKLY)
	 */
	async updateNotificationPreferences(
		id: string,
		notifyOnMatch: boolean,
		frequency?: NotificationFrequency
	): Promise<SavedSearch> {
		const response = await this.put<SavedSearch>(ENDPOINTS.SAVED_SEARCHES.UPDATE(id), {
			notifyOnMatch,
			notificationFrequency: frequency
		});
		return response.data;
	}
}

// Create singleton instance
const savedSearchesService = new SavedSearchesService();
export default savedSearchesService;
