/**
 * Firebase Cloud Messaging Utilities
 *
 * This module provides utilities for working with FCM on web platforms,
 * including dynamically updating the service worker with configuration.
 */

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (!('serviceWorker' in navigator)) {
		console.warn('⚠️ Service workers are not supported in this browser');
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
			scope: '/',
			updateViaCache: 'none'
		});

		console.log('✅ Service worker registered:', registration.scope);

		// Wait for service worker to be ready
		if (registration.installing) {
			// BUG FIX: capture a reference to the installing worker.
			// registration.installing becomes null once the worker transitions past
			// the 'installing' state, so checking registration.installing?.state later
			// always yields undefined and the promise never resolves.
			const installingSw = registration.installing;
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error('Service worker activation timed out')),
					15000
				);

				if (installingSw.state === 'activated') {
					clearTimeout(timeout);
					resolve();
					return;
				}

				installingSw.addEventListener('statechange', () => {
					if (installingSw.state === 'activated') {
						clearTimeout(timeout);
						resolve();
					}
				});
			});
		} else if (registration.waiting) {
			// Service worker is waiting, activate it
			registration.waiting.postMessage({ type: 'SKIP_WAITING' });
		}

		// Wait a bit for service worker to be ready
		await new Promise((resolve) => setTimeout(resolve, 500));

		// Send Firebase config to service worker
		const activeWorker = registration.active || registration.waiting || registration.installing;
		if (activeWorker) {
			activeWorker.postMessage({
				type: 'FIREBASE_CONFIG',
				config: getFirebaseWebConfig()
			});
		} else {
			console.warn('⚠️ No active service worker found to send config to');
		}

		// Check for a newer version of the service worker on every app load.
		// Browsers normally throttle these checks, but calling update() ensures
		// we don't wait up to 24h for the automatic check.
		registration.update();

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
 * Gets the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
	return Notification.permission;
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
