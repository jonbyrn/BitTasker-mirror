/**
 * Review System Store
 * 
 * Manages state for review system including Merkle tree update status
 */

import { writable } from 'svelte/store';

export interface TreeUpdateStatus {
	isUpdating: boolean;
	lastUpdateTime: number | null;
	lastUpdateVersion: string | null;
	lastUpdateRoot: string | null;
	error: string | null;
	updateCount: number;
	pendingUpdates: number;
}

export interface TreeUpdateQueueItem {
	id: string;
	context: string;
	timestamp: number;
	retryCount: number;
	lastError?: string;
}

const initialStatus: TreeUpdateStatus = {
	isUpdating: false,
	lastUpdateTime: null,
	lastUpdateVersion: null,
	lastUpdateRoot: null,
	error: null,
	updateCount: 0,
	pendingUpdates: 0
};

export const treeUpdateStatus = writable<TreeUpdateStatus>(initialStatus);
export const treeUpdateQueue = writable<TreeUpdateQueueItem[]>([]);

/**
 * Update tree update status
 */
export function updateTreeStatus(updates: Partial<TreeUpdateStatus>): void {
	treeUpdateStatus.update(status => ({
		...status,
		...updates
	}));
}

/**
 * Mark tree update as started
 */
export function startTreeUpdate(): void {
	updateTreeStatus({
		isUpdating: true,
		error: null
	});
}

/**
 * Mark tree update as completed
 */
export function completeTreeUpdate(version: string, root: string): void {
	treeUpdateStatus.update(status => ({
		...status,
		isUpdating: false,
		lastUpdateTime: Date.now(),
		lastUpdateVersion: version,
		lastUpdateRoot: root,
		error: null,
		updateCount: status.updateCount + 1,
		pendingUpdates: Math.max(0, status.pendingUpdates - 1)
	}));
}

/**
 * Mark tree update as failed
 */
export function failTreeUpdate(error: string): void {
	treeUpdateStatus.update(status => ({
		...status,
		isUpdating: false,
		error,
		pendingUpdates: Math.max(0, status.pendingUpdates - 1)
	}));
}

/**
 * Add item to update queue
 */
export function queueTreeUpdate(context: string): string {
	const id = `update-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	const item: TreeUpdateQueueItem = {
		id,
		context,
		timestamp: Date.now(),
		retryCount: 0
	};
	
	treeUpdateQueue.update(queue => [...queue, item]);
	treeUpdateStatus.update(status => ({
		...status,
		pendingUpdates: status.pendingUpdates + 1
	}));
	
	return id;
}

/**
 * Remove item from queue
 */
export function dequeueTreeUpdate(id: string): void {
	treeUpdateQueue.update(queue => queue.filter(item => item.id !== id));
}

/**
 * Update queue item retry count
 */
export function updateQueueItem(id: string, updates: Partial<TreeUpdateQueueItem>): void {
	treeUpdateQueue.update(queue =>
		queue.map(item =>
			item.id === id ? { ...item, ...updates } : item
		)
	);
}

/**
 * Get oldest pending update
 */
export function getOldestPendingUpdate(): TreeUpdateQueueItem | null {
	let oldest: TreeUpdateQueueItem | null = null;
	treeUpdateQueue.subscribe(queue => {
		if (queue.length > 0) {
			oldest = queue.reduce((prev, current) =>
				current.timestamp < prev.timestamp ? current : prev
			);
		}
	})();
	return oldest;
}

/**
 * Reset tree update status
 */
export function resetTreeStatus(): void {
	treeUpdateStatus.set(initialStatus);
	treeUpdateQueue.set([]);
}

