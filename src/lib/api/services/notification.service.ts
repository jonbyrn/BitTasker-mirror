import type {
	RegisteredDevice,
	NotificationPreferences,
	DeviceRegistration,
	DeviceUpdate,
	OperationResult,
	SendNotificationInput,
	TopicInput,
	SendNotificationToDeviceInput,
	SendNotificationToNpubsInput,
	SendNotificationToDeviceResult,
	SendNotificationToNpubsResult
} from '$lib/types/notification';
import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

/**
 * Service for managing push notifications and device registrations.
 *
 * All operations map to REST endpoints under `/api/v1/notifications`.
 * Authentication is handled automatically via the Axios instance configured
 * in {@link BaseApiService} — every request includes the Bearer token and
 * `X-Device-ID` header injected by the Axios interceptor.
 *
 * @example
 * ```ts
 * import { notificationService } from '$lib/api/services/notification.service';
 *
 * const devices = await notificationService.getMyDevices();
 * ```
 */
export class NotificationService extends BaseApiService {
	/**
	 * Retrieve all registered devices for the currently authenticated user.
	 *
	 * @returns A list of the user's registered devices, or an empty array if none exist.
	 *
	 * @example
	 * ```ts
	 * const devices = await notificationService.getMyDevices();
	 * devices.forEach(d => console.log(d.deviceName, d.platform, d.isActive));
	 * ```
	 */
	async getMyDevices(): Promise<RegisteredDevice[]> {
		const response = await this.get<RegisteredDevice[]>(ENDPOINTS.NOTIFICATIONS.DEVICES);
		return response.data ?? [];
	}

	/**
	 * Retrieve the notification preferences for the currently authenticated user.
	 *
	 * @returns The user's notification preferences, or `null` if not yet configured.
	 *
	 * @example
	 * ```ts
	 * const prefs = await notificationService.getNotificationPreferences();
	 * if (prefs?.pushMessages) {
	 *   console.log('Message push notifications are enabled');
	 * }
	 * ```
	 */
	async getNotificationPreferences(): Promise<NotificationPreferences | null> {
		const response = await this.get<NotificationPreferences | null>(
			ENDPOINTS.NOTIFICATIONS.PREFERENCES
		);
		return response.data ?? null;
	}

	/**
	 * Register a new device or update an existing one for push notifications.
	 *
	 * If a device with the same `deviceId` already exists for the user it will
	 * be updated (upsert behaviour on the server).
	 *
	 * @param input - Device registration payload including the FCM token, platform,
	 *   unique device identifier, optional human-readable name, and app version.
	 * @returns The registered (or updated) device record.
	 *
	 * @example
	 * ```ts
	 * const device = await notificationService.registerDevice({
	 *   fcmToken: 'FCM_TOKEN',
	 *   platform: 'android',
	 *   deviceId: 'unique-device-uuid',
	 *   deviceName: 'Pixel 9',
	 *   appVersion: '1.2.0',
	 * });
	 * console.log('Registered device ID:', device.id);
	 * ```
	 */
	async registerDevice(input: DeviceRegistration): Promise<RegisteredDevice> {
		const response = await this.post<RegisteredDevice>(ENDPOINTS.NOTIFICATIONS.DEVICES, input);
		return response.data;
	}

	/**
	 * Update metadata for an existing registered device.
	 *
	 * All fields in {@link DeviceUpdate} are optional — only the supplied fields
	 * will be changed on the server.
	 *
	 * @param deviceId - The unique identifier of the device to update (matches the
	 *   `deviceId` used during registration, not the server-assigned `id`).
	 * @param input - Partial device data to update (FCM token, active status,
	 *   device name, or app version).
	 * @returns The updated device record.
	 *
	 * @example
	 * ```ts
	 * const updated = await notificationService.updateDevice('my-device-uuid', {
	 *   fcmToken: 'NEW_FCM_TOKEN',
	 *   appVersion: '1.3.0',
	 * });
	 * ```
	 */
	async updateDevice(deviceId: string, input: DeviceUpdate): Promise<RegisteredDevice> {
		const response = await this.patch<RegisteredDevice>(
			ENDPOINTS.NOTIFICATIONS.DEVICE(deviceId),
			input
		);
		return response.data;
	}

	/**
	 * Send a heartbeat to mark a device as recently active.
	 *
	 * Should be called periodically (e.g. on app foreground) to keep the
	 * `lastUsedAt` timestamp current and prevent stale-device pruning.
	 *
	 * @param deviceId - The unique identifier of the device to update.
	 * @returns An {@link OperationResult} confirming the update.
	 *
	 * @example
	 * ```ts
	 * const result = await notificationService.updateDeviceActivity('my-device-uuid');
	 * // { success: true, message: 'Device activity updated' }
	 * ```
	 */
	async updateDeviceActivity(deviceId: string): Promise<OperationResult> {
		const response = await this.patch<OperationResult>(
			ENDPOINTS.NOTIFICATIONS.DEVICE_ACTIVITY(deviceId)
		);
		return response.data;
	}

	/**
	 * Revoke (unregister) a specific device, preventing it from receiving
	 * further push notifications.
	 *
	 * Revoking a device also sets its `revokedAt` timestamp and marks it
	 * inactive on the server. A push notification is typically sent to the
	 * revoked device immediately afterwards to force a client-side logout.
	 *
	 * @param deviceId - The unique identifier of the device to revoke.
	 * @returns An {@link OperationResult} confirming the revocation.
	 *
	 * @example
	 * ```ts
	 * const result = await notificationService.revokeDevice('my-device-uuid');
	 * // { success: true, message: 'Device revoked successfully' }
	 * ```
	 */
	async revokeDevice(deviceId: string): Promise<OperationResult> {
		const response = await this.delete<OperationResult>(ENDPOINTS.NOTIFICATIONS.DEVICE(deviceId));
		return response.data;
	}

