import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import {
	RegisterDeviceStore,
	RevokeDeviceStore,
	MyDevicesStore,
	MyNotificationPreferencesStore,
	SendTestNotificationStore,
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
import { getDeviceIdentifier } from '$lib/utils/helpers/deviceIdentity';

class PushNotificationService {
	private messaging: any = null;
	private currentDeviceId: string | null = null;

	// Houdini Stores
	private registerDeviceStore = new RegisterDeviceStore();
	private revokeDeviceStore = new RevokeDeviceStore();
	private myDevicesStore = new MyDevicesStore();
	private myNotificationPreferencesStore = new MyNotificationPreferencesStore();
	private sendTestNotificationStore = new SendTestNotificationStore();
	private subscribeToTopicStore = new SubscribeToTopicStore();
	private unsubscribeFromTopicStore = new UnsubscribeFromTopicStore();
	private updateDeviceActivityStore = new UpdateDeviceActivityStore();

	constructor() {
		getDeviceIdentifier().then((deviceId) => {
			this.currentDeviceId = deviceId;
		});
	}

	// TODO: Get this from your app config or package.json
	private getAppVersion(): string {
		return '1.0.0';
	}

	public async init(): Promise<void> {
		try {
			if (Capacitor.isNativePlatform()) {
				this.addListeners();
				await this.requestPermissions();
				await this.registerDevice();
			} else {
				await this.initWebPushNotifications();
			}
		} catch (error) {
			console.error('❌ Error initializing push notifications:', error);
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
			await this.registerServiceWorker();

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
				console.log('🎯 FCM token received:', token.substring(0, 20) + '...');
				await this.registerTokenOnServer(token);
			} else {
				console.warn('⚠️ No registration token available.');
			}
		} catch (error) {
			console.error('❌ An error occurred while retrieving token:', error);
			throw error;
		}
	}

	private async registerServiceWorker(): Promise<void> {
		try {
			await registerServiceWorker();
		} catch (error) {
			console.error('Service Worker registration failed:', error);
		}
	}

	private handleForegroundMessage(payload: any): void {
		const { notification, data } = payload;

		// Show notification in foreground (optional, since browser handles this)
		if (notification) {
			this.showInAppNotification(notification);
		}

		// Handle data payload
		if (data) {
			this.handleNotificationData(data);
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

	private handleNotificationData(data: any): void {
		// Handle notification data (e.g., navigate to specific page)
		console.log('Notification data:', data);

		// Example: Navigate to a specific route based on notification type
		if (data.type === 'new_bid' && data.taskId) {
			window.location.href = `/dashboard/task/${data.taskId}`;
		} else if (data.type === 'message' && data.conversationId) {
			window.location.href = `/dashboard/messages/to/${data.conversationId}`;
		}
	}

	private async addListeners(): Promise<void> {
		PushNotifications.addListener('registration', (token: Token) => {
			console.log('Push registration success, token: ', token.value);
			this.registerTokenOnServer(token.value);
		});

		PushNotifications.addListener('registrationError', (error: any) => {
			console.error('Error on registration: ' + JSON.stringify(error));
		});

		PushNotifications.addListener(
			'pushNotificationReceived',
			(notification: PushNotificationSchema) => {
				console.log('Push received: ', notification);
				this.handleNativeNotification(notification);
			}
		);

		PushNotifications.addListener(
			'pushNotificationActionPerformed',
			(notification: ActionPerformed) => {
				console.log('Push action performed: ', notification);
				this.handleNativeNotificationAction(notification);
			}
		);
	}

	private handleNativeNotification(notification: PushNotificationSchema): void {
		// TODO: Handle native notification received in foreground
		// You can show custom in-app notification here
		console.log('Native notification received:', notification);
	}

	private handleNativeNotificationAction(notification: ActionPerformed): void {
		// TODO: Handle when user taps on notification
		const { data } = notification.notification;
		this.handleNotificationData(data);
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
					fcmToken: token,
					platform: platform,
					appVersion: this.getAppVersion()
				}
			});

			if (result.errors) {
				console.error('❌ GraphQL errors:', result.errors);
				throw new Error(result.errors[0].message);
			}

			console.log('✅ Successfully registered device on server:', result.data?.registerDevice);
		} catch (error) {
			console.error('❌ Error registering device on server:', error);
			throw error;
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
			const result = await this.myDevicesStore.fetch();
			if (result.errors) {
				throw new Error(result.errors[0].message);
			}
			return result.data?.myDevices || [];
		} catch (error) {
			console.error('Error fetching user devices:', error);
			return [];
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

	// Public method to send test notification
	public async sendTestNotification(title: string, body: string) {
		try {
			const result = await this.sendTestNotificationStore.mutate({
				input: {
					title,
					body,
					deviceId: this.currentDeviceId
				}
			});

			if (result.errors) {
				throw new Error(result.errors[0].message);
			}

			return result.data?.sendTestNotification;
		} catch (error) {
			console.error('Error sending test notification:', error);
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
				// For native platforms, we'll use the sendTestNotification mutation
				await this.sendTestNotification('Test Notification', 'This is a test notification from Bittasker');
			} else {
				// For web, show a local notification
				if (Notification.permission === 'granted') {
					new Notification('Test Notification', {
						body: 'This is a test notification from Bittasker',
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

// Add to window for debugging in development
// if (typeof window !== 'undefined' && import.meta.env.DEV) {
// 	(window as any).pushService = pushNotificationService;
// 	console.log('🐛 Push service available on window.pushService for debugging');
// } 