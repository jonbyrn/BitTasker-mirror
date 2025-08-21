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
		console.warn('Service workers are not supported in this browser');
		return null;
	}

	try {
		const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');

		// Send Firebase config to service worker
		if (registration.active) {
			console.log('Sending Firebase config to service worker');
			registration.active.postMessage({
				type: 'FIREBASE_CONFIG',
				config: getFirebaseWebConfig()
			});
		}

		// Set up navigation message handler
		setupNavigationHandler();

		return registration;
	} catch (error) {
		console.error('Service Worker registration failed:', error);
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
				console.log('🔄 Service worker navigation request:', event.data.url);
				
				try {
					// Use SvelteKit navigation
					const { goto } = await import('$app/navigation');
					await goto(event.data.url);
					console.log('✅ Navigation successful:', event.data.url);
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

/**
 * Analytics Helper Functions
 * Added to FCM utilities to leverage existing Firebase configuration
 */

/**
 * Initialize Firebase Analytics
 * Returns Analytics instance if supported and consent is given
 */
export async function initializeAnalytics(): Promise<any | null> {
	if (typeof window === 'undefined') return null;

	try {
		const { initializeApp, getApps } = await import('firebase/app');
		const { getAnalytics, isSupported } = await import('firebase/analytics');
		
		// Check if Analytics is supported
		const supported = await isSupported();
		if (!supported) {
			console.warn('Firebase Analytics not supported in this environment');
			return null;
		}

		const firebaseConfig = getFirebaseWebConfig();
		
		// Reuse existing app or create new one
		const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
		
		// Get Analytics instance
		const analytics = getAnalytics(app);
		
		console.log('Firebase Analytics initialized');
		return analytics;
	} catch (error) {
		console.error('Failed to initialize Analytics:', error);
		return null;
	}
}

/**
 * Check if Analytics is supported in current environment
 */
export async function isAnalyticsSupported(): Promise<boolean> {
	if (typeof window === 'undefined') return false;
	
	try {
		const { isSupported } = await import('firebase/analytics');
		return await isSupported();
	} catch {
		return false;
	}
}

/**
 * Load Google Analytics gtag script
 */
export function loadGtagScript(measurementId: string): Promise<void> {
	return new Promise((resolve, reject) => {
		if (typeof window === 'undefined') {
			reject(new Error('Window not available'));
			return;
		}

		// Check if gtag is already loaded
		if (window.gtag) {
			resolve();
			return;
		}

		// Create script element
		const script = document.createElement('script');
		script.async = true;
		script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
		
		script.onload = () => {
			// Initialize dataLayer and gtag
			window.dataLayer = window.dataLayer || [];
			window.gtag = function() {
				window.dataLayer.push(arguments);
			};
			
			window.gtag('js', new Date());
			resolve();
		};
		
		script.onerror = () => {
			reject(new Error('Failed to load gtag script'));
		};

		document.head.appendChild(script);
	});
}

/**
 * Configure gtag with Firebase config
 */
export function configureGtag(measurementId?: string): void {
	if (typeof window === 'undefined' || !window.gtag) return;

	const config = getFirebaseWebConfig();
	const id = measurementId || config.measurementId || config.appId;
	
	window.gtag('config', id, {
		app_name: 'BitTasker',
		app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.0',
		send_page_view: true,
		custom_map: {
			'custom_user_id': 'user_id'
		}
	});
}

/**
 * Analytics consent management helper
 */
export function updateAnalyticsConsent(granted: boolean): void {
	if (typeof window === 'undefined' || !window.gtag) return;

	window.gtag('consent', 'update', {
		analytics_storage: granted ? 'granted' : 'denied',
		ad_storage: 'denied', // BitTasker doesn't use ads
		ad_user_data: 'denied',
		ad_personalization: 'denied'
	});

	console.log(`Analytics consent ${granted ? 'granted' : 'denied'}`);
}

/**
 * Set default consent state before gtag loads
 */
export function setDefaultConsent(): void {
	if (typeof window === 'undefined') return;

	// Initialize dataLayer if not exists
	window.dataLayer = window.dataLayer || [];
	
	// Set default consent (denied until user accepts)
	window.dataLayer.push(['consent', 'default', {
		analytics_storage: 'denied',
		ad_storage: 'denied',
		ad_user_data: 'denied',
		ad_personalization: 'denied'
	}]);
}