	/**
	 * Revoke all devices registered to the currently authenticated user.
	 *
	 * Useful as a "logout from all devices" operation. The server revokes every
	 * active device and returns the total count in the response message.
	 *
	 * @returns An {@link OperationResult} indicating how many devices were revoked.
	 *
	 * @example
	 * ```ts
	 * const result = await notificationService.revokeAllDevices();
	 * // { success: true, message: '3 devices revoked successfully' }
	 * ```
	 */
	async revokeAllDevices(): Promise<OperationResult> {
		const response = await this.delete<OperationResult>(ENDPOINTS.NOTIFICATIONS.DEVICES);
		return response.data;
	}

	/**
	 * Send a push notification to the current user's device(s).
	 *
	 * If `deviceId` is omitted the notification is broadcast to all of the
	 * user's active devices. Primarily used for system-level messages such as
	 * device-revocation alerts.
	 *
	 * @param input - Notification payload containing a title, body, optional
	 *   target `deviceId`, and an optional `type` discriminator.
	 * @returns An {@link OperationResult} confirming dispatch.
	 *
	 * @example
	 * ```ts
	 * await notificationService.sendNotification({
	 *   title: 'Security Alert',
	 *   body: 'Your device access has been revoked.',
	 *   deviceId: 'target-device-uuid',
	 *   type: 'device_revoked',
	 * });
	 * ```
	 */
	async sendNotification(input: SendNotificationInput): Promise<OperationResult> {
		const response = await this.post<OperationResult>(ENDPOINTS.NOTIFICATIONS.SEND, input);
		return response.data;
	}

	/**
	 * Subscribe the current user's active devices to a Firebase Cloud Messaging topic.
	 *
	 * Topic subscriptions allow broadcasting a single notification to all subscribers
	 * (e.g. `"announcements"`, `"maintenance"`).
	 *
	 * @param input - Object containing the topic name to subscribe to.
	 * @returns An {@link OperationResult} confirming the subscription.
	 *
	 * @example
	 * ```ts
	 * await notificationService.subscribeToTopic({ topic: 'announcements' });
	 * ```
	 */
	async subscribeToTopic(input: TopicInput): Promise<OperationResult> {
		const response = await this.post<OperationResult>(
			ENDPOINTS.NOTIFICATIONS.SUBSCRIBE_TO_TOPIC,
			input
		);
		return response.data;
	}

	/**
	 * Unsubscribe the current user's active devices from a Firebase Cloud Messaging topic.
	 *
	 * @param input - Object containing the topic name to unsubscribe from.
	 * @returns An {@link OperationResult} confirming the unsubscription.
	 *
	 * @example
	 * ```ts
	 * await notificationService.unsubscribeFromTopic({ topic: 'announcements' });
	 * ```
	 */
	async unsubscribeFromTopic(input: TopicInput): Promise<OperationResult> {
		const response = await this.post<OperationResult>(
			ENDPOINTS.NOTIFICATIONS.UNSUBSCRIBE_FROM_TOPIC,
			input
		);
		return response.data;
	}

	/**
	 * Send a push notification directly to a single device identified by its `deviceId`.
	 *
	 * Unlike {@link sendNotification}, this method targets one specific device
	 * and returns per-device delivery information including the associated `npub`.
	 *
	 * @param input - Notification payload with a mandatory `deviceId`, title, body,
	 *   and optional `type`, `icon`, and `clickAction` URL.
	 * @returns A {@link SendNotificationToDeviceResult} with delivery status for the device.
	 *
	 * @example
	 * ```ts
	 * const result = await notificationService.sendNotificationToDevice({
	 *   title: 'Test',
	 *   body: 'Direct device notification',
	 *   deviceId: 'unique-device-uuid',
	 *   type: 'test',
	 *   clickAction: '/hiring',
	 * });
	 * console.log(result.success, result.npub);
	 * ```
	 */
	async sendNotificationToDevice(
		input: SendNotificationToDeviceInput
	): Promise<SendNotificationToDeviceResult> {
		const response = await this.post<SendNotificationToDeviceResult>(
			ENDPOINTS.NOTIFICATIONS.SEND_TO_DEVICE,
			input
		);
		return response.data;
	}

	/**
	 * Send a push notification to one or more users identified by their Nostr public keys (npubs).
	 *
	 * The server resolves each `npub` to its registered devices and delivers the
	 * notification to all active ones. The response includes per-npub and aggregate
	 * delivery statistics.
	 *
	 * @param input - Notification payload with a list of `npubs`, title, body,
	 *   and optional `type`, `icon`, and `clickAction` URL.
	 * @returns A {@link SendNotificationToNpubsResult} with overall and per-npub
	 *   delivery statistics.
	 *
	 * @example
	 * ```ts
	 * const result = await notificationService.sendNotificationToNpubs({
	 *   title: 'New Bid on Your Task',
	 *   body: 'Someone placed a bid on "Fix my roof".',
	 *   npubs: ['npub1abc...', 'npub1def...'],
	 *   type: 'bid_received',
	 *   clickAction: '/tasks/123',
	 * });
	 * console.log(`Delivered to ${result.successfulTargets}/${result.totalTargets} users`);
	 * ```
	 */
	async sendNotificationToNpubs(
		input: SendNotificationToNpubsInput
	): Promise<SendNotificationToNpubsResult> {
		const response = await this.post<SendNotificationToNpubsResult>(
			ENDPOINTS.NOTIFICATIONS.SEND_TO_NPUBS,
			input
		);
		return response.data;
	}
}

export const notificationService = new NotificationService();
