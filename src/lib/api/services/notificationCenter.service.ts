import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';
import type {
	NotificationCenterItem,
	NotificationCenterListResponse,
	NotificationUnreadCountResponse,
	NotificationMarkAllReadResponse,
	NotificationDeleteManyResponse,
	NotificationFilters,
	NotificationPreferencesExtended,
	EnrichmentRequest
} from '$lib/types/notification';
import * as Sentry from '@sentry/sveltekit';

/**
 * Unified notification center service.
 * Consolidates notification center CRUD, preferences, and enrichment
 * into a single service to avoid scattering related API calls across files.
 */
export class NotificationCenterService extends BaseApiService {
	// ─── Notification Center CRUD ────────────────────────────────────

	async list(filters: NotificationFilters): Promise<NotificationCenterListResponse> {
		const params = new URLSearchParams();
		params.set('page', String(filters.page));
		params.set('limit', String(filters.limit));
		if (filters.read !== undefined) params.set('read', String(filters.read));
		if (filters.type) params.set('type', filters.type);

		const response = await this.get<NotificationCenterListResponse>(
			`${ENDPOINTS.NOTIFICATION_CENTER.LIST}?${params.toString()}`
		);
		return response.data;
	}

	async getUnreadCount(): Promise<number> {
		const response = await this.get<NotificationUnreadCountResponse>(
			ENDPOINTS.NOTIFICATION_CENTER.UNREAD_COUNT
		);
		return response.data.count;
	}

	async markRead(id: string): Promise<NotificationCenterItem> {
		const response = await this.patch<NotificationCenterItem>(
			ENDPOINTS.NOTIFICATION_CENTER.MARK_READ(id)
		);
		return response.data;
	}

	async markAllRead(type?: string): Promise<number> {
		const response = await this.post<NotificationMarkAllReadResponse>(
			ENDPOINTS.NOTIFICATION_CENTER.READ_ALL,
			type ? { type } : undefined
		);
		return response.data.updatedCount;
	}

	async deleteOne(id: string): Promise<void> {
		await this.delete(ENDPOINTS.NOTIFICATION_CENTER.DELETE(id));
	}

	async deleteMany(olderThan?: string): Promise<number> {
		const response = await this.delete<NotificationDeleteManyResponse>(
			ENDPOINTS.NOTIFICATION_CENTER.DELETE_MANY,
			olderThan ? { data: { olderThan } } : undefined
		);
		return response.data.deletedCount;
	}

	// ─── Notification Preferences ────────────────────────────────────

	async getPreferences(): Promise<NotificationPreferencesExtended> {
		const response = await this.get<NotificationPreferencesExtended>(
			ENDPOINTS.NOTIFICATION_PREFERENCES.GET
		);
		const data = response.data;

		const parseData = <T>(field: T | string | null | undefined): T => {
			if (typeof field !== 'string') return field ?? ({} as T);
			try {
				return JSON.parse(field) as T;
			} catch {
				return {} as T;
			}
		};

		return {
			...data,
			taskNotificationSettings: parseData(data.taskNotificationSettings),
			serviceNotificationSettings: parseData(data.serviceNotificationSettings)
		};
	}

	async updatePreferences(
		preferences: Partial<NotificationPreferencesExtended>
	): Promise<NotificationPreferencesExtended> {
		const response = await this.put<NotificationPreferencesExtended>(
			ENDPOINTS.NOTIFICATION_PREFERENCES.UPDATE,
			preferences
		);
		return response.data;
	}

	// ─── Enrichment (fire-and-forget) ────────────────────────────────
	// Enrichment tells the backend about timeline events (escrow funded,
	// task completed, etc.) so it can schedule reminder notifications.

	async enrich(data: EnrichmentRequest): Promise<void> {
		try {
			await this.post(ENDPOINTS.REMINDERS.ENRICH, data);
		} catch (error) {
			Sentry.captureException(error, {
				tags: { feature: 'notification-enrichment' },
				extra: { action: data.action }
			});
		}
	}
}

export const notificationCenterService = new NotificationCenterService();
