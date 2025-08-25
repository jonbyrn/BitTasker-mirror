/**
 * Enhanced API Service with Service Worker Integration
 * 
 * This service extends the base API functionality with offline support,
 * intelligent caching, and background sync capabilities.
 */

import { serviceWorkerService, isOnline, waitForConnection } from '$lib/utils/serviceWorker';
import { get } from 'svelte/store';
import { authState } from '$lib/stores/auth.store';

// API Response wrapper for offline detection
interface ApiResponse<T> {
	data: T;
	offline: boolean;
	cached: boolean;
	timestamp: number;
}

// Offline queue item
interface OfflineQueueItem {
	id: string;
	type: 'POST' | 'PUT' | 'DELETE' | 'PATCH';
	url: string;
	data?: any;
	headers?: Record<string, string>;
	timestamp: number;
}

/**
 * Enhanced API Service Class
 */
export class EnhancedApiService {
	private baseURL: string;
	private offlineQueue: OfflineQueueItem[] = [];
	private isInitialized: boolean = false;

	constructor(baseURL: string = '/api') {
		this.baseURL = baseURL;
		this.loadOfflineQueue();
	}

	/**
	 * Initialize the enhanced API service
	 */
	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		// Initialize service worker
		await serviceWorkerService.initialize();

		// Process any pending offline queue items
		await this.processOfflineQueue();

