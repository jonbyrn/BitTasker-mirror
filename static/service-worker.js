// Service Worker for BitTasker
// This file is served directly and doesn't use ES6 imports

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = `bittasker-cache-${CACHE_VERSION}`;
const STATIC_CACHE = `bittasker-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `bittasker-dynamic-${CACHE_VERSION}`;
const API_CACHE = `bittasker-api-${CACHE_VERSION}`;
const IMAGE_CACHE = `bittasker-images-${CACHE_VERSION}`;

// Files to cache immediately (static assets only)
const STATIC_FILES = [
	'/offline.html',
	'/manifest.json',
	'/favicon.ico'
];

// Navigation pages to cache separately
const NAVIGATION_PAGES = [
	'/dashboard',
	'/auth/login',
	'/auth/signup'
];

// API endpoints to cache
const API_ENDPOINTS = [
	'/api/tasks',
	'/api/user/profile',
	'/api/notifications',
	'/api/messages'
];

// Image patterns to cache
const IMAGE_PATTERNS = [
	/\.(png|jpg|jpeg|gif|webp|svg|ico)$/i,
	/\/images\//,
	/\/icons\//,
	/\/illustrations\//
];

// Background sync queue
const SYNC_QUEUE = 'bittasker-sync-queue';

// Cache limits and TTL
const CACHE_LIMITS = {
	MAX_SIZE: 50 * 1024 * 1024, // 50MB
	MAX_ENTRIES: 100,
	TTL: {
		STATIC: 30 * 24 * 60 * 60 * 1000, // 30 days (much longer for static assets)
		API: 60 * 60 * 1000, // 1 hour (longer for API responses)
		IMAGES: 30 * 24 * 60 * 60 * 1000, // 30 days
		NAVIGATION: 7 * 24 * 60 * 60 * 1000 // 7 days (longer for navigation)
	}
};

// Service Worker Installation
self.addEventListener('install', (event) => {
	console.log('🔧 Service Worker installing...');
	
	event.waitUntil(
		Promise.all([
			// Cache static files
			caches.open(STATIC_CACHE).then((cache) => {
				console.log('📦 Caching static files...');
				return cache.addAll(STATIC_FILES);
			}),
			// Cache navigation pages
			caches.open(CACHE_NAME).then((cache) => {
				console.log('🏠 Caching navigation pages...');
				return cache.addAll(NAVIGATION_PAGES);
			})
		]).then(() => {
			console.log('✅ Service Worker installed successfully');
			// Skip waiting to activate immediately
			return self.skipWaiting();
		})
	);
});

// Service Worker Activation
self.addEventListener('activate', (event) => {
	console.log('🚀 Service Worker activating...');
	
	event.waitUntil(
		Promise.all([
			// Clean up old caches
			caches.keys().then((cacheNames) => {
				return Promise.all(
					cacheNames
						.filter((name) => !name.includes(CACHE_VERSION))
						.map((name) => {
							console.log('🗑️ Deleting old cache:', name);
							return caches.delete(name);
						})
				);
			}),
			// Take control of all clients
			self.clients.claim()
		]).then(() => {
			console.log('✅ Service Worker activated successfully');
			
			// Defer cache cleanup to avoid blocking activation
			setTimeout(() => {
				cleanupExpiredCacheEntries().catch(error => {
					console.error('❌ Cache cleanup failed:', error);
				});
			}, 30000); // Wait 30 seconds before cleanup to ensure app is fully loaded
		})
	);
});

// Fetch Event Handler
self.addEventListener('fetch', (event) => {
	const { request } = event;
	const url = new URL(request.url);
	
	// Skip non-GET requests
	if (request.method !== 'GET') {
		return;
	}
	
	// Skip chrome-extension and other non-http requests
	if (!url.protocol.startsWith('http')) {
		return;
	}
	
	// Handle different types of requests
	if (isStaticAsset(url)) {
		event.respondWith(handleStaticAsset(request));
	} else if (isApiRequest(url)) {
		event.respondWith(handleApiRequest(request));
	} else if (isImageRequest(url)) {
		event.respondWith(handleImageRequest(request));
	} else if (isNavigationRequest(request)) {
		event.respondWith(handleNavigationRequest(request));
	} else {
		event.respondWith(handleDefaultRequest(request));
	}
});

// Background Sync
self.addEventListener('sync', (event) => {
	console.log('🔄 Background sync triggered:', event.tag);
	
	if (event.tag === SYNC_QUEUE) {
		event.waitUntil(syncOfflineData());
	}
});

// Push Event Handler (for non-Firebase push notifications)
// Note: Firebase push notifications are handled by firebase-messaging-sw.js
// This handler is for web push notifications from other sources
self.addEventListener('push', (event) => {
	console.log('📱 Push notification received (non-Firebase):', event);
	
	// Skip if this is a Firebase notification (handled by firebase-messaging-sw.js)
	if (event.data) {
		try {
			const data = event.data.json();
			// Check if this is a Firebase notification
			if (data.firebase || data.from === 'firebase') {
				console.log('📱 Skipping Firebase notification (handled by firebase-messaging-sw.js)');
				return;
			}
			
			const options = {
				body: data.body || 'You have a new notification',
				icon: '/favicon.ico',
				badge: '/favicon.ico',
				tag: 'bittasker-notification',
				data: data,
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
			
			event.waitUntil(
				self.registration.showNotification(data.title || 'BitTasker', options)
			);
		} catch (error) {
			console.error('❌ Error processing push notification:', error);
		}
	}
});

// Message Event Handler
self.addEventListener('message', (event) => {
	console.log('💬 Message received in service worker:', event.data);
	
	const { type, data } = event.data;
	
	switch (type) {
		case 'CACHE_API_RESPONSE':
			cacheApiResponse(data.url, data);
			break;
		case 'CLEAR_CACHE':
			clearCache(data.cacheName);
			break;
		case 'GET_CACHE_INFO':
			getCacheInfo().then((info) => {
				event.ports[0].postMessage(info);
			});
			break;
		case 'ADD_TO_SYNC_QUEUE':
			addToSyncQueue(data);
			break;
		default:
			// Handle Firebase config messages
			if (type === 'FIREBASE_CONFIG') {
				console.log('🔥 Firebase config received');
			}
	}
});

// Utility Functions

function isStaticAsset(url) {
	return STATIC_FILES.includes(url.pathname) || 
		   url.pathname.startsWith('/_app/') ||
		   url.pathname.startsWith('/build/') ||
		   url.pathname.endsWith('.js') ||
		   url.pathname.endsWith('.css') ||
		   url.pathname.endsWith('.woff2');
}

function isApiRequest(url) {
	return url.pathname.startsWith('/api/') ||
		   url.pathname.startsWith('/srv-api/') ||
		   url.hostname === 'api.bittasker.com';
}

function isImageRequest(url) {
	return IMAGE_PATTERNS.some(pattern => 
		typeof pattern === 'string' 
			? url.pathname.includes(pattern)
			: pattern.test(url.pathname)
	);
}

function isNavigationRequest(request) {
	return request.mode === 'navigate' || 
		   (request.headers.get('accept') && request.headers.get('accept').includes('text/html'));
}

// Cache Strategy Handlers

async function handleStaticAsset(request) {
	const cache = await caches.open(STATIC_CACHE);
	const cachedResponse = await cache.match(request);
	
	// For critical files, always serve from cache if available
	const url = new URL(request.url);
	const isCriticalFile = ['/', '/offline.html', '/manifest.json', '/favicon.ico'].includes(url.pathname);
	
	if (cachedResponse && (isCriticalFile || !(await isCacheExpired(STATIC_CACHE, request.url)))) {
		return cachedResponse;
	}
	
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const responseWithTimestamp = await addCacheTimestamp(networkResponse, STATIC_CACHE);
			await cache.put(request, responseWithTimestamp.clone());
			await enforceCacheLimits(STATIC_CACHE);
			return responseWithTimestamp;
		}
		return networkResponse;
	} catch (error) {
		console.error('❌ Failed to fetch static asset:', error);
		throw error;
	}
}

async function handleApiRequest(request) {
	const cache = await caches.open(API_CACHE);
	
	try {
		// Try network first
		const networkResponse = await fetch(request);
		
		if (networkResponse.ok) {
			// Cache successful responses with timestamp
			const responseWithTimestamp = await addCacheTimestamp(networkResponse, API_CACHE);
			await cache.put(request, responseWithTimestamp.clone());
			await enforceCacheLimits(API_CACHE);
			return responseWithTimestamp;
		}
		
		return networkResponse;
	} catch (error) {
		console.log('🌐 Network failed, trying cache for API request');
		
		// Fallback to cache (check if not expired)
		const cachedResponse = await cache.match(request);
		if (cachedResponse && !(await isCacheExpired(API_CACHE, request.url))) {
			return cachedResponse;
		}
		
		// Return offline response
		return new Response(
			JSON.stringify({ 
				error: 'You are offline. Please check your connection.',
				offline: true 
			}),
			{
				status: 503,
				statusText: 'Service Unavailable',
				headers: { 'Content-Type': 'application/json' }
			}
		);
	}
}

async function handleImageRequest(request) {
	const cache = await caches.open(IMAGE_CACHE);
	const cachedResponse = await cache.match(request);
	
	// Check if cache is expired
	if (cachedResponse && !(await isCacheExpired(IMAGE_CACHE, request.url))) {
		return cachedResponse;
	}
	
	try {
		const networkResponse = await fetch(request);
		if (networkResponse.ok) {
			const responseWithTimestamp = await addCacheTimestamp(networkResponse, IMAGE_CACHE);
			await cache.put(request, responseWithTimestamp.clone());
			await enforceCacheLimits(IMAGE_CACHE);
			return responseWithTimestamp;
		}
		return networkResponse;
	} catch (error) {
		console.error('❌ Failed to fetch image:', error);
		// Return a placeholder image or throw error
		throw error;
	}
}

async function handleNavigationRequest(request) {
	const cache = await caches.open(CACHE_NAME);
	
	try {
		// Try network first for navigation
		const networkResponse = await fetch(request);
		
		if (networkResponse.ok) {
			const responseWithTimestamp = await addCacheTimestamp(networkResponse, CACHE_NAME);
			await cache.put(request, responseWithTimestamp.clone());
			await enforceCacheLimits(CACHE_NAME);
			return responseWithTimestamp;
		}
		
		return networkResponse;
	} catch (error) {
		console.log('🌐 Network failed, trying cache for navigation');
		
		// For navigation pages, always serve from cache if available (don't check expiration)
		const cachedResponse = await cache.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}
		
		// Serve offline page
		const offlineResponse = await cache.match('/offline.html');
		if (offlineResponse) {
			return offlineResponse;
		}
		
		// Fallback to a simple offline message
		return new Response(
			`
			<!DOCTYPE html>
			<html>
			<head>
				<title>BitTasker - Offline</title>
				<style>
					body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
					.offline-icon { font-size: 64px; margin-bottom: 20px; }
				</style>
			</head>
			<body>
				<div class="offline-icon">📱</div>
				<h1>You're Offline</h1>
				<p>Please check your internet connection and try again.</p>
				<button onclick="window.location.reload()">Retry</button>
			</body>
			</html>
			`,
			{
				status: 200,
				headers: { 'Content-Type': 'text/html' }
			}
		);
	}
}

async function handleDefaultRequest(request) {
	// Default to network first with cache fallback
	const cache = await caches.open(DYNAMIC_CACHE);
	
	try {
		const networkResponse = await fetch(request);
		
		if (networkResponse.ok) {
			cache.put(request, networkResponse.clone());
		}
		
		return networkResponse;
	} catch (error) {
		const cachedResponse = await cache.match(request);
		if (cachedResponse) {
			return cachedResponse;
		}
		
		throw error;
	}
}

// Cache Management Functions

async function cacheApiResponse(url, responseData) {
	const cache = await caches.open(API_CACHE);
	
	// Create a new Response from the data
	let responseBody;
	const contentType = responseData.headers['content-type'] || '';
	
	if (contentType.includes('application/json')) {
		responseBody = JSON.stringify(responseData.data);
	} else if (contentType.includes('text/')) {
		responseBody = responseData.data;
	} else {
		console.log('⚠️ Skipping cache for unsupported content type:', contentType);
		return;
	}
	
	const response = new Response(responseBody, {
		status: responseData.status,
		statusText: responseData.statusText,
		headers: responseData.headers
	});
	
	// Add timestamp and enforce limits
	const responseWithTimestamp = await addCacheTimestamp(response, API_CACHE);
	await cache.put(url, responseWithTimestamp);
	await enforceCacheLimits(API_CACHE);
}

async function clearCache(cacheName) {
	if (cacheName) {
		await caches.delete(cacheName);
	} else {
		const cacheNames = await caches.keys();
		await Promise.all(cacheNames.map(name => caches.delete(name)));
	}
}

async function getCacheInfo() {
	const cacheNames = await caches.keys();
	const cacheInfo = {};
	
	for (const name of cacheNames) {
		const cache = await caches.open(name);
		const keys = await cache.keys();
		cacheInfo[name] = {
			size: keys.length,
			keys: keys.map(req => req.url)
		};
	}
	
	return cacheInfo;
}

// Retry Logic Functions

async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await fn();
		} catch (error) {
			console.log(`🔄 Retry attempt ${attempt + 1}/${maxRetries} failed:`, error);
			
			if (attempt === maxRetries - 1) {
				throw error; // Last attempt failed
			}
			
			// Exponential backoff with jitter
			const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
			console.log(`⏳ Waiting ${Math.round(delay)}ms before retry...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}
}

