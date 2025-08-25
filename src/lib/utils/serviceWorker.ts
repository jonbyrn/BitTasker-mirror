/**
 * Service Worker Utilities
 * 
 * This module provides utilities for interacting with the service worker
 * from the main application, including cache management, offline sync,
 * and service worker registration.
 */

// Service Worker Message Types
export const SW_MESSAGE_TYPES = {
	CACHE_API_RESPONSE: 'CACHE_API_RESPONSE',
	CLEAR_CACHE: 'CLEAR_CACHE',
	GET_CACHE_INFO: 'GET_CACHE_INFO',
	ADD_TO_SYNC_QUEUE: 'ADD_TO_SYNC_QUEUE'
} as const;

// Sync Queue Item Types
export const SYNC_ITEM_TYPES = {
	CREATE_TASK: 'CREATE_TASK',
	UPDATE_TASK: 'UPDATE_TASK',
	CREATE_BID: 'CREATE_BID',
	SEND_MESSAGE: 'SEND_MESSAGE',
	UPDATE_PROFILE: 'UPDATE_PROFILE'
} as const;

// Cache Names
export const CACHE_NAMES = {
	STATIC: 'bittasker-static',
	DYNAMIC: 'bittasker-dynamic',
	API: 'bittasker-api',
	IMAGES: 'bittasker-images'
} as const;

/**
 * Service Worker Manager Class
 */
export class ServiceWorkerManager {
	private registration: ServiceWorkerRegistration | null = null;
	private isSupported: boolean;

	constructor() {
		this.isSupported = 'serviceWorker' in navigator;
	}

	/**
	 * Register the service worker
	 */
	async register(): Promise<ServiceWorkerRegistration | null> {
		if (!this.isSupported) {
			console.warn('Service workers are not supported in this browser');
			return null;
		}

		try {
			this.registration = await navigator.serviceWorker.register('/service-worker.js', {
				scope: '/'
			});
			console.log('✅ Service Worker registered successfully');
			
			// Listen for updates
			this.setupUpdateListener();
			
			return this.registration;
		} catch (error) {
			console.error('❌ Service Worker registration failed:', error);
			return null;
		}
	}