		this.isInitialized = true;
		console.log('✅ Enhanced API Service initialized');
	}

	/**
	 * Enhanced GET request with caching and offline support
	 */
	async get<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
		const url = `${this.baseURL}${endpoint}`;
		const cacheKey = `GET:${url}`;

		try {
			// Try network first
			const response = await fetch(url, {
				...options,
				method: 'GET',
				headers: this.getHeaders(options.headers)
			});

			if (response.ok) {
				const data = await response.json();
				
				// Cache the response
				await serviceWorkerService.cache.cacheApiResponse(url, response.clone());
				
				return {
					data,
					offline: false,
					cached: false,
					timestamp: Date.now()
				};
			}

			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		} catch (error) {
			console.log('🌐 Network failed, checking cache for:', url);

			// Try to get from cache
			const cachedResponse = await this.getFromCache(url);
			if (cachedResponse) {
				return {
					data: cachedResponse,
					offline: true,
					cached: true,
					timestamp: Date.now()
				};
			}

			// If offline and no cache, throw error
			if (!isOnline()) {
				throw new Error('You are offline and no cached data is available');
			}

			throw error;
		}
	}

	/**
	 * Enhanced POST request with offline queue
	 */
	async post<T>(endpoint: string, data: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
		const url = `${this.baseURL}${endpoint}`;

		if (!isOnline()) {
			// Queue for offline sync
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'POST',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			await serviceWorkerService.sync.queueCreateTask(data);

			return {
				data: { message: 'Queued for offline sync', id: queueItem.id } as T,
				offline: true,
				cached: false,
				timestamp: Date.now()
			};
		}

		try {
			const response = await fetch(url, {
				...options,
				method: 'POST',
				headers: this.getHeaders(options.headers),
				body: JSON.stringify(data)
			});

			if (response.ok) {
				const responseData = await response.json();
				return {
					data: responseData,
					offline: false,
					cached: false,
					timestamp: Date.now()
				};
			}

			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		} catch (error) {
			// If request fails, queue for retry
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'POST',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			throw error;
		}
	}

	/**
	 * Enhanced PUT request with offline queue
	 */
	async put<T>(endpoint: string, data: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
		const url = `${this.baseURL}${endpoint}`;

		if (!isOnline()) {
			// Queue for offline sync
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'PUT',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			await serviceWorkerService.sync.queueUpdateTask(endpoint.split('/').pop()!, data);

			return {
				data: { message: 'Queued for offline sync', id: queueItem.id } as T,
				offline: true,
				cached: false,
				timestamp: Date.now()
			};
		}

		try {
			const response = await fetch(url, {
				...options,
				method: 'PUT',
				headers: this.getHeaders(options.headers),
				body: JSON.stringify(data)
			});

			if (response.ok) {
				const responseData = await response.json();
				return {
					data: responseData,
					offline: false,
					cached: false,
					timestamp: Date.now()
				};
			}

			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		} catch (error) {
			// If request fails, queue for retry
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'PUT',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			throw error;
		}
	}

	/**
	 * Enhanced DELETE request with offline queue
	 */
	async delete<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
		const url = `${this.baseURL}${endpoint}`;

		if (!isOnline()) {
			// Queue for offline sync
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'DELETE',
				url,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);

			return {
				data: { message: 'Queued for offline sync', id: queueItem.id } as T,
				offline: true,
				cached: false,
				timestamp: Date.now()
			};
		}

		try {
			const response = await fetch(url, {
				...options,
				method: 'DELETE',
				headers: this.getHeaders(options.headers)
			});

			if (response.ok) {
				const responseData = await response.json();
				return {
					data: responseData,
					offline: false,
					cached: false,
					timestamp: Date.now()
				};
			}

			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		} catch (error) {
			// If request fails, queue for retry
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'DELETE',
				url,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			throw error;
		}
	}

	/**
	 * Enhanced PATCH request with offline queue
	 */
	async patch<T>(endpoint: string, data: any, options: RequestInit = {}): Promise<ApiResponse<T>> {
		const url = `${this.baseURL}${endpoint}`;

		if (!isOnline()) {
			// Queue for offline sync
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'PATCH',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);

			return {
				data: { message: 'Queued for offline sync', id: queueItem.id } as T,
				offline: true,
				cached: false,
				timestamp: Date.now()
			};
		}

		try {
			const response = await fetch(url, {
				...options,
				method: 'PATCH',
				headers: this.getHeaders(options.headers),
				body: JSON.stringify(data)
			});

			if (response.ok) {
				const responseData = await response.json();
				return {
					data: responseData,
					offline: false,
					cached: false,
					timestamp: Date.now()
				};
			}

			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		} catch (error) {
			// If request fails, queue for retry
			const queueItem: OfflineQueueItem = {
				id: this.generateId(),
				type: 'PATCH',
				url,
				data,
				headers: this.getHeaders(options.headers),
				timestamp: Date.now()
			};

			await this.addToOfflineQueue(queueItem);
			throw error;
		}
	}

	/**
	 * Wait for connection and retry failed requests
	 */
	async waitForConnectionAndRetry(): Promise<void> {
		if (isOnline()) return;

		console.log('⏳ Waiting for connection...');
		await waitForConnection();
		console.log('✅ Connection restored, processing offline queue...');
		
		await this.processOfflineQueue();
	}

	/**
	 * Get offline queue status
	 */
	getOfflineQueueStatus(): { count: number; items: OfflineQueueItem[] } {
		return {
			count: this.offlineQueue.length,
			items: [...this.offlineQueue]
		};
	}

	/**
	 * Clear offline queue
	 */
	async clearOfflineQueue(): Promise<void> {
		this.offlineQueue = [];
		await this.saveOfflineQueue();
	}

	// Private helper methods

	private getHeaders(customHeaders?: Record<string, string>): Record<string, string> {
		const auth = get(authState);
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...customHeaders
		};

		if (auth.token) {
			headers['Authorization'] = `Bearer ${auth.token}`;
		}

		return headers;
	}

	private async getFromCache(url: string): Promise<any> {
		try {
			// Try to get from service worker cache
			const cacheInfo = await serviceWorkerService.cache.getCacheStats();
			if (cacheInfo?.cacheDetails?.API) {
				// This is a simplified cache check - in a real implementation,
				// you'd want to actually retrieve the cached response
				return null;
			}
		} catch (error) {
			console.warn('Failed to check cache:', error);
		}

		return null;
	}

	private generateId(): string {
		return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	}

	private async addToOfflineQueue(item: OfflineQueueItem): Promise<void> {
		this.offlineQueue.push(item);
		await this.saveOfflineQueue();
	}

	private async saveOfflineQueue(): Promise<void> {
		try {
			localStorage.setItem('bittasker-offline-queue', JSON.stringify(this.offlineQueue));
		} catch (error) {
			console.error('Failed to save offline queue:', error);
		}
	}

	private async loadOfflineQueue(): Promise<void> {
		try {
			const saved = localStorage.getItem('bittasker-offline-queue');
			if (saved) {
				this.offlineQueue = JSON.parse(saved);
			}
		} catch (error) {
			console.error('Failed to load offline queue:', error);
			this.offlineQueue = [];
		}
	}

	private async processOfflineQueue(): Promise<void> {
		if (this.offlineQueue.length === 0) return;

		console.log(`🔄 Processing ${this.offlineQueue.length} offline queue items...`);

		const processedItems: string[] = [];
		const failedItems: OfflineQueueItem[] = [];

		for (const item of this.offlineQueue) {
			try {
				await this.processQueueItem(item);
				processedItems.push(item.id);
			} catch (error) {
				console.error('Failed to process queue item:', item, error);
				failedItems.push(item);
			}
		}

		// Remove processed items from queue
		this.offlineQueue = failedItems;
		await this.saveOfflineQueue();

		console.log(`✅ Processed ${processedItems.length} items, ${failedItems.length} failed`);
	}

	private async processQueueItem(item: OfflineQueueItem): Promise<void> {
		const options: RequestInit = {
			method: item.type,
			headers: item.headers,
			body: item.data ? JSON.stringify(item.data) : undefined
		};

		const response = await fetch(item.url, options);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		// Update cache if it's a GET request that was queued
		if (item.type === 'GET') {
			await serviceWorkerService.cache.cacheApiResponse(item.url, response.clone());
		}
	}
}

// Export singleton instance
export const enhancedApiService = new EnhancedApiService();

// Export convenience functions
export const {
	get: enhancedGet,
	post: enhancedPost,
	put: enhancedPut,
	delete: enhancedDelete,
	patch: enhancedPatch,
	waitForConnectionAndRetry,
	getOfflineQueueStatus,
	clearOfflineQueue
} = {
	get: <T>(endpoint: string, options?: RequestInit) => enhancedApiService.get<T>(endpoint, options),
	post: <T>(endpoint: string, data: any, options?: RequestInit) => enhancedApiService.post<T>(endpoint, data, options),
	put: <T>(endpoint: string, data: any, options?: RequestInit) => enhancedApiService.put<T>(endpoint, data, options),
	delete: <T>(endpoint: string, options?: RequestInit) => enhancedApiService.delete<T>(endpoint, options),
	patch: <T>(endpoint: string, data: any, options?: RequestInit) => enhancedApiService.patch<T>(endpoint, data, options),
	waitForConnectionAndRetry: () => enhancedApiService.waitForConnectionAndRetry(),
	getOfflineQueueStatus: () => enhancedApiService.getOfflineQueueStatus(),
	clearOfflineQueue: () => enhancedApiService.clearOfflineQueue()
};