// Background Sync Functions

async function addToSyncQueue(data) {
	const registration = await self.registration;
	
	if ('sync' in registration) {
		await registration.sync.register(SYNC_QUEUE);
		
		// Store data in IndexedDB for sync
		const db = await openSyncDatabase();
		const tx = db.transaction(['syncQueue'], 'readwrite');
		const store = tx.objectStore('syncQueue');
		await store.add({
			id: Date.now(),
			timestamp: new Date().toISOString(),
			data: data
		});
	}
}

async function syncOfflineData() {
	console.log('🔄 Syncing offline data...');
	
	try {
		const db = await openSyncDatabase();
		const tx = db.transaction(['syncQueue'], 'readonly');
		const store = tx.objectStore('syncQueue');
		const request = store.getAll();
		const items = await new Promise((resolve, reject) => {
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
		});
		
		console.log(`📦 Processing ${items.length} sync items...`);
		
		for (const item of items) {
			try {
				// Process each queued item with retry logic
				await retryWithBackoff(async () => {
					await processSyncItem(item);
				}, 3, 2000); // 3 retries, 2 second base delay
				
				// Remove from queue after successful sync
				const deleteTx = db.transaction(['syncQueue'], 'readwrite');
				const deleteStore = deleteTx.objectStore('syncQueue');
				await deleteStore.delete(item.id);
				
				console.log(`✅ Successfully synced item ${item.id}`);
			} catch (error) {
				console.error(`❌ Failed to sync item ${item.id} after retries:`, error);
				// Keep item in queue for next sync attempt
			}
		}
		
		console.log('✅ Background sync completed');
	} catch (error) {
		console.error('❌ Background sync failed:', error);
	}
}