	/**
	 * Setup listener for service worker updates
	 */
	private setupUpdateListener(): void {
		if (!this.registration) return;

		this.registration.addEventListener('updatefound', () => {
			console.log('🔄 Service Worker update found');
			
			const newWorker = this.registration!.installing;
			if (newWorker) {
				newWorker.addEventListener('statechange', () => {
					if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
						// Disabled automatic update notifications to prevent false positives
						console.log('Service worker update available (auto-update disabled)');
					}
				});
			}
		});
	}

	/**
	 * Show update notification to user
	 */
	private showUpdateNotification(): void {
		// Disabled for now to prevent false positives
		// You can implement a custom notification here
		console.log('Service worker update available (notification disabled)');
		// if (confirm('A new version of BitTasker is available. Would you like to update?')) {
		// 	this.updateServiceWorker();
		// }
	}

	/**
	 * Update the service worker
	 */
	async updateServiceWorker(): Promise<void> {
		if (!this.registration) return;

		try {
			await this.registration.update();
			window.location.reload();
		} catch (error) {
			console.error('❌ Failed to update service worker:', error);
		}
	}

	/**
	 * Send message to service worker
	 */
	private async sendMessage(type: string, data?: any): Promise<any> {
		// Wait for service worker to be ready
		if (!this.registration?.active) {
			// Wait for the service worker to be ready with timeout
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(() => {
					reject(new Error('Service worker activation timeout'));
				}, 10000); // 10 second timeout

				if (this.registration?.active) {
					clearTimeout(timeout);
					resolve();
				} else {
					const checkActive = () => {
						if (this.registration?.active) {
							clearTimeout(timeout);
							resolve();
						} else {
							setTimeout(checkActive, 100);
						}
					};
					checkActive();
				}
			});
		}

		return new Promise((resolve, reject) => {
			const messageChannel = new MessageChannel();
			
			messageChannel.port1.onmessage = (event) => {
				resolve(event.data);
			};

			messageChannel.port1.onmessageerror = () => {
				reject(new Error('Failed to receive message from service worker'));
			};

			this.registration!.active!.postMessage({ type, data }, [messageChannel.port2]);
		});
	}

	/**
	 * Cache an API response
	 */
	async cacheApiResponse(url: string, response: Response): Promise<void> {
		try {
			// Clone the response and extract the data to avoid cloning issues
			const clonedResponse = response.clone();
			const contentType = clonedResponse.headers.get('content-type') || '';
			
			let data;
			if (contentType.includes('application/json')) {
				data = await clonedResponse.json();
			} else if (contentType.includes('text/')) {
				data = await clonedResponse.text();
			} else {
				// For binary data, don't cache
				console.log('⚠️ Skipping cache for non-text response:', url);
				return;
			}
			
			const headers = Object.fromEntries(clonedResponse.headers.entries());
			
			await this.sendMessage(SW_MESSAGE_TYPES.CACHE_API_RESPONSE, { 
				url, 
				data,
				headers,
				status: clonedResponse.status,
				statusText: clonedResponse.statusText
			});
			console.log('✅ API response cached:', url);
		} catch (error) {
			console.error('❌ Failed to cache API response:', error);
		}
	}

	/**
	 * Clear cache
	 */
	async clearCache(cacheName?: string): Promise<void> {
		try {
			await this.sendMessage(SW_MESSAGE_TYPES.CLEAR_CACHE, { cacheName });
			console.log('✅ Cache cleared:', cacheName || 'all');
		} catch (error) {
			console.error('❌ Failed to clear cache:', error);
		}
	}

	/**
	 * Get cache information
	 */
	async getCacheInfo(): Promise<any> {
		try {
			return await this.sendMessage(SW_MESSAGE_TYPES.GET_CACHE_INFO);
		} catch (error) {
			console.error('❌ Failed to get cache info:', error);
			return null;
		}
	}

	/**
	 * Add item to sync queue
	 */
	async addToSyncQueue(type: string, data: any): Promise<void> {
		try {
			await this.sendMessage(SW_MESSAGE_TYPES.ADD_TO_SYNC_QUEUE, { type, data });
			console.log('✅ Added to sync queue:', type);
		} catch (error) {
			console.error('❌ Failed to add to sync queue:', error);
		}
	}

	/**
	 * Check if service worker is ready
	 */
	async isReady(): Promise<boolean> {
		if (!this.registration) {
			await this.register();
		}
		
		return !!this.registration?.active;
	}

	/**
	 * Get service worker registration
	 */
	getRegistration(): ServiceWorkerRegistration | null {
		return this.registration;
	}
}

/**
 * Offline Sync Manager
 */
export class OfflineSyncManager {
	private swManager: ServiceWorkerManager;

	constructor(swManager: ServiceWorkerManager) {
		this.swManager = swManager;
	}

	/**
	 * Queue task creation for offline sync
	 */
	async queueCreateTask(task: any): Promise<void> {
		await this.swManager.addToSyncQueue(SYNC_ITEM_TYPES.CREATE_TASK, { task });
	}

	/**
	 * Queue task update for offline sync
	 */
	async queueUpdateTask(taskId: string, updates: any): Promise<void> {
		await this.swManager.addToSyncQueue(SYNC_ITEM_TYPES.UPDATE_TASK, { taskId, updates });
	}

	/**
	 * Queue bid creation for offline sync
	 */
	async queueCreateBid(taskId: string, bid: any): Promise<void> {
		await this.swManager.addToSyncQueue(SYNC_ITEM_TYPES.CREATE_BID, { taskId, bid });
	}

	/**
	 * Queue message sending for offline sync
	 */
	async queueSendMessage(message: any): Promise<void> {
		await this.swManager.addToSyncQueue(SYNC_ITEM_TYPES.SEND_MESSAGE, { message });
	}

