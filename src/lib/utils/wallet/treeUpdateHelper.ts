/**
 * Tree update helper — no-op (Merkle/ZKP removed).
 * Kept for API compatibility; tree updates are not performed.
 */

import {
	treeUpdateStatus,
	startTreeUpdate,
	completeTreeUpdate,
	failTreeUpdate,
	queueTreeUpdate,
	dequeueTreeUpdate,
	updateQueueItem,
	getOldestPendingUpdate
} from '$lib/stores/review.store';

export async function triggerTreeUpdate(_context: string = 'unknown'): Promise<void> {
	const queueId = queueTreeUpdate(_context);
	startTreeUpdate();
	completeTreeUpdate('none', '');
	dequeueTreeUpdate(queueId);
}

export async function retryFailedTreeUpdates(): Promise<void> {
	const pending = getOldestPendingUpdate();
	if (!pending) return;
	updateQueueItem(pending.id, { timestamp: Date.now(), retryCount: 0, lastError: undefined });
	await triggerTreeUpdate(pending.context);
}

export async function manualTreeUpdate(): Promise<{ success: boolean; error?: string }> {
	startTreeUpdate();
	completeTreeUpdate('none', '');
	return { success: true };
}

export function shouldUpdateTree(_escrowStatus: number): boolean {
	return false;
}

export function getTreeUpdateStatus(): {
	isUpdating: boolean;
	lastUpdateTime: number | null;
	hasError: boolean;
	pendingCount: number;
} {
	let status: { isUpdating: boolean; lastUpdateTime: number | null; error: string | null; pendingUpdates: number } = {
		isUpdating: false,
		lastUpdateTime: null,
		error: null,
		pendingUpdates: 0
	};
	treeUpdateStatus.subscribe((s) => {
		status = {
			isUpdating: s.isUpdating,
			lastUpdateTime: s.lastUpdateTime,
			error: s.error,
			pendingUpdates: s.pendingUpdates
		};
	})();
	return {
		isUpdating: status.isUpdating,
		lastUpdateTime: status.lastUpdateTime,
		hasError: status.error !== null,
		pendingCount: status.pendingUpdates
	};
}