async function processSyncItem(item) {
	// Process different types of sync items
	switch (item.data.type) {
		case 'CREATE_TASK':
			await syncCreateTask(item.data);
			break;
		case 'UPDATE_TASK':
			await syncUpdateTask(item.data);
			break;
		case 'CREATE_BID':
			await syncCreateBid(item.data);
			break;
		case 'SEND_MESSAGE':
			await syncSendMessage(item.data);
			break;
		default:
			console.log('Unknown sync item type:', item.data.type);
	}
}

// Cache Management Functions

async function enforceCacheLimits(cacheName) {
	const cache = await caches.open(cacheName);
	const keys = await cache.keys();
	
	if (keys.length > CACHE_LIMITS.MAX_ENTRIES) {
		console.log(`🗑️ Enforcing cache limits for ${cacheName}: ${keys.length} > ${CACHE_LIMITS.MAX_ENTRIES}`);
		
		// Remove oldest entries (first in the list)
		const toDelete = keys.slice(0, keys.length - CACHE_LIMITS.MAX_ENTRIES);
		await Promise.all(toDelete.map(key => {
			console.log(`🗑️ Removing old cache entry: ${key.url}`);
			return cache.delete(key);
		}));
	}
}

async function isCacheExpired(cacheName, url) {
	const cache = await caches.open(cacheName);
	const response = await cache.match(url);
	
	if (!response) return true;
	
	const cacheTime = response.headers.get('sw-cache-time');
	if (!cacheTime) {
		// If no timestamp, don't expire it immediately - give it a grace period
		// This prevents removing files that were cached before TTL was implemented
		return false;
	}
	
	const age = Date.now() - parseInt(cacheTime);
	
	// Determine TTL based on cache type
	let ttl;
	if (cacheName.includes('static')) {
		ttl = CACHE_LIMITS.TTL.STATIC;
	} else if (cacheName.includes('api')) {
		ttl = CACHE_LIMITS.TTL.API;
	} else if (cacheName.includes('images')) {
		ttl = CACHE_LIMITS.TTL.IMAGES;
	} else {
		ttl = CACHE_LIMITS.TTL.NAVIGATION;
	}
	
	return age > ttl;
}

