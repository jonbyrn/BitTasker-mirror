// Firebase Messaging Service Worker
// This file handles background push notifications for web browsers

/* global importScripts, firebase, clients */
// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

const _firebaseConfig = {
	apiKey: "AIzaSyCPvSA-3VNTbj0CeXsVPrr9R3RrnO6N1KY",
	authDomain: "bittasker-928ff.firebaseapp.com",
	projectId: "bittasker-928ff",
	storageBucket: "bittasker-928ff.firebasestorage.app",
	messagingSenderId: "256658163015",
	appId: "1:256658163015:web:b220610251f027bf597862"
}

let messaging = null;
let isInitialized = false;

// Function to initialize Firebase with config from server
async function initializeFirebase(config = {}) {
	try {
		// Don't re-initialize if already done
		if (isInitialized && firebase.apps.length > 0) {
			return messaging;
		}

		let firebaseConfig = config;

		// If config is empty or incomplete, fetch from server
		if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
			firebaseConfig = _firebaseConfig;
		}

		// Validate config
		if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
			throw new Error('Invalid Firebase configuration received');
		}

		// Initialize Firebase
		if (firebase.apps.length === 0) {
			firebase.initializeApp(firebaseConfig);
		}

		messaging = firebase.messaging();
		isInitialized = true;

		// Set up background message handler immediately after initialization
		setupBackgroundMessageHandler();

		return messaging;
	} catch (error) {
		console.error('❌ SW: Failed to initialize Firebase in service worker:', error);
		isInitialized = false;
		return null;
	}
}

// Set up background message handler
function setupBackgroundMessageHandler() {
	if (!messaging) {
		console.error('❌ SW: Cannot setup message handler - messaging not available');
		return;
	}

	try {
		messaging.onBackgroundMessage((payload) => {
			const { notification, data } = payload;
			console.log('🔕 SW: Background message received');


			// ⚠️ CRITICAL: If notification object exists, FCM already displayed it
			// Don't show another one to prevent duplicates
			if (notification) {
				console.log('🔕 SW: Notification object present, FCM will handle display automatically');
				return; // Exit early - FCM handles it
			}

			// Create unique tag for each notification to prevent replacement
			// Use combination of type, taskId, bidId, and timestamp to ensure uniqueness
			const timestamp = Date.now();
			const tag = `bittasker-${data.type || 'notification'}-${timestamp}`;

			const notificationTitle = data?.title || 'BitTasker';
			const notificationOptions = {
				body: data?.body || 'You have a new notification',
				icon: '/web-app-manifest-192x192.png', // Always use app icon, ignore backend icon
				badge: '/web-app-manifest-192x192.png',
				tag: tag,
				data: data || {},
				actions: [
					{
						action: 'open',
						title: 'Open',
						icon: '/web-app-manifest-192x192.png',
					},
					{
						action: 'close',
						title: 'Close'
					}
				],
				requireInteraction: false
			};

			return self.registration.showNotification(notificationTitle, notificationOptions);
		});
	} catch (error) {
		console.error('❌ SW: Error setting up background message handler:', error);
	}
}

// Initialize Firebase when service worker starts
initializeFirebase().catch((error) => {
	console.error('❌ SW: Error during initial Firebase initialization:', error);
});

// Handle messages from main thread (including Firebase config)
self.addEventListener('message', async (event) => {
	if (event.data && event.data.type === 'FIREBASE_CONFIG') {
		// Re-initialize with correct config if needed
		if (!isInitialized || firebase.apps.length === 0) {
			await initializeFirebase(event.data.config);
		}
	}
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'close') {
		return;
	}

	console.log('🔔 Notification clicked:', event.notification);

	// Get the notification data
	const data = event.notification.data;

	// Determine the URL to open based on notification type
	let urlToOpen = '/';

	if(data.clickAction) {
		urlToOpen = data.clickAction;
	} else if (data.click_action) {
		urlToOpen = data.click_action;
	} else if (data.clickAction || data.data?.clickAction) {
		urlToOpen = data.clickAction || data.data.clickAction;
	}

	// Open the app/specific page
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			// Check if app is already open
			for (const client of clientList) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					client.focus();
					// Use postMessage to navigate instead of client.navigate (which doesn't exist)
					client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
					return;
				}
			}

			// Open new window if app is not open
			if (clients.openWindow) {
				return clients.openWindow(urlToOpen);
			} else {
				console.error('❌ SW: Cannot open new window');
			}
		})
	);
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
	// You can track notification dismissals here if needed
}); 