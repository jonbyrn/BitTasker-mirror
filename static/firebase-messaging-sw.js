// Firebase Messaging Service Worker
// This file handles background push notifications for web browsers

// Import Firebase scripts for service worker
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.10.0/firebase-messaging-compat.js');

let messaging = null;

// Function to initialize Firebase with config from server
async function initializeFirebase(config = {}) {
	try {
		let firebaseConfig = config;

		if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
			// Fetch Firebase config from app
			try {
				const response = await fetch('/firebase-config.json');
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}: ${response.statusText}`);
				}

				firebaseConfig = await response.json();
			} catch (error) {
				console.error('Failed to fetch Firebase config:', error);
				// Don't throw here, just log and wait for message from main thread
				return;
			}
		}

		// Validate config
		if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.messagingSenderId) {
			throw new Error('Invalid Firebase configuration received');
		}

		// Initialize Firebase
		firebase.initializeApp(firebaseConfig);
		messaging = firebase.messaging();

	} catch (error) {
		console.error('❌ Failed to initialize Firebase in service worker:', error);
	}
}

// Initialize Firebase when service worker starts
initializeFirebase();

// Handle background messages
self.addEventListener('message', (event) => {
	if (event.data && event.data.type === 'FIREBASE_CONFIG') {
		// Re-initialize with correct config if needed
		if (!firebase.apps.length) {
			initializeFirebase(event.data.config);
		}
	}
});

// Wait for Firebase to be ready before setting up message handler
setTimeout(() => {
	if (messaging) {
		messaging.onBackgroundMessage((payload) => {
			console.log('Received background message: ', payload);

			const { notification, data } = payload;

			const notificationTitle = notification?.title || 'BitTasker';
			const notificationOptions = {
				body: notification?.body || 'You have a new notification',
				icon: notification?.icon || '/favicon.ico',
				badge: '/favicon.ico',
				tag: 'bittasker-notification',
				data: data || {},
				actions: [
					{
						action: 'open',
						title: 'Open',
						icon: '/favicon.ico'
					},
					{
						action: 'close',
						title: 'Close'
					}
				],
				requireInteraction: true
			};

			self.registration.showNotification(notificationTitle, notificationOptions);
		});
	} else {
		console.error('❌ SW: Messaging not available after timeout');
	}
}, 1000);

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
	console.log('Notification clicked: ', event);

	event.notification.close();

	if (event.action === 'close') {
		console.log('🚪 SW: Close action - dismissing notification');
		return;
	}

	// Get the notification data
	const data = event.notification.data;
	console.log('📄 SW: Notification data:', data);

	// Determine the URL to open based on notification type
	let urlToOpen = '/dashboard';

	if (data.type === 'new_bid' && data.taskId) {
		urlToOpen = `/dashboard/task/${data.taskId}`;
	} else if (data.type === 'message' && data.conversationId) {
		urlToOpen = `/dashboard/messages/to/${data.conversationId}`;
	} else if (data.type === 'task_update' && data.taskId) {
		urlToOpen = `/dashboard/task/${data.taskId}`;
	} else if (data.url) {
		urlToOpen = data.url;
	}

	console.log('🌐 SW: Opening URL:', urlToOpen);

	// Open the app/specific page
	event.waitUntil(
		clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
			console.log('👥 SW: Found clients:', clientList.length);

			// Check if app is already open
			for (const client of clientList) {
				if (client.url.includes(self.location.origin) && 'focus' in client) {
					console.log('🔍 SW: Focusing existing client:', client.url);
					client.focus();
					// Use postMessage to navigate instead of client.navigate (which doesn't exist)
					client.postMessage({ type: 'NAVIGATE', url: urlToOpen });
					return;
				}
			}

			// Open new window if app is not open
			if (clients.openWindow) {
				console.log('🪟 SW: Opening new window');
				return clients.openWindow(urlToOpen);
			} else {
				console.error('❌ SW: Cannot open new window');
			}
		})
	);
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
	console.log('Notification closed: ', event);
	// You can track notification dismissals here if needed
}); 