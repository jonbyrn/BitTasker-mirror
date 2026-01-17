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
	UpdateDeviceActivityStore,
	SendNotificationToDeviceStore,
	SendNotificationToNpubsStore,
	type SendNotificationToDeviceInput,
	type SendNotificationToNpubsInput
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
	private isInitialized: boolean = false;

	// Houdini Stores
	private registerDeviceStore = new RegisterDeviceStore();
	private revokeDeviceStore = new RevokeDeviceStore();
	private myDevicesStore = new MyDevicesStore();
	private myNotificationPreferencesStore = new MyNotificationPreferencesStore();
	private sendNotificationStore = new SendNotificationStore();
	private sendNotificationToDeviceStore = new SendNotificationToDeviceStore();
	private sendNotificationToNpubsStore = new SendNotificationToNpubsStore();
	private subscribeToTopicStore = new SubscribeToTopicStore();
	private unsubscribeFromTopicStore = new UnsubscribeFromTopicStore();
	private updateDeviceActivityStore = new UpdateDeviceActivityStore();

	constructor() {
		getDeviceIdentifier().then((deviceId) => {
			this.currentDeviceId = deviceId;
		});
		(async () => {
			try {
				// Only access biometric data if user is authenticated
				const { value: token } = await Preferences.get({ key: StorageKeys.ACCESS_TOKEN });
				if (token) {
					// User is authenticated, safe to access biometric data
					let npub = get(appStore)?.biometricData?.username || (await Preferences.get({ key: StorageKeys.NPUB })).value || '';
					if (npub) {
						createUserDeviceShortName(npub).then((deviceName) => {
							this.deviceName = deviceName;
						});
					}
				}
				// If no token, skip accessing biometric data to avoid using stale data
			} catch (error) {
				// Silently fail - device name is optional and will be set when needed
				console.debug('Failed to initialize device name in push notification service:', error);
			}
		})();
	}

	// Get this from your app config or package.json
	private getAppVersion(): string {
		return __APP_VERSION__;
	}

	public async init(): Promise<void> {
		// Skip if already initialized
		if (this.isInitialized) return;

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
			// Check if notifications are supported
			if (!isNotificationSupported()) {
				console.warn('⚠️ Push notifications are not supported in this browser');
				return;
			}

			// Request permission for web notifications
			await this.requestWebPermissions();

			const { initializeApp } = await import('firebase/app');
			const { getMessaging, onMessage } = await import('firebase/messaging');

			const firebaseConfig = getFirebaseWebConfig();

			// Validate Firebase config
			if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
				throw new Error('❌ Firebase configuration is incomplete');
			}

			const app = initializeApp(firebaseConfig);
			this.messaging = getMessaging(app);

			// Get FCM token
			await this.getWebToken();

			// Handle foreground messages
			onMessage(this.messaging, async (payload) => {
				console.log('📨 Message received in foreground: ', payload);
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
		const permission = await requestNotificationPermission();
		if (permission !== 'granted') {
			throw new Error(`❌ Notification permission not granted: ${permission}`);
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
	private async handleForegroundMessage(payload: any): Promise<void> {
		// Handle data payload first (includes device revocation)
		if (payload.data) {
			appStore.showInfoToast(payload.data.title || 'New notification received');

			/**
			 * Avoid directly navigating to the URL in the notification
			 * TODO: Update toast notification to show action buttons
			 */
			if (payload.data.type === 'device_revoked') {
				await this.handleDeviceRevocation(payload.data);
				return; // Exit early, don't navigate anywhere
			}
			// this.handleNotificationData(payload.data);

			// Show notification in foreground (optional, since browser handles this)
			this.showInAppNotification(payload.data);
		}
	}

	/**
	 * Show in-app notification for web push notifications
	 * Web specific
	 */
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

	/**
	 * Handle notification data
	 * Mobile & Web
	 */
	private async handleNotificationData(data: any): Promise<void> {
		// Handle notification data (e.g., navigate to specific page)

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
		} else if (data.clickAction || data.data?.clickAction) {
			targetUrl = data.clickAction || data.data.clickAction;
		} else if (data.type === 'task_match') {
			targetUrl = data.clickAction || '/dashboard/find-tasks';
		} else if (data.type === 'new_bid' && data.taskId) {
			targetUrl = `/tasks/${data.taskId}`;
		} else if (data.type === 'message' && data.conversationId) {
			targetUrl = `/dashboard/messages/to/${data.conversationId}`;
		} else if (data.type === 'task_update' && data.taskId) {
			targetUrl = `/tasks/${data.taskId}`;
		} else if (data.url) {
			targetUrl = data.url;
		}

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
	 * Enhanced handling for foreground notifications
	 * Mobile specific - CONSOLIDATED to prevent duplicates (Android only)
	 */
	private async handleForegroundNotification(notification: PushNotificationSchema): Promise<void> {
		console.log('📨 Foreground notification received:', notification);

		// Check if this is a device revocation (handle immediately)
		if (notification.data?.type === 'device_revoked') {
			await this.handleDeviceRevocation(notification.data);
			return;
		}

		try {
			// Android: System doesn't show alerts in foreground by default
			// For other platforms (iOS will be handled later)
			// const platform = Capacitor.getPlatform();

			await this.showLocalNotification(notification.data);
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
			// TODO: Update this navigation for mobile
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

	/**
	 * Add listeners for push notifications
	 * Mobile specific
	 */
	private async addListeners(): Promise<void> {
		PushNotifications.addListener('registration', (token: Token) => {
			this.registerTokenOnServer(token.value);
		});

		PushNotifications.addListener('registrationError', (error: any) => {
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
				this.handleNativeNotificationAction(notification);
			}
		);

		// Add local notification listeners for foreground notifications
		if (Capacitor.isNativePlatform()) {
			LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
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
	 * Mobile specific
	 */
	private addDeepLinkListener(): void {
		App.addListener('appUrlOpen', (data) => {
			// Parse the URL to extract the path for internal navigation
			if (data.url) {
				try {
					const url = new URL(data.url);
					// Navigate to the path portion of the URL
					if (url.pathname && url.pathname !== '/') {
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
				if (event.detail?.url) {
					this.navigateToUrl(event.detail.url);
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
		} catch (error) {
			// Channel might already exist, that's fine
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
	 * Mobile specific
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

			// Generate a safe notification ID
			const notificationId = this.generateNotificationId();

			// Schedule ONE local notification using the unified channel
			await LocalNotifications.schedule({
				notifications: [
					{
						title: pushNotification.title || 'New Notification',
						body: pushNotification.body || 'You have a new notification',
						id: notificationId,
						sound: 'default',
						actionTypeId: 'OPEN_ACTION',
						extra: pushNotification.data || {},
						// Show immediately
						schedule: { at: new Date(Date.now() + 100) },
						autoCancel: true,
						// Use unified notification channel id
						channelId: 'bittasker-notification',
						smallIcon: 'ic_stat_notify'
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
	 * Mobile specific
	 */
	private async handleNativeNotificationAction(notification: ActionPerformed): Promise<void> {
		// Handle when user taps on notification

		// Extract data from different possible locations in the notification
		let notificationData: any = {};

		// Try different paths where the data might be located
		if (notification.notification?.data) {
			notificationData = notification.notification.data;
		} else if (notification.notification) {
			notificationData = notification.notification;
		} else if ((notification as any).data) {
			notificationData = (notification as any).data;
		} else {
			notificationData = notification;
		}

		// Navigate to the appropriate screen based on notification data
		if (notificationData && Object.keys(notificationData).length > 0) {
			await this.handleNotificationData(notificationData);
		} else {
			// Fallback to dashboard if no specific data
			await this.navigateToUrl('/dashboard');
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
			const result = await this.revokeDeviceStore.mutate({
				deviceId
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

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

	/**
	 * Send notification to a specific device
	 * Mobile & Web
	 */
	public async sendNotificationToDevice(notification: SendNotificationToDeviceInput) {
		try {
			const result = await this.sendNotificationToDeviceStore.mutate({ input: notification });
			if (result.errors) {
				throw new Error(result.errors[0].message);
			}
			return result.data?.sendNotificationToDevice;
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
			const result = await this.sendNotificationToNpubsStore.mutate({
				input: notification
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}
			return result.data?.sendNotificationToNpubs;
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
					await new Promise(resolve => setTimeout(resolve, 50));
				}
			}
		} catch (error) {
			console.warn('⚠️ Could not close existing notifications:', error);
		}
	}

	// Method to test notifications (useful for debugging)
	public async testNotification(): Promise<void> {
		try {
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