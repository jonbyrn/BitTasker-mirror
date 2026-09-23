import { BaseApiService } from '../apiService';
import { ENDPOINTS } from '../endpoints';

export interface PushDevice {
	id: string;
	deviceId: string;
	deviceName?: string | null;
	platform?: string | null;
	isActive: boolean;
	lastUsedAt?: string | null;
	createdAt?: string;
	[key: string]: unknown;
}

class PushNotificationService extends BaseApiService {
	async getMyDevices(): Promise<PushDevice[]> {
		const response = await this.get<PushDevice[]>(ENDPOINTS.NOTIFICATIONS.DEVICES);
		return Array.isArray(response.data) ? response.data : [];
	}

	async revokeDevice(deviceId: string, reason?: string): Promise<void> {
		await this.delete(ENDPOINTS.NOTIFICATIONS.DEVICE(deviceId), {
			data: reason ? { reason } : undefined
		});
	}

	async checkPermissionStatus(): Promise<NotificationPermission | 'unsupported'> {
		if (typeof Notification === 'undefined') return 'unsupported';
		return Notification.permission;
	}

	async init(): Promise<void> {
		if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
			await Notification.requestPermission();
		}
	}
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
