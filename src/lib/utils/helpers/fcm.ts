/**
 * Firebase Cloud Messaging Utilities
 * 
 * This module provides utilities for working with FCM on web platforms,
 * including dynamically updating the service worker with configuration.
 */

/**
 * Registers the Firebase Messaging Service Worker
 * The service worker will fetch its config from /firebase-config.json endpoint
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) {
		console.warn('⚠️ Service workers are not supported in this browser');
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
			scope: '/'
		});

		// Wait for service worker to be ready
		if (registration.installing) {
			await new Promise<void>((resolve) => {
				registration.installing!.addEventListener('statechange', () => {
					if (registration.installing!.state === 'activated') {
						resolve();
					}
				});
			});
		} else if (registration.waiting) {
			// Service worker is waiting, activate it
			registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		}

		// Wait for service worker to be ready
		await navigator.serviceWorker.ready;

		// Get Firebase config and validate
		const firebaseConfig = getFirebaseWebConfig();
		
		// Validate config before sending
		if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
			console.error('❌ Firebase config is incomplete, cannot send to service worker');
			console.error('Missing config:', {
				apiKey: !!firebaseConfig.apiKey,
				projectId: !!firebaseConfig.projectId,
				messagingSenderId: !!firebaseConfig.messagingSenderId
			});
			return registration;
		}

		// Send Firebase config to service worker with retry logic
		let configSent = false;
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const activeWorker = registration.active || registration.waiting || registration.installing;
				if (activeWorker) {
					activeWorker.postMessage({
						type: 'FIREBASE_CONFIG',
						config: firebaseConfig
					});
					configSent = true;
					break;
				} else {
					console.warn(`⚠️ No active service worker found (attempt ${attempt}/3), waiting...`);
					if (attempt < 3) {
						await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
						// Try to get ready again
						await navigator.serviceWorker.ready;
					}
				}
			} catch (error) {
				console.error(`❌ Error sending config (attempt ${attempt}/3):`, error);
				if (attempt < 3) {
					await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
				}
			}
		}

		if (!configSent) {
			console.error('❌ Failed to send Firebase config to service worker after 3 attempts');
			console.warn('⚠️ Service worker will try to fetch from /firebase-config.json (may fail on static server)');
		}

		// Set up navigation message handler
		setupNavigationHandler();

		return registration;
	} catch (error) {
		console.error('❌ Service Worker registration failed:', error);
		return null;
	}
}

/**
 * Sets up message handler for navigation from service worker
 */
function setupNavigationHandler(): void {
	if ('serviceWorker' in navigator) {
		navigator.serviceWorker.addEventListener('message', async (event) => {
			if (event.data && event.data.type === 'NAVIGATE') {
				try {
					// Use SvelteKit navigation
					const { goto } = await import('$app/navigation');
					await goto(event.data.url);
				} catch (error) {
					console.error('❌ Navigation error, falling back to window.location:', error);
					// Fallback to window.location for critical navigation
					window.location.href = event.data.url;
				}
			}
		});
	}
}

/**
 * Checks if the browser supports notifications
 */
export function isNotificationSupported(): boolean {
	return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

/**
 * Gets the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
	return Notification.permission;
}

/**
 * Requests notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!isNotificationSupported()) {
		throw new Error('Notifications are not supported in this browser');
	}

	return await Notification.requestPermission();
}

/**
 * Shows a test notification to verify setup
 */
export function showTestNotification(): void {
	if (Notification.permission === 'granted') {
		new Notification('BitTasker Notifications', {
			body: 'Push notifications are now enabled!',
			icon: '/favicon.ico',
			tag: 'test-notification'
		});
	}
}

/**
 * Firebase configuration object for web
 */
export function getFirebaseWebConfig() {
	return {
		apiKey: import.meta.env.VITE_FIREBASE_WEB_API_KEY,
		authDomain: import.meta.env.VITE_FIREBASE_WEB_AUTH_DOMAIN,
		projectId: import.meta.env.VITE_FIREBASE_WEB_PROJECT_ID,
		storageBucket: import.meta.env.VITE_FIREBASE_WEB_STORAGE_BUCKET,
		messagingSenderId: import.meta.env.VITE_FIREBASE_WEB_MESSAGING_SENDER_ID,
		appId: import.meta.env.VITE_FIREBASE_WEB_APP_ID
	};
}

/**
 * VAPID key for FCM web push
 */
export function getVapidKey(): string {
	return import.meta.env.VITE_FIREBASE_VAPID_KEY;
}
