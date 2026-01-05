/**
 * Tree Update Monitor Service
 * 
 * Monitors and automatically retries failed tree updates
 */

import { retryFailedTreeUpdates, getTreeUpdateStatus } from '$lib/utils/wallet/treeUpdateHelper';
import { treeUpdateQueue } from '$lib/stores/review.store';
import { get } from 'svelte/store';

let monitorInterval: ReturnType<typeof setInterval> | null = null;
const MONITOR_INTERVAL = 60000; // Check every minute
const MAX_QUEUE_SIZE = 10; // Prevent queue from growing too large

/**
 * Start monitoring tree update queue
 */
export function startTreeUpdateMonitor(): void {
	if (monitorInterval) {
		return; // Already monitoring
	}
	
	console.log('[Tree Monitor] Starting tree update monitor');
	
	monitorInterval = setInterval(async () => {
		try {
			const queue = get(treeUpdateQueue);
			
			// Prevent queue from growing too large
			if (queue.length > MAX_QUEUE_SIZE) {
				console.warn(`[Tree Monitor] Queue size (${queue.length}) exceeds maximum (${MAX_QUEUE_SIZE}), clearing old items`);
				// Keep only the most recent items
				const sorted = queue.sort((a, b) => b.timestamp - a.timestamp);
				treeUpdateQueue.set(sorted.slice(0, MAX_QUEUE_SIZE));
				return;
			}
			
			// Retry failed updates
			if (queue.length > 0) {
				const status = getTreeUpdateStatus();
				
				// Only retry if not currently updating
				if (!status.isUpdating) {
					await retryFailedTreeUpdates();
				}
			}
		} catch (error) {
			console.error('[Tree Monitor] Error in monitor loop:', error);
		}
	}, MONITOR_INTERVAL);
}

/**
 * Stop monitoring tree update queue
 */
export function stopTreeUpdateMonitor(): void {
	if (monitorInterval) {
		clearInterval(monitorInterval);
		monitorInterval = null;
		console.log('[Tree Monitor] Stopped tree update monitor');
	}
}

/**
 * Check if monitor is running
 */
export function isMonitorRunning(): boolean {
	return monitorInterval !== null;
}

