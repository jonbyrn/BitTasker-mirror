import { browser } from '$app/environment';
import { io, type Socket } from 'socket.io-client';
import { Preferences } from '@capacitor/preferences';
import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { StorageKeys } from '$lib/utils/constants/storage';
import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { foregroundNotificationCoordinator } from '$lib/utils/helpers/foreground-notification-coordinator';
import type { NotificationCenterItem } from '$lib/types/notification';

let socket: Socket | null = null;

/**
 * Connect to the backend's notification WebSocket gateway.
 * Uses Socket.IO on the /notifications namespace with JWT auth.
 * Works on both web and native (Capacitor WebView supports WebSocket natively).
 */
export async function connectNotificationSocket(): Promise<void> {
	if (!browser || socket?.connected) return;

	const auth = get(authState);
	if (!auth.isAuthenticated) return;

	const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
	if (!token) return;

	const API_URL = import.meta.env.VITE_API_URL;

	socket = io(`${API_URL}/notifications`, {
		auth: { token: `Bearer ${token}` },
		transports: ['websocket', 'polling'],
		reconnection: true,
		reconnectionDelay: 1000,
		reconnectionDelayMax: 30000,
		reconnectionAttempts: Infinity
	});

	socket.on('notification:new', (notification: NotificationCenterItem) => {
		notificationCenterStore.addFromRealtime(notification);

		if (!foregroundNotificationCoordinator.wasSystemNotificationShown()) {
			appStore.showInfoToast(notification.title, 3000, {
				dedupKey: `toast-dedup:${notification.title}`
			});
		}

		Sentry.addBreadcrumb({
			category: 'notification',
			level: 'info',
			message: 'New notification received via WebSocket',
			data: { notificationId: notification.id, type: notification.type }
		});
	});

	socket.on('notification:unread-count', ({ count }: { count: number }) => {
		notificationCenterStore.setUnreadCount(count);
	});

	socket.on('connect_error', (error) => {
		console.warn('[NotificationSocket] Connection error:', error.message);
	});

	socket.on('disconnect', (reason) => {
		console.log('[NotificationSocket] Disconnected:', reason);
	});
}

export function disconnectNotificationSocket(): void {
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}
