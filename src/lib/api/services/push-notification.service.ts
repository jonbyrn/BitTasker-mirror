import type {
	Token,
	PushNotificationSchema,
	ActionPerformed,
	RegistrationError
} from '@capacitor/push-notifications';
import type { Messaging, MessagePayload } from 'firebase/messaging';
import type {
	SendNotificationToDeviceInput,
	SendNotificationToNpubsInput
} from '$lib/types/notification';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { notificationService } from '$lib/api/services/notification.service';
import { registerServiceWorker, getFirebaseWebConfig, getVapidKey } from '$lib/utils/helpers/fcm';
import { createUserDeviceShortName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { appStore } from '$lib/stores/app.store';
import { foregroundNotificationCoordinator } from '$lib/utils/helpers/foreground-notification-coordinator';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { authState } from '$lib/stores/auth.store';

interface NotificationData {
	type?: string;
	title?: string;
	body?: string;
	icon?: string;
	message?: string;
	clickAction?: string;
	click_action?: string;
	data?: {
		clickAction?: string;
	};
	[key: string]: unknown;
}

interface NotificationUrlOpenEvent extends CustomEvent {
	detail: {
		url: string;
	};
}

class PushNotificationService {
	private messaging: Messaging | null = null;
	private currentDeviceId: string | null = null;
	private notificationCounter: number = 0;
	private deviceName: string | null = null;
	private isInitialized: boolean = false;

	constructor() {
		getDeviceIdentifier().then((deviceId) => {
			this.currentDeviceId = deviceId;
		});
		(async () => {
			try {
				// Only access biometric data if user is authenticated
				const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
				if (token) {
					const npub =
						get(appStore)?.biometricData?.npub ||
						(await Preferences.get({ key: StorageKeys.NPUB })).value ||
						'';
					if (npub) {
						createUserDeviceShortName(npub).then((deviceName) => {
							this.deviceName = deviceName;
						});
					}
				}
			} catch (error) {
				// Silently fail - device name is optional and will be set when needed
				console.debug('Failed to initialize device name in push notification service:', error);
			}
		})();
	}

	private getAppVersion(): string {
		return __APP_VERSION__;
	}

	public async init(): Promise<void> {
		if (this.isInitialized) return;

		try {
			if (Capacitor.isNativePlatform()) {
				this.addListeners();
				await this.requestPermissions();
				await this.createPushNotificationChannel();
				await this.registerDevice();
			} else {
				await this.initWebPushNotifications();
			}

			// Mark as initialized after successful setup
			this.isInitialized = true;
		} catch (error) {
			console.error('Error initializing push notification service:', error);
		}
	}

	/**
	 * Initialize web push notifications
	 * Web specific
	 */
	private async initWebPushNotifications(): Promise<void> {
		try {
			await this.requestWebPermissions();

			const { initializeApp } = await import('firebase/app');
			const { getMessaging, onMessage } = await import('firebase/messaging');

			const firebaseConfig = getFirebaseWebConfig();

			if (
				!firebaseConfig.apiKey ||
				!firebaseConfig.projectId ||
				!firebaseConfig.messagingSenderId
			) {
				throw new Error('❌ Firebase configuration is incomplete');
			}

			const app = initializeApp(firebaseConfig);
			this.messaging = getMessaging(app);

			await this.getWebToken();

			// Handle foreground messages
			onMessage(this.messaging, async (payload) => {
				console.log('📨 Message received in foreground: ', payload.data?.title);
				await this.handleForegroundMessage(payload);
			});

			// Register service worker for background messages
			await registerServiceWorker();
		} catch (error) {
			console.error('❌ Error initializing web push notifications:', error);
			throw error;
		}
	}

	/**
	 * Request permissions for web push notifications
	 * Web specific
	 */
	private async requestWebPermissions(): Promise<void> {
		// check if the browser supports notifications
		if (!('Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window)) {
			throw new Error('Notifications are not supported in this browser');
		}

		const permission = await Notification.requestPermission();

		if (permission !== 'granted') {
			throw new Error(`❌ Notification permission not granted: ${permission}`);
		}
	}

	/**
	 * Check current notification permission status for the platform.
	 * Returns 'granted', 'denied', 'prompt', or 'unsupported'.
	 * Mobile & Web
	 */
	public async checkPermissionStatus(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
		try {
			if (Capacitor.isNativePlatform()) {
				const status = await PushNotifications.checkPermissions();
				if (status.receive === 'granted') return 'granted';
				if (status.receive === 'denied') return 'denied';
				return 'prompt';
			} else {
				if (!('Notification' in window)) return 'unsupported';
				if (Notification.permission === 'granted') return 'granted';
				if (Notification.permission === 'denied') return 'denied';
				return 'prompt';
			}
		} catch {
			return 'unsupported';
		}
	}

	/**
	 * Get web token for web push notifications
	 * Web specific
	 */
	private async getWebToken(): Promise<void> {
		try {
			const { getToken } = await import('firebase/messaging');

			const vapidKey = getVapidKey();

			if (!vapidKey) {
				throw new Error('❌ VAPID key is not configured');
			}

			if (!this.messaging) {
				throw new Error('❌ Messaging instance is not available');
			}

			const token = await getToken(this.messaging, {
				vapidKey: vapidKey
			});

			if (token) {
				await this.registerTokenOnServer(token);
			} else {
				console.warn('⚠️ No registration token available.');
			}
		} catch (error) {
			throw error || new Error('❌ An error occurred while retrieving token');
		}
	}

	/**
	 * Handle foreground message for web push notifications
	 * Web specific
	 */
	private async handleForegroundMessage(payload: MessagePayload): Promise<void> {
		if (!payload.data) return;

		const title = payload.data.title || 'New notification received';

		if (payload.data.type === 'device_revoked') {
			await this.handleDeviceRevocation(payload.data);
			return;
		}

		let systemNotificationShown = false;

		if (Notification.permission === 'granted') {
			try {
				new Notification(payload.data.title, {
					body: payload.data.body,
					icon: payload.data.icon || '/favicon.ico',
					tag: 'bittasker-notification'
				});
				systemNotificationShown = true;
				foregroundNotificationCoordinator.markSystemNotificationShown();
			} catch {
				systemNotificationShown = false;
			}
		}

		if (!systemNotificationShown) {
			appStore.showInfoToast(title, 3000, {
				dedupKey: `toast-dedup:${title}`
			});
		}
	}

	/**
	 * Handle notification data
	 * Mobile & Web
	 */
	private async handleNotificationData(data: NotificationData): Promise<void> {
		if (data.type === 'device_revoked') {
			await this.handleDeviceRevocation(data);
			return; // Exit early, don't navigate anywhere
		}

		let targetUrl = '/hiring';

		// Check for clickAction first, then fallback to other locations
		if (data.clickAction) {
			targetUrl = data.clickAction;
		} else if (data.click_action) {
			targetUrl = data.click_action;
		} else if (data.clickAction || data.data?.clickAction) {
			targetUrl = (data.clickAction || data.data?.clickAction) ?? targetUrl;
		}

		await this.navigateToUrl(targetUrl);
	}

	/**
	 * Handle device revocation notification - immediately log out the user
	 */
	private async handleDeviceRevocation(
		data: NotificationData | Record<string, string>
	): Promise<void> {
		const message = typeof data['message'] === 'string' ? data['message'] : undefined;
		appStore.showInfoToast(message || 'Your device access has been revoked');

		await authState.logout();

		goto('/auth/login');
	}

	/**
	 * Enhanced handling for foreground notifications
	 * Mobile specific - CONSOLIDATED to prevent duplicates (Android only)
	 */
	private async handleForegroundNotification(notification: PushNotificationSchema): Promise<void> {
		console.log('📨 Foreground notification received:', notification?.title);

		if (notification.data?.type === 'device_revoked') {
			await this.handleDeviceRevocation(notification.data);
			return;
		}

		try {
			try {
				const permission = await LocalNotifications.checkPermissions();
				if (permission.display !== 'granted') {
					const result = await LocalNotifications.requestPermissions();
					if (result.display !== 'granted') {
						console.warn('⚠️ Local notification permission not granted');
						return;
					}
				}

				const notificationId = this.generateNotificationId(notification?.id);

				await LocalNotifications.schedule({
					notifications: [
						{
							title: notification.data.title || 'New Notification',
							body: notification.data.body || 'You have a new notification',
							id: notificationId,
							sound: 'default',
							actionTypeId: 'OPEN_ACTION',
							extra: notification.data || {},
							schedule: { at: new Date(Date.now() + 100) },
							autoCancel: true,
							channelId: 'bittasker-notification',
							smallIcon: 'ic_stat_notify'
						}
					]
				});

				console.log('✅ Local notification scheduled with ID:', notificationId);
				foregroundNotificationCoordinator.markSystemNotificationShown();
			} catch (error) {
				console.error('❌ Error scheduling local notification:', error);
			}
		} catch (error) {
			console.error('❌ Error handling foreground notification:', error);
		}
	}

	/**
	 * Navigate to URL using appropriate method for the platform
	 * Mobile & Web
	 */
	private async navigateToUrl(url: string): Promise<void> {
		if (!browser) return;

		try {
			await goto(url);
		} catch (error) {
			console.error('❌ Navigation error:', error);
			// Fallback to window.location for critical navigation
			if (browser && window.location) {
				window.location.href = url;
			}
		}
	}

	/**
	 * Add listeners for push notifications
	 * Mobile specific
	 */
	private async addListeners(): Promise<void> {
		PushNotifications.addListener('registration', (token: Token) => {
			this.registerTokenOnServer(token.value);
		});

		PushNotifications.addListener('registrationError', (error: RegistrationError) => {
			console.error('Error on registration: ' + JSON.stringify(error));
		});

		PushNotifications.addListener(
			'pushNotificationReceived',
			(notification: PushNotificationSchema) => {
				this.handleForegroundNotification(notification);
			}
		);

		PushNotifications.addListener(
			'pushNotificationActionPerformed',
			(notification: ActionPerformed) => {
				console.log('🔔 Notification tapped!', JSON.stringify(notification, null, 2));

				const data = notification.notification?.data || {};

				// Mark as read if notificationId is present
				if (data.notificationId && typeof data.notificationId === 'string') {
					import('$lib/stores/notificationCenter.store')
						.then(({ notificationCenterStore }) => {
							notificationCenterStore.markRead(data.notificationId as string);
						})
						.catch((err) => {
							console.error('Failed to mark notification as read:', err);
						});
				}

				// Navigate using the existing navigateToUrl method
				const targetUrl = data.deepLink || data.clickAction || data.click_action || '/hiring';
				this.navigateToUrl(targetUrl);
			}
		);

		// Add local notification listeners for foreground notifications
		LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
			console.log('🔔 Local notification action performed:', notification);
			// Handle the local notification tap the same way as push notifications
			if (notification.notification.extra) {
				const extra = notification.notification.extra as Record<string, unknown>;
				// Mark as read if notificationId is present (mirrors push tap handler)
				if (extra.notificationId && typeof extra.notificationId === 'string') {
					import('$lib/stores/notificationCenter.store')
						.then(({ notificationCenterStore }) => {
							notificationCenterStore.markRead(extra.notificationId as string);
						})
						.catch((err) => {
							console.error('Failed to mark notification as read:', err);
						});
				}
				this.handleNotificationData(extra);
			} else {
				// Fallback to dashboard if no data
				this.navigateToUrl('/hiring');
			}
		});
	}

	/**
	 * Add notification URL open listener for custom notification events
	 * Mobile specific
	 */
	private addNotificationUrlOpenListener(): void {
		if (Capacitor.isNativePlatform()) {
			window.addEventListener('notificationUrlOpen', (event: Event) => {
				const customEvent = event as NotificationUrlOpenEvent;
				if (customEvent.detail?.url) {
					this.navigateToUrl(customEvent.detail.url);
				}
			});
		}
	}

	/**
	 * Create unified notification channel for Android
	 * Uses ONE channel ID for both push and local notifications to ensure consistency
	 * Mobile specific
	 */
	private async createPushNotificationChannel(): Promise<void> {
		if (!Capacitor.isNativePlatform()) return;

		try {
			// Create a unified notification channel id
			// Both PushNotifications and LocalNotifications will use this same channel
			await PushNotifications.createChannel({
				id: 'bittasker-notification',
				name: 'BitTasker Notifications',
				description: 'All notifications from BitTasker',
				importance: 4, // High importance
				sound: 'default',
				vibration: true,
				lights: true,
				lightColor: '#FF9315' // Bitcoin orange
			});

			// Also create the channel for LocalNotifications plugin with same ID
			// This ensures both plugins use the same channel settings
			await LocalNotifications.createChannel({
				id: 'bittasker-notification',
				name: 'BitTasker Notifications',
				description: 'All notifications from BitTasker',
				importance: 4, // High importance
				sound: 'default',
				vibration: true,
				lights: true,
				lightColor: '#FF9315' // Bitcoin orange
			});
		} catch {
			// Channel might already exist, that's fine
		}
	}

	/**
	 * Generate a safe notification ID for Android (within Java int range)
	 */
	private generateNotificationId(fcmId?: string): number {
		if (fcmId) {
			let hash = 0;
			for (let i = 0; i < fcmId.length; i++) {
				hash = (hash << 5) - hash + fcmId.charCodeAt(i);
				hash |= 0; // force 32-bit
			}
			return Math.abs(hash);
		} else {
			// Increment counter and use modulo to keep within Java int range
			this.notificationCounter = (this.notificationCounter + 1) % 2147483647;
			// Add some randomness while keeping it small
			return Math.floor(Math.random() * 100000) + this.notificationCounter;
		}
	}

	/**
	 * Request permissions for push notifications
	 * Mobile specific
	 */
	private async requestPermissions(): Promise<void> {
		let permStatus = await PushNotifications.checkPermissions();

		if (permStatus.receive === 'prompt') {
			permStatus = await PushNotifications.requestPermissions();
		}

		if (permStatus.receive !== 'granted') {
			throw new Error('User denied permissions!');
		}
	}

	/**
	 * Register device for push notifications
	 * Mobile specific
	 */
	private async registerDevice(): Promise<void> {
		await PushNotifications.register();
	}

	/**
	 * Register token on server
	 * Mobile & Web
	 */
	private async registerTokenOnServer(token: string): Promise<void> {
		try {
			if (!this.currentDeviceId) {
				throw new Error('❌ Device ID not available');
			}

			const capacitorPlatform = Capacitor.getPlatform();
			let platform: 'android' | 'ios' | 'web' = 'web';

			if (capacitorPlatform === 'ios') {
				platform = 'ios';
			} else if (capacitorPlatform === 'android') {
				platform = 'android';
			}

			await notificationService.registerDevice({
				deviceId: this.currentDeviceId,
				deviceName: this.deviceName,
				fcmToken: token,
				platform,
				appVersion: this.getAppVersion()
			});
		} catch (error) {
			throw error || new Error('❌ An error occurred while registering device on server');
		}
	}

	/**
	 * Public method to manually refresh token (useful for token rotation)
	 * Mobile & Web
	 */
	public async refreshToken(): Promise<void> {
		if (Capacitor.isNativePlatform()) {
			await this.registerDevice();
		} else {
			await this.getWebToken();
		}
	}

	// Public method to unregister from push notifications
	public async unregister(): Promise<void> {
		try {
			if (!Capacitor.isNativePlatform()) {
				const { deleteToken } = await import('firebase/messaging');
				await deleteToken(this.messaging!);
				// For native, we'll revoke the device on the server
			}

			await notificationService.revokeDevice(this.currentDeviceId!);

			console.log('Successfully unregistered from push notifications');
		} catch (error) {
			console.error('Error unregistering from push notifications:', error);
		}
	}

	// Public method to get user's devices
	public async getMyDevices() {
		try {
			return await notificationService.getMyDevices();
		} catch (error) {
			console.error('Error fetching user devices:', error);
			return [];
		}
	}

	// Public method to revoke a specific device
	public async revokeDevice(deviceId: string, message?: string) {
		try {
			const result = await notificationService.revokeDevice(deviceId);

			// Then, send push notification to the revoked device to force logout
			try {
				const notificationData = {
					title: 'Device Access Revoked',
					body:
						message ||
						'Your device access has been revoked for security reasons. You will be logged out immediately.',
					deviceId
				};
				await this.sendNotification(notificationData);
			} catch (notificationError) {
				console.warn('Error sending revocation notification:', notificationError);
				// Continue - the device revocation was successful even if notification failed
			}

			return result;
		} catch (error) {
			console.error('Error revoking device:', error);
			throw error;
		}
	}

	// Public method to get notification preferences
	public async getNotificationPreferences() {
		try {
			return await notificationService.getNotificationPreferences();
		} catch (error) {
			console.error('Error fetching notification preferences:', error);
			return null;
		}
	}

	// Public method to send notification
	public async sendNotification({
		title,
		body,
		deviceId
	}: {
		title: string;
		body: string;
		deviceId: string;
	}) {
		try {
			return await notificationService.sendNotification({
				title,
				body,
				deviceId,
				type: 'device_revoked'
			});
		} catch (error) {
			console.error('Error sending notification:', error);
			throw error;
		}
	}

	// Public method to subscribe to topic
	public async subscribeToTopic(topic: string) {
		try {
			return await notificationService.subscribeToTopic({ topic });
		} catch (error) {
			console.error('Error subscribing to topic:', error);
			throw error;
		}
	}

	// Public method to unsubscribe from topic
	public async unsubscribeFromTopic(topic: string) {
		try {
			return await notificationService.unsubscribeFromTopic({ topic });
		} catch (error) {
			console.error('Error unsubscribing from topic:', error);
			throw error;
		}
	}

	// Public method to update device activity
	public async updateDeviceActivity() {
		try {
			return await notificationService.updateDeviceActivity(this.currentDeviceId!);
		} catch (error) {
			console.error('Error updating device activity:', error);
			throw error;
		}
	}

	// Getter for current device ID
	public getCurrentDeviceId(): string | null {
		return this.currentDeviceId;
	}

	/**
	 * Send notification to a specific device
	 * Mobile & Web
	 */
	public async sendNotificationToDevice(notification: SendNotificationToDeviceInput) {
		try {
			return await notificationService.sendNotificationToDevice(notification);
		} catch (error) {
			console.error('Error sending notification to device:', error);
			throw error;
		}
	}

	/**
	 * Send notification to a list of npubs
	 * Mobile & Web
	 */
	public async sendNotificationToNpubs(notification: SendNotificationToNpubsInput) {
		try {
			return await notificationService.sendNotificationToNpubs(notification);
		} catch (error) {
			console.error('Error sending notification to npubs:', error);
			throw error;
		}
	}

	/**
	 * Close all existing notifications for web push notifications
	 */
	private async closeAllExistingNotifications(): Promise<void> {
		try {
			if ('serviceWorker' in navigator) {
				const registration = await navigator.serviceWorker.ready;
				const allNotifications = await registration.getNotifications();

				if (allNotifications.length > 0) {
					for (const existing of allNotifications) {
						existing.close();
					}
					// Small delay to ensure notifications are closed
					await new Promise((resolve) => setTimeout(resolve, 50));
				}
			}
		} catch (error) {
			console.warn('⚠️ Could not close existing notifications:', error);
		}
	}
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();