async function addCacheTimestamp(response, cacheName) {
	// Clone the response body first to avoid "body locked" errors
	const body = await response.clone().arrayBuffer();
	const headers = new Headers(response.headers);
	headers.set('sw-cache-time', Date.now().toString());
	headers.set('sw-cache-name', cacheName);
	
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers: headers
	});
}

async function cleanupExpiredCacheEntries() {
	console.log('🧹 Cleaning up expired cache entries...');
	
	// Only clean up API cache for now - it's the safest
	const cacheNames = [API_CACHE];
	
	for (const cacheName of cacheNames) {
		try {
			const cache = await caches.open(cacheName);
			const keys = await cache.keys();
			
			for (const request of keys) {
				const url = new URL(request.url);
				const pathname = url.pathname;
				
				// Skip development and critical API endpoints
				if (pathname.includes('/node_modules/') ||
					pathname.includes('/.houdini/') ||
					pathname.includes('/@fs/') ||
					pathname.includes('?t=') ||
					pathname.includes('?v=') ||
					pathname.includes('/api/auth/')) {
					continue;
				}
				
				// Only clean up API entries that are actually expired
				if (await isCacheExpired(cacheName, request.url)) {
					console.log(`🗑️ Removing expired API cache entry: ${request.url}`);
					await cache.delete(request);
				}
			}
		} catch (error) {
			console.error(`❌ Error cleaning up cache ${cacheName}:`, error);
		}
	}
	
	console.log('✅ Cache cleanup completed (API only)');
}

