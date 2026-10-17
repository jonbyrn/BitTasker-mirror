import { browser } from '$app/environment';
import { io, type Socket } from 'socket.io-client';
import { Preferences } from '@capacitor/preferences';
import { get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import { StorageKeys } from '$lib/utils/constants/storage';
import { notificationCenterStore, sandboxPagesHost } from '$lib/stores/notificationCenter.store';
import { appStore } from '$lib/stores/app.store';
import { authState } from '$lib/stores/auth.store';
import { foregroundNotificationCoordinator } from '$lib/utils/helpers/foreground-notification-coordinator';
import type { NotificationCenterItem } from '$lib/types/notification';

let socket: Socket | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

/** Exponential backoff with jitter, capped at 30s. */
export function nextRetryDelay(attempt: number, random = Math.random()): number {
	const capped = Math.min(attempt, 5);
	const base = Math.min(30_000, 1000 * 2 ** capped);
	const jitter = Math.floor(random * base * 0.3);
	return base + jitter;
}

function startDisconnectPoll(): void {
	if (pollTimer || !browser) return;
	pollTimer = setInterval(() => {
		if (socket?.connected) return;
		void import('$lib/stores/notificationCenter.store')
			.then(({ notificationCenterStore }) => notificationCenterStore.fetchUnreadCount())
			.catch(() => undefined);
	}, 20_000);
}

function stopDisconnectPoll(): void {
	if (!pollTimer) return;
	clearInterval(pollTimer);
	pollTimer = null;
}

/**
 * Connect to the backend's notification WebSocket gateway.
 * Uses Socket.IO on the /notifications namespace with JWT auth.
 * Works on both web and native (Capacitor WebView supports WebSocket natively).
 */
export async function connectNotificationSocket(): Promise<void> {
	if (!browser || socket?.connected || sandboxPagesHost()) return;

	const auth = get(authState);
	if (!auth.isAuthenticated) return;

	const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
	if (!token) return;

	// Falls back to the current origin so the socket never connects to a literal "undefined" host
	// when VITE_API_URL is unset (e.g. relying on the dev server proxy instead of an absolute URL).
	const API_URL = import.meta.env.VITE_API_URL || window.location.origin;

	socket = io(`${API_URL}/notifications`, {
		auth: { token: `Bearer ${token}` },
		transports: ['websocket', 'polling'],
		reconnection: true,
		reconnectionDelay: nextRetryDelay(0, 0),
		reconnectionDelayMax: 30000,
		reconnectionAttempts: Infinity
	});
	startDisconnectPoll();
	socket.io.on('reconnect_attempt', (attempt) => {
		if (socket) socket.io.reconnectionDelay(nextRetryDelay(attempt));
	});
	socket.on('connect', () => {
		stopDisconnectPoll();
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
		startDisconnectPoll();
	});
}

export function disconnectNotificationSocket(): void {
	stopDisconnectPoll();
	if (socket) {
		socket.disconnect();
		socket = null;
	}
}