	/**
	 * Queue profile update for offline sync
	 */
	async queueUpdateProfile(updates: any): Promise<void> {
		await this.swManager.addToSyncQueue(SYNC_ITEM_TYPES.UPDATE_PROFILE, { updates });
	}
}

/**
 * Cache Manager
 */
export class CacheManager {
	private swManager: ServiceWorkerManager;

	constructor(swManager: ServiceWorkerManager) {
		this.swManager = swManager;
	}

	/**
	 * Preload important resources
	 */
	async preloadResources(urls: string[]): Promise<void> {
		for (const url of urls) {
			try {
				const response = await fetch(url);
				if (response.ok) {
					// Only cache API responses, not HTML pages
					const contentType = response.headers.get('content-type') || '';
					if (contentType.includes('application/json')) {
						await this.swManager.cacheApiResponse(url, response);
					} else {
						console.log('⚠️ Skipping preload for non-API response:', url);
					}
				}
			} catch (error) {
				console.warn('Failed to preload resource:', url, error);
			}
		}
	}

	/**
	 * Cache user profile data
	 */
	async cacheUserProfile(profile: any): Promise<void> {
		const response = new Response(JSON.stringify(profile), {
			headers: { 'Content-Type': 'application/json' }
		});
		await this.swManager.cacheApiResponse('/api/user/profile', response);
	}

	/**
	 * Cache tasks data
	 */
	async cacheTasks(tasks: any[]): Promise<void> {
		const response = new Response(JSON.stringify(tasks), {
			headers: { 'Content-Type': 'application/json' }
		});
		await this.swManager.cacheApiResponse('/api/tasks', response);
	}

	/**
	 * Cache notifications
	 */
	async cacheNotifications(notifications: any[]): Promise<void> {
		const response = new Response(JSON.stringify(notifications), {
			headers: { 'Content-Type': 'application/json' }
		});
		await this.swManager.cacheApiResponse('/api/notifications', response);
	}

	/**
	 * Get cache statistics
	 */
	async getCacheStats(): Promise<any> {
		const cacheInfo = await this.swManager.getCacheInfo();
		if (!cacheInfo) return null;

		const stats = {
			totalCaches: Object.keys(cacheInfo).length,
			totalEntries: 0,
			cacheDetails: cacheInfo
		};

		for (const cacheName in cacheInfo) {
			stats.totalEntries += cacheInfo[cacheName].size;
		}

		return stats;
	}
}

/**
 * Network Status Manager
 */
export class NetworkStatusManager {
	private isOnline: boolean = navigator.onLine;
	private listeners: Set<(online: boolean) => void> = new Set();

	constructor() {
		this.setupListeners();
	}

	/**
	 * Setup network status listeners
	 */
	private setupListeners(): void {
		window.addEventListener('online', () => {
			this.isOnline = true;
			this.notifyListeners(true);
		});

		window.addEventListener('offline', () => {
			this.isOnline = false;
			this.notifyListeners(false);
		});
	}

	/**
	 * Notify all listeners of network status change
	 */
	private notifyListeners(online: boolean): void {
		this.listeners.forEach(listener => listener(online));
	}

	/**
	 * Add network status listener
	 */
	addListener(listener: (online: boolean) => void): () => void {
		this.listeners.add(listener);
		
		// Return unsubscribe function
		return () => {
			this.listeners.delete(listener);
		};
	}

	/**
	 * Check if currently online
	 */
	isCurrentlyOnline(): boolean {
		return this.isOnline;
	}

	/**
	 * Wait for network connection
	 */
	async waitForConnection(): Promise<void> {
		if (this.isOnline) return;

		return new Promise((resolve) => {
			const unsubscribe = this.addListener((online) => {
				if (online) {
					unsubscribe();
					resolve();
				}
			});
		});
	}
}

/**
 * Main Service Worker Service
 */
export class ServiceWorkerService {
	private swManager: ServiceWorkerManager;
	private syncManager: OfflineSyncManager;
	private cacheManager: CacheManager;
	private networkManager: NetworkStatusManager;