// IndexedDB for sync queue
async function openSyncDatabase() {
	return new Promise((resolve, reject) => {
		const request = indexedDB.open('BitTaskerSync', 1);
		
		request.onerror = () => reject(request.error);
		request.onsuccess = () => resolve(request.result);
		
		request.onupgradeneeded = (event) => {
			const db = event.target.result;
			
			if (!db.objectStoreNames.contains('syncQueue')) {
				const store = db.createObjectStore('syncQueue', { keyPath: 'id' });
				store.createIndex('timestamp', 'timestamp', { unique: false });
			}
		};
	});
}

// Sync handlers for different data types
async function syncCreateTask(data) {
	const response = await fetch('/api/tasks', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data.task)
	});
	
	if (!response.ok) {
		throw new Error('Failed to sync task creation');
	}
}

async function syncUpdateTask(data) {
	const response = await fetch(`/api/tasks/${data.taskId}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data.updates)
	});
	
	if (!response.ok) {
		throw new Error('Failed to sync task update');
	}
}

async function syncCreateBid(data) {
	const response = await fetch(`/api/tasks/${data.taskId}/bids`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data.bid)
	});
	
	if (!response.ok) {
		throw new Error('Failed to sync bid creation');
	}
}

async function syncSendMessage(data) {
	const response = await fetch(`/api/messages`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data.message)
	});
	
	if (!response.ok) {
		throw new Error('Failed to sync message');
	}
}
