/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App } from '@capacitor/app';
import {
	RegisterDeviceStore,
	RevokeDeviceStore,
	MyDevicesStore,
	MyNotificationPreferencesStore,
	SendNotificationStore,
	SubscribeToTopicStore,
	UnsubscribeFromTopicStore,
	UpdateDeviceActivityStore
} from '$houdini';
import {
	registerServiceWorker,
	isNotificationSupported,
	requestNotificationPermission,
	getFirebaseWebConfig,
	getVapidKey
} from '$lib/utils/helpers/fcm';
import { createUserDeviceShortName, getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';
import { appStore } from '$lib/stores/app.store';
import { goto } from '$app/navigation';
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';

class PushNotificationService {
	private messaging: any = null;
	private currentDeviceId: string | null = null;
	private notificationCounter: number = 0;
	private deviceName: string | null = null;

	// Houdini Stores
	private registerDeviceStore = new RegisterDeviceStore();
	private revokeDeviceStore = new RevokeDeviceStore();
	private myDevicesStore = new MyDevicesStore();
	private myNotificationPreferencesStore = new MyNotificationPreferencesStore();
	private sendNotificationStore = new SendNotificationStore();
	private subscribeToTopicStore = new SubscribeToTopicStore();
	private unsubscribeFromTopicStore = new UnsubscribeFromTopicStore();
	private updateDeviceActivityStore = new UpdateDeviceActivityStore();

	constructor() {
		getDeviceIdentifier().then((deviceId) => {
			this.currentDeviceId = deviceId;
		});
		(async () => {
			let npub = get(appStore)?.biometricData?.username || (await Preferences.get({ key: StorageKeys.NPUB })).value || '';
			createUserDeviceShortName(npub).then((deviceName) => {
				this.deviceName = deviceName;
			});
		})();
	}

	// Get this from your app config or package.json
	private getAppVersion(): string {
		return __APP_VERSION__;
	}

	public async init(): Promise<void> {
		try {
			if (Capacitor.isNativePlatform()) {
				this.addListeners();
				await this.requestPermissions();
				await this.createPushNotificationChannel();
				await this.registerDevice();
				this.addDeepLinkListener();
			} else {
				await this.initWebPushNotifications();
			}
		} catch (error) {
			throw error;
		}
	}

	private async initWebPushNotifications(): Promise<void> {
		try {
			// Check if notifications are supported
			if (!isNotificationSupported()) {
				console.warn('⚠️ Push notifications are not supported in this browser');
				return;
			}

			const { initializeApp } = await import('firebase/app');
			const { getMessaging, onMessage } = await import('firebase/messaging');

			const firebaseConfig = getFirebaseWebConfig();

			// Validate Firebase config
			if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
				throw new Error('❌ Firebase configuration is incomplete');
			}

			const app = initializeApp(firebaseConfig);
			this.messaging = getMessaging(app);

			// Request permission for web notifications
			await this.requestWebPermissions();

			// Get FCM token
			await this.getWebToken();

			// Handle foreground messages
			onMessage(this.messaging, (payload) => {
				console.log('📨 Message received in foreground: ', payload);
				this.handleForegroundMessage(payload);
			});

			// Register service worker for background messages
			await registerServiceWorker();

		} catch (error) {
			console.error('❌ Error initializing web push notifications:', error);
			throw error;
		}
	}

	private async requestWebPermissions(): Promise<void> {
		const permission = await requestNotificationPermission();
		if (permission !== 'granted') {
			throw new Error(`❌ Notification permission not granted: ${permission}`);
		}
	}

	private async getWebToken(): Promise<void> {
		try {
			const { getToken } = await import('firebase/messaging');

			const vapidKey = getVapidKey();

			if (!vapidKey) {
				throw new Error('❌ VAPID key is not configured');
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

	private handleForegroundMessage(payload: any): void {
		const { notification, data } = payload;

		// Handle data payload first (includes device revocation)
		if (data) {
			this.handleNotificationData(data);
		}

		// Show notification in foreground (optional, since browser handles this)
		if (notification) {
			this.showInAppNotification(notification);
		}
	}

	private showInAppNotification(notification: any): void {
		// You can implement custom in-app notification UI here
		// For now, we'll use the browser's native notification
		if (Notification.permission === 'granted') {
			new Notification(notification.title, {
				body: notification.body,
				icon: notification.icon || '/favicon.ico',
				tag: 'bittasker-notification'
			});
		}
	}

	private async handleNotificationData(data: any): Promise<void> {
		// Handle notification data (e.g., navigate to specific page)
		console.log('📱 Handling notification data:', data);

		// Handle device revocation notification first
		if (data.type === 'device_revoked') {
			await this.handleDeviceRevocation(data);
			return; // Exit early, don't navigate anywhere
		}

		// Determine the target URL based on notification type
		let targetUrl = '/dashboard';

		// TODO: Only task_match notification is implemented
		// Check for click_action first (Android-specific), then fallback to other locations
		if (data.click_action) {
			targetUrl = data.click_action;
			console.log('🎯 Using click_action:', targetUrl);
		} else if (data.clickAction || data.data?.clickAction) {
			targetUrl = data.clickAction || data.data.clickAction;
			console.log('🎯 Using clickAction:', targetUrl);
		} else if (data.type === 'task_match') {
			targetUrl = data.clickAction || '/dashboard/find-tasks';
		} else if (data.type === 'new_bid' && data.taskId) {
			targetUrl = `/dashboard/task/${data.taskId}`;
		} else if (data.type === 'message' && data.conversationId) {
			targetUrl = `/dashboard/messages/to/${data.conversationId}`;
		} else if (data.type === 'task_update' && data.taskId) {
			targetUrl = `/dashboard/task/${data.taskId}`;
		} else if (data.url) {
			targetUrl = data.url;
		}

		console.log('🎯 Navigating to:', targetUrl);

		// Navigate using appropriate method for platform
		await this.navigateToUrl(targetUrl);
	}

	/**
	 * Handle device revocation notification - immediately log out the user
	 */
	private async handleDeviceRevocation(data: any): Promise<void> {
		// Show toast notification
		appStore.showInfoToast(data.message || 'Your device access has been revoked');

		// Use existing logout functionality
		const { authState } = await import('$lib/stores/auth.store');
		await authState.logout();

		// Navigate to login
		goto('/auth/login');
	}

	/**
	 * Enhanced handling for foreground notifications using local notifications for better reliability
	 */
	private async handleForegroundNotification(notification: PushNotificationSchema): Promise<void> {
		console.log('🔔 Handling foreground notification:', notification);

		// Show both toast and local notification for better UX
		await this.handleNativeNotification(notification);

		// Create a local notification that users can tap
		if (Capacitor.isNativePlatform()) {
			try {
				await this.ensureNotificationChannel();

				const notificationId = this.generateNotificationId();
				const localNotificationData = {
					title: notification.title || 'New Notification',
					body: notification.body || '',
					id: notificationId,
					schedule: { at: new Date(Date.now() + 100) }, // Schedule immediately
					sound: 'default',
					attachments: notification.data?.imageUrl ? [{ id: 'image', url: notification.data.imageUrl }] : undefined,
					actionTypeId: 'tap',
					extra: {
						...notification.data,
						originalNotification: notification,
						notificationType: 'push'
					}
				};

				await LocalNotifications.schedule({
					notifications: [localNotificationData]
				});

				console.log('📱 Local notification scheduled for foreground push');
			} catch (error) {
				console.error('❌ Error creating local notification:', error);
			}
		}
	}

	/**
	 * Navigate to URL using appropriate method for the platform
	 */
	private async navigateToUrl(url: string): Promise<void> {
		if (!browser) return;

		try {
			if (Capacitor.isNativePlatform()) {
				// For native platforms, use SvelteKit navigation
				// The notification should already bring the app to foreground
				console.log('📱 Native SPA navigation to:', url);
				await goto(url);
			} else {
				// For web, use SvelteKit navigation
				console.log('🌐 Web navigation to:', url);
				await goto(url);
			}
		} catch (error) {
			console.error('❌ Navigation error:', error);
			// Fallback to window.location for critical navigation
			if (browser && window.location) {
				window.location.href = url;
			}
		}
	}

	private async addListeners(): Promise<void> {
		PushNotifications.addListener('registration', (token: Token) => {
			console.log('Push registration token success');
			this.registerTokenOnServer(token.value);
		});

		PushNotifications.addListener('registrationError', (error: any) => {
			console.error('Error on registration: ' + JSON.stringify(error));
		});

		PushNotifications.addListener(
			'pushNotificationReceived',
			(notification: PushNotificationSchema) => {
				console.log('Push received: ', notification);
				this.handleForegroundNotification(notification);
			}
		);

		PushNotifications.addListener(
			'pushNotificationActionPerformed',
			(notification: ActionPerformed) => {
				this.handleNativeNotificationAction(notification);
			}
		);

		// Add local notification listeners for foreground notifications
		if (Capacitor.isNativePlatform()) {
			LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
				console.log('🔔 Local notification action performed:', notification);

				// Handle the local notification tap the same way as push notifications
				if (notification.notification.extra) {
					this.handleNotificationData(notification.notification.extra);
				} else {
					// Fallback to dashboard if no data
					this.navigateToUrl('/dashboard');
				}
			});
		}
	}

	/**
	 * Add deep link listener for when app is opened from notifications
	 */
	private addDeepLinkListener(): void {
		App.addListener('appUrlOpen', (data) => {
			console.log('🔗 App opened with URL:', data);

			// Parse the URL to extract the path for internal navigation
			if (data.url) {
				try {
					const url = new URL(data.url);
					// Navigate to the path portion of the URL
					if (url.pathname && url.pathname !== '/') {
						console.log('📍 Navigating to deep link path:', url.pathname);
						this.navigateToUrl(url.pathname + (url.search || ''));
					} else {
						// Fallback to dashboard if no specific path
						this.navigateToUrl('/dashboard');
					}
				} catch (error) {
					console.error('❌ Error parsing deep link URL:', error);
					// Fallback to dashboard
					this.navigateToUrl('/dashboard');
				}
			}
		});

		// Add listener for notification URL from native Android code
		if (Capacitor.isNativePlatform()) {
			// Listen for custom notification URL events from MainActivity
			(window as any).addEventListener('notificationUrlOpen', (event: any) => {
				console.log('🔔 Notification URL event received:', event.detail);
				if (event.detail?.url) {
					this.navigateToUrl(event.detail.url);
				}
			});
		}
	}

	private async handleNativeNotification(notification: PushNotificationSchema): Promise<void> {
		// Handle native notification received in foreground
		console.log('📱 Foreground notification received:', notification);

		try {
			// Show a local notification in the notification bar even when app is in foreground
			await this.showLocalNotification(notification);

			// Also show a subtle toast for immediate feedback
			appStore.showInfoToast(notification.title || 'New notification received');
		} catch (error) {
			console.error('❌ Error showing foreground notification:', error);
			// Fallback to just showing toast
			appStore.showInfoToast(notification.title || 'New notification received');
		}
	}

	/**
	 * Create push notification channel for Android
	 */
	private async createPushNotificationChannel(): Promise<void> {
		if (!Capacitor.isNativePlatform()) return;

		try {
			// Create a push notification channel for Android using PushNotifications plugin
			await PushNotifications.createChannel({
				id: 'bittasker-push',
				name: 'BitTasker Push Notifications',
				description: 'Push notifications from BitTasker server',
				importance: 4, // High importance
				sound: 'default',
				vibration: true,
				lights: true,
				lightColor: '#FF0000'
			});
			console.log('✅ Push notification channel created');
		} catch (error) {
			// Channel might already exist, that's fine
			console.log('📱 Push notification channel already exists or not needed on this platform');
		}
	}

	/**
	 * Ensure local notification channel exists for Android
	 */
	private async ensureNotificationChannel(): Promise<void> {
		if (!Capacitor.isNativePlatform()) return;

		try {
			// Create a notification channel for Android using LocalNotifications plugin
			await LocalNotifications.createChannel({
				id: 'bittasker-foreground',
				name: 'BitTasker Notifications',
				description: 'Local notifications from BitTasker app',
				importance: 4, // High importance
				sound: 'default',
				vibration: true,
				lights: true,
				lightColor: '#FF0000'
			});
		} catch (error) {
			// Channel might already exist, that's fine
			console.log('📱 Local notification channel already exists or not needed on this platform');
		}
	}

	/**
	 * Generate a safe notification ID for Android (within Java int range)
	 */
	private generateNotificationId(): number {
		// Increment counter and use modulo to keep within Java int range
		this.notificationCounter = (this.notificationCounter + 1) % 2147483647;
		// Add some randomness while keeping it small
		return Math.floor(Math.random() * 100000) + this.notificationCounter;
	}

	/**
	 * Show a local notification for foreground push notifications
	 */
	private async showLocalNotification(pushNotification: PushNotificationSchema): Promise<void> {
		if (!Capacitor.isNativePlatform()) return;

		try {
			// Request permission for local notifications
			const permission = await LocalNotifications.checkPermissions();
			if (permission.display !== 'granted') {
				const result = await LocalNotifications.requestPermissions();
				if (result.display !== 'granted') {
					console.warn('⚠️ Local notification permission not granted');
					return;
				}
			}

			// Ensure notification channel exists (Android)
			await this.ensureNotificationChannel();

			// Generate a safe notification ID
			const notificationId = this.generateNotificationId();

			// Schedule the local notification
			await LocalNotifications.schedule({
				notifications: [
					{
						title: pushNotification.title || 'BitTasker',
						body: pushNotification.body || 'You have a new notification',
						id: notificationId,
						sound: 'default',
						actionTypeId: 'OPEN_ACTION',
						extra: pushNotification.data || {},
						// Show immediately
						schedule: { at: new Date(Date.now() + 100) },
						// Auto-dismiss after 10 seconds if not interacted with
						autoCancel: true,
						// Use our notification channel on Android
						channelId: 'bittasker-foreground'
					}
				]
			});

			console.log('✅ Local notification scheduled with ID:', notificationId);
		} catch (error) {
			console.error('❌ Error scheduling local notification:', error);
		}
	}

	/**
	 * Add listener for local notification actions (more reliable than push notification actions)
	 */
	private async handleNativeNotificationAction(notification: ActionPerformed): Promise<void> {
		// Handle when user taps on notification
		console.log('🔔 Notification action performed:', notification);
		console.log('🔍 Full notification object:', JSON.stringify(notification, null, 2));

		// Extract data from different possible locations in the notification
		let notificationData: any = {};

		// Try different paths where the data might be located
		if (notification.notification?.data) {
			notificationData = notification.notification.data;
			console.log('🎯 Using notification.notification.data');
		} else if (notification.notification) {
			notificationData = notification.notification;
			console.log('🎯 Using notification.notification');
		} else if ((notification as any).data) {
			notificationData = (notification as any).data;
			console.log('🎯 Using notification.data');
		} else {
			notificationData = notification;
			console.log('🎯 Using notification directly');
		}

		console.log('📱 Extracted notification data:', notificationData);

		// Navigate to the appropriate screen based on notification data
		if (notificationData && Object.keys(notificationData).length > 0) {
			await this.handleNotificationData(notificationData);
		} else {
			// Fallback to dashboard if no specific data
			console.log('⚠️ No notification data found, navigating to dashboard');
			await this.navigateToUrl('/dashboard');
		}
	}

	private async requestPermissions(): Promise<void> {
		let permStatus = await PushNotifications.checkPermissions();

		if (permStatus.receive === 'prompt') {
			permStatus = await PushNotifications.requestPermissions();
		}

		if (permStatus.receive !== 'granted') {
			throw new Error('User denied permissions!');
		}
	}

	private async registerDevice(): Promise<void> {
		await PushNotifications.register();
	}

	private async registerTokenOnServer(token: string): Promise<void> {
		try {
			if (!this.currentDeviceId) {
				throw new Error('❌ Device ID not available');
			}

			const capacitorPlatform = Capacitor.getPlatform();
			let platform: 'ANDROID' | 'IOS' | 'WEB' = 'WEB';

			if (capacitorPlatform === 'ios') {
				platform = 'IOS';
			} else if (capacitorPlatform === 'android') {
				platform = 'ANDROID';
			}

			const result = await this.registerDeviceStore.mutate({
				input: {
					deviceId: this.currentDeviceId,
					deviceName: this.deviceName,
					fcmToken: token,
					platform: platform,
					appVersion: this.getAppVersion()
				}
			});

			if (result.errors) {
				console.error('❌ GraphQL errors:', result.errors);
				throw new Error(result.errors[0].message);
			}

		} catch (error) {
			throw error || new Error('❌ An error occurred while registering device on server');
		}
	}

	// Public method to manually refresh token (useful for token rotation)
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
			if (Capacitor.isNativePlatform()) {
				// For native, we'll revoke the device on the server
			} else {
				const { deleteToken } = await import('firebase/messaging');
				await deleteToken(this.messaging);
			}

			// Call GraphQL mutation to revoke device
			const result = await this.revokeDeviceStore.mutate({
				deviceId: this.currentDeviceId!
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			console.log('Successfully unregistered from push notifications');
		} catch (error) {
			console.error('Error unregistering from push notifications:', error);
		}
	}

	// Public method to get user's devices
	public async getMyDevices() {
		try {
			const result = await this.myDevicesStore.fetch({ policy: 'NetworkOnly' });
			if (result.errors) {
				throw new Error(result.errors[0].message);
			}
			return result.data?.myDevices || [];
		} catch (error) {
			console.error('Error fetching user devices:', error);
			return [];
		}
	}

	// Public method to revoke a specific device
	public async revokeDevice(deviceId: string, message?: string) {
		try {
			console.log({ deviceId, curr: this.currentDeviceId })
			const result = await this.revokeDeviceStore.mutate({
				deviceId
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			console.log(`Successfully revoked device: ${deviceId}`);

			// Then, send push notification to the revoked device to force logout
			try {
				const notificationData = {
					title: 'Device Access Revoked',
					body: message || 'Your device access has been revoked for security reasons. You will be logged out immediately.',
					deviceId
				}
				await this.sendNotification(notificationData);
			} catch (notificationError) {
				console.warn('Error sending revocation notification:', notificationError);
				// Continue - the device revocation was successful even if notification failed
			}

			return result.data?.revokeDevice;
		} catch (error) {
			console.error('Error revoking device:', error);
			throw error;
		}
	}

	// Public method to get notification preferences
	public async getNotificationPreferences() {
		try {
			const result = await this.myNotificationPreferencesStore.fetch();
			if (result.errors) {
				throw new Error(result.errors[0].message);
			}
			return result.data?.myNotificationPreferences;
		} catch (error) {
			console.error('Error fetching notification preferences:', error);
			return null;
		}
	}

	// Public method to send notification
	public async sendNotification({ title, body, deviceId }: { title: string, body: string, deviceId: string }) {
		try {
			const result = await this.sendNotificationStore.mutate({
				input: {
					title,
					body,
					deviceId,
					type: 'device_revoked'
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			return result.data?.sendNotification;
		} catch (error) {
			console.error('Error sending notification:', error);
			throw error;
		}
	}

	// Public method to subscribe to topic
	public async subscribeToTopic(topic: string) {
		try {
			const result = await this.subscribeToTopicStore.mutate({
				input: {
					topic
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			return result.data?.subscribeToTopic;
		} catch (error) {
			console.error('Error subscribing to topic:', error);
			throw error;
		}
	}

	// Public method to unsubscribe from topic
	public async unsubscribeFromTopic(topic: string) {
		try {
			const result = await this.unsubscribeFromTopicStore.mutate({
				input: {
					topic
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			return result.data?.unsubscribeFromTopic;
		} catch (error) {
			console.error('Error unsubscribing from topic:', error);
			throw error;
		}
	}

	// Public method to update device activity
	public async updateDeviceActivity() {
		try {
			const result = await this.updateDeviceActivityStore.mutate({
				deviceId: this.currentDeviceId!
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			return result.data?.updateDeviceActivity;
		} catch (error) {
			console.error('Error updating device activity:', error);
			throw error;
		}
	}

	// Getter for current device ID
	public getCurrentDeviceId(): string | null {
		return this.currentDeviceId;
	}

	// Method to test notifications (useful for debugging)
	public async testNotification(): Promise<void> {
		try {
			console.log('🧪 Testing notification...');

			if (Capacitor.isNativePlatform()) {
				// For native platforms, we'll use the sendNotification mutation
				const notificationData = {
					title: 'Test Notification',
					body: 'This is a test notification from BitTasker',
					deviceId: this.currentDeviceId!
				}
				await this.sendNotification(notificationData);
			} else {
				// For web, show a local notification
				if (Notification.permission === 'granted') {
					new Notification('Test Notification', {
						body: 'This is a test notification from BitTasker',
						icon: '/favicon.ico',
						tag: 'test-notification'
					});
					console.log('✅ Local test notification shown');
				} else {
					console.warn('⚠️ Notification permission not granted for local test');
				}
			}
		} catch (error) {
			console.error('❌ Error testing notification:', error);
			throw error;
		}
	}

	// Debug method to get current status
	public getDebugInfo(): object {
		return {
			platform: Capacitor.getPlatform(),
			isNative: Capacitor.isNativePlatform(),
			deviceId: this.currentDeviceId,
			messagingInitialized: !!this.messaging,
			notificationPermission: typeof Notification !== 'undefined' ? Notification.permission : 'unknown',
			notificationSupported: isNotificationSupported()
		};
	}
}

// Export singleton instance
export const pushNotificationService = new PushNotificationService();