	constructor() {
		this.swManager = new ServiceWorkerManager();
		this.syncManager = new OfflineSyncManager(this.swManager);
		this.cacheManager = new CacheManager(this.swManager);
		this.networkManager = new NetworkStatusManager();
	}

	/**
	 * Initialize the service worker service
	 */
	async initialize(): Promise<void> {
		await this.swManager.register();
		
		// Preload important resources
		await this.preloadImportantResources();
		
		console.log('✅ Service Worker Service initialized');
	}

	/**
	 * Preload important resources
	 */
	private async preloadImportantResources(): Promise<void> {
		// Only preload actual API endpoints, not navigation pages
		// Navigation pages are handled by the service worker's fetch event
		const importantUrls: string[] = [];

		await this.cacheManager.preloadResources(importantUrls);
	}

	/**
	 * Get managers
	 */
	get managers() {
		return {
			sw: this.swManager,
			sync: this.syncManager,
			cache: this.cacheManager,
			network: this.networkManager
		};
	}

	/**
	 * Check if service worker is ready
	 */
	async isReady(): Promise<boolean> {
		return await this.swManager.isReady();
	}

	/**
	 * Get offline sync manager
	 */
	get sync(): OfflineSyncManager {
		return this.syncManager;
	}

	/**
	 * Get cache manager
	 */
	get cache(): CacheManager {
		return this.cacheManager;
	}

	/**
	 * Get network status manager
	 */
	get network(): NetworkStatusManager {
		return this.networkManager;
	}

	/**
	 * Clear cache
	 */
	async clearCache(cacheName?: string): Promise<void> {
		return await this.swManager.clearCache(cacheName);
	}
}

// Export singleton instance
export const serviceWorkerService = new ServiceWorkerService();

// Export convenience functions
export const {
	register: registerServiceWorker,
	isReady: isServiceWorkerReady,
	cacheApiResponse,
	clearCache,
	getCacheInfo,
	addToSyncQueue,
	queueCreateTask,
	queueUpdateTask,
	queueCreateBid,
	queueSendMessage,
	queueUpdateProfile,
	preloadResources,
	cacheUserProfile,
	cacheTasks,
	cacheNotifications,
	getCacheStats,
	isOnline,
	waitForConnection
} = {
	register: () => serviceWorkerService.initialize(),
	isReady: () => serviceWorkerService.isReady(),
	cacheApiResponse: (url: string, response: Response) => serviceWorkerService.cache.cacheApiResponse(url, response),
	clearCache: (cacheName?: string) => serviceWorkerService.clearCache(cacheName),
	getCacheInfo: () => serviceWorkerService.cache.getCacheInfo(),
	addToSyncQueue: (type: string, data: any) => serviceWorkerService.sync.addToSyncQueue(type, data),
	queueCreateTask: (task: any) => serviceWorkerService.sync.queueCreateTask(task),
	queueUpdateTask: (taskId: string, updates: any) => serviceWorkerService.sync.queueUpdateTask(taskId, updates),
	queueCreateBid: (taskId: string, bid: any) => serviceWorkerService.sync.queueCreateBid(taskId, bid),
	queueSendMessage: (message: any) => serviceWorkerService.sync.queueSendMessage(message),
	queueUpdateProfile: (updates: any) => serviceWorkerService.sync.queueUpdateProfile(updates),
	preloadResources: (urls: string[]) => serviceWorkerService.cache.preloadResources(urls),
	cacheUserProfile: (profile: any) => serviceWorkerService.cache.cacheUserProfile(profile),
	cacheTasks: (tasks: any[]) => serviceWorkerService.cache.cacheTasks(tasks),
	cacheNotifications: (notifications: any[]) => serviceWorkerService.cache.cacheNotifications(notifications),
	getCacheStats: () => serviceWorkerService.cache.getCacheStats(),
	isOnline: () => serviceWorkerService.network.isCurrentlyOnline(),
	waitForConnection: () => serviceWorkerService.network.waitForConnection()
};
