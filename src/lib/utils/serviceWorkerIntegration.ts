/**
 * Service Worker Integration Utility
 * 
 * This module provides a simple way to integrate service worker functionality
 * into the main application with minimal setup.
 */

import { serviceWorkerService } from './serviceWorker';
import { enhancedApiService } from '$lib/api/services/enhanced-api.service';

/**
 * Initialize service worker functionality
 * Call this in your main layout or app initialization
 */
export async function initializeServiceWorker(): Promise<void> {
	try {
		console.log('🚀 Initializing service worker functionality...');
		
		// Initialize service worker service
		await serviceWorkerService.initialize();
		
		// Initialize enhanced API service
		await enhancedApiService.initialize();
		
		console.log('✅ Service worker functionality initialized successfully');
	} catch (error) {
		console.error('❌ Failed to initialize service worker functionality:', error);
	}
}

/**
 * Setup network status monitoring
 * This will automatically handle offline/online transitions
 */
export function setupNetworkMonitoring(): () => void {
	const unsubscribe = serviceWorkerService.network.addListener((online) => {
		if (online) {
			console.log('🌐 Connection restored - processing offline queue...');
			enhancedApiService.waitForConnectionAndRetry();
		} else {
			console.log('📱 Connection lost - entering offline mode');
		}
	});
	
	return unsubscribe;
}

/**
 * Get service worker status
 */
export async function getServiceWorkerStatus(): Promise<{
	isReady: boolean;
	isOnline: boolean;
	syncQueueCount: number;
	cacheStats: any;
}> {
	const isReady = await serviceWorkerService.isReady();
	const isOnline = serviceWorkerService.network.isCurrentlyOnline();
	const syncQueueStatus = enhancedApiService.getOfflineQueueStatus();
	const cacheStats = await serviceWorkerService.cache.getCacheStats();
	
	return {
		isReady,
		isOnline,
		syncQueueCount: syncQueueStatus.count,
		cacheStats
	};
}

/**
 * Quick setup function for SvelteKit apps
 * Use this in your +layout.ts or +page.ts
 */
export async function setupServiceWorker(): Promise<void> {
	await initializeServiceWorker();
	setupNetworkMonitoring();
}

// Export convenience functions
export const {
	initialize: initializeServiceWorkerFunction,
	setup: setupServiceWorkerFunction,
	getStatus: getServiceWorkerStatusFunction
} = {
	initialize: initializeServiceWorker,
	setup: setupServiceWorker,
	getStatus: getServiceWorkerStatus
};
