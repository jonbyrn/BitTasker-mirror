import { Capacitor } from '@capacitor/core';
import type { Token, PushNotificationSchema, ActionPerformed } from '@capacitor/push-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { BaseApiService } from '$lib/api/apiService';
import { ENDPOINTS } from '$lib/api/endpoints';
import { 
	registerServiceWorker, 
	isNotificationSupported, 
	requestNotificationPermission,
	getFirebaseWebConfig,
	getVapidKey 
} from '$lib/utils/helpers/fcm';

class PushService extends BaseApiService {
	private messaging: any = null;

	constructor() {
		super();
	}

	public async init() {
		if (Capacitor.isNativePlatform()) {
			this.addListeners();
			await this.requestPermissions();
			await this.registerDevice();
		} else {
			await this.initWebPushNotifications();
		}
	}

	private async initWebPushNotifications() {
		try {
			// Check if notifications are supported
			if (!isNotificationSupported()) {
				console.warn('Push notifications are not supported in this browser');
				return;
			}

			const { initializeApp } = await import('firebase/app');
			const { getMessaging, onMessage } = await import('firebase/messaging');
			
			const firebaseConfig = getFirebaseWebConfig();
			const app = initializeApp(firebaseConfig);
			this.messaging = getMessaging(app);

			// Request permission for web notifications
			await this.requestWebPermissions();

			// Get FCM token
			await this.getWebToken();

			// Handle foreground messages
			onMessage(this.messaging, (payload) => {
				console.log('Message received in foreground: ', payload);
				this.handleForegroundMessage(payload);
			});

			// Register service worker for background messages
			await this.registerServiceWorker();

		} catch (error) {
			console.error('Error initializing web push notifications:', error);
		}
	}

	private async requestWebPermissions(): Promise<void> {
		const permission = await requestNotificationPermission();
		if (permission !== 'granted') {
			throw new Error('Notification permission not granted');
		}
	}

	private async getWebToken(): Promise<void> {
		try {
			const { getToken } = await import('firebase/messaging');
			
			const token = await getToken(this.messaging, {
				vapidKey: getVapidKey()
			});

			if (token) {
				console.log('FCM registration token:', token);
				await this.registerTokenOnServer(token);
			} else {
				console.log('No registration token available.');
			}
		} catch (error) {
			console.error('An error occurred while retrieving token:', error);
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
			// TODO: You can use your router here to navigate
			window.location.href = `/dashboard/task/${data.taskId}`;
		} else if (data.type === 'message' && data.conversationId) {
			window.location.href = `/dashboard/messages/to/${data.conversationId}`;
		}
	}

	private async addListeners() {
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
	}

	private handleNativeNotificationAction(notification: ActionPerformed): void {
		// TODO: Handle when user taps on notification
		const { data } = notification.notification;
		this.handleNotificationData(data);
	}

	private async requestPermissions() {
		let permStatus = await PushNotifications.checkPermissions();

		if (permStatus.receive === 'prompt') {
			permStatus = await PushNotifications.requestPermissions();
		}

		if (permStatus.receive !== 'granted') {
			throw new Error('User denied permissions!');
		}
	}

	private async registerDevice() {
		await PushNotifications.register();
	}

	private async registerTokenOnServer(token: string) {
		try {
			await this.post(ENDPOINTS.NOTIFICATIONS.REGISTER, { token });
			console.log(`Successfully registered token on server.`);
		} catch (error) {
			console.error('Error registering token on server', error);
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
				// For native, you might want to call a server endpoint to remove the token
				// PushNotifications doesn't have an unregister method
			} else {
				const { deleteToken } = await import('firebase/messaging');
				await deleteToken(this.messaging);
			}
			
			// Call server to remove token
			await this.delete(ENDPOINTS.NOTIFICATIONS.UNREGISTER);
			console.log('Successfully unregistered from push notifications');
		} catch (error) {
			console.error('Error unregistering from push notifications:', error);
		}
	}
}

export const pushService = new PushService(); 