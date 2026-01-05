/**
 * Merkle Tree Update Helper
 * 
 * Utility functions for automatically updating Merkle tree after escrow events
 * Includes retry logic, error handling, and status tracking
 */

import {
	treeUpdateStatus,
	startTreeUpdate,
	completeTreeUpdate,
	failTreeUpdate,
	queueTreeUpdate,
	dequeueTreeUpdate,
	updateQueueItem,
	getOldestPendingUpdate,
	type TreeUpdateQueueItem
} from '$lib/stores/review.store';

// Configuration
const MAX_RETRY_ATTEMPTS = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 30000; // 30 seconds
const RETRY_BACKOFF_MULTIPLIER = 2;

/**
 * Calculate exponential backoff delay
 */
function calculateRetryDelay(retryCount: number): number {
	const delay = INITIAL_RETRY_DELAY * Math.pow(RETRY_BACKOFF_MULTIPLIER, retryCount);
	return Math.min(delay, MAX_RETRY_DELAY);
}

/**
 * Trigger Merkle tree update in the background with retry logic
 */
export async function triggerTreeUpdate(context: string = 'unknown'): Promise<void> {
	// Queue the update
	const queueId = queueTreeUpdate(context);
	
	// Execute update asynchronously (don't block)
	setTimeout(() => {
		executeTreeUpdate(queueId, context).catch(error => {
			console.error(`[Tree Update] Failed to execute queued update ${queueId}:`, error);
		});
	}, 0);
}

/**
 * Execute tree update with retry logic
 */
async function executeTreeUpdate(queueId: string, context: string, retryCount: number = 0): Promise<void> {
	try {
		// Check if already updating (prevent concurrent updates)
		let isUpdating = false;
		treeUpdateStatus.subscribe(status => {
			isUpdating = status.isUpdating;
		})();
		
		if (isUpdating && retryCount === 0) {
			// If already updating, wait a bit and retry
			setTimeout(() => {
				executeTreeUpdate(queueId, context, retryCount).catch(console.error);
			}, 2000);
			return;
		}
		
		startTreeUpdate();
		
		const { buildMerkleTree } = await import('$lib/services/review-verification.service');
		console.log(`[Tree Update] Starting update (attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS + 1}) triggered by: ${context}`);
		
		const startTime = Date.now();
		const result = await buildMerkleTree();
		const duration = Date.now() - startTime;
		
		// Mark as complete
		completeTreeUpdate(result.version, result.root);
		dequeueTreeUpdate(queueId);
		
		console.log(`[Tree Update] Successfully updated tree:`, {
			context,
			version: result.version,
			root: result.root.substring(0, 20) + '...',
			commitmentCount: result.commitmentCount,
			duration: `${duration}ms`,
			attempt: retryCount + 1
		});
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		console.error(`[Tree Update] Failed to update tree (context: ${context}, attempt ${retryCount + 1}):`, error);
		
		// Update queue item with error
		updateQueueItem(queueId, {
			retryCount: retryCount + 1,
			lastError: errorMessage
		});
		
		// Retry if we haven't exceeded max attempts
		if (retryCount < MAX_RETRY_ATTEMPTS) {
			const delay = calculateRetryDelay(retryCount);
			console.log(`[Tree Update] Retrying in ${delay}ms...`);
			
			setTimeout(() => {
				executeTreeUpdate(queueId, context, retryCount + 1).catch(console.error);
			}, delay);
		} else {
			// Max retries exceeded - mark as failed
			failTreeUpdate(errorMessage);
			console.error(`[Tree Update] Max retries exceeded for context: ${context}`);
			
			// Keep in queue for manual retry later
			// Don't dequeue - allows manual retry
		}
	}
}

/**
 * Retry failed tree updates from queue
 */
export async function retryFailedTreeUpdates(): Promise<void> {
	const pending = getOldestPendingUpdate();
	if (!pending) {
		return;
	}
	
	// Check if it's been long enough since last attempt
	const timeSinceLastAttempt = Date.now() - pending.timestamp;
	const minRetryInterval = calculateRetryDelay(pending.retryCount);
	
	if (timeSinceLastAttempt < minRetryInterval) {
		return; // Too soon to retry
	}
	
	// Reset retry count and retry
	updateQueueItem(pending.id, {
		timestamp: Date.now(),
		retryCount: 0,
		lastError: undefined
	});
	
	await executeTreeUpdate(pending.id, pending.context, 0);
}

/**
 * Manually trigger tree update (for user-initiated updates)
 */
export async function manualTreeUpdate(): Promise<{ success: boolean; error?: string }> {
	try {
		startTreeUpdate();
		
		const { buildMerkleTree } = await import('$lib/services/review-verification.service');
		const result = await buildMerkleTree();
		
		completeTreeUpdate(result.version, result.root);
		
		return { success: true };
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		failTreeUpdate(errorMessage);
		return { success: false, error: errorMessage };
	}
}

/**
 * Check if tree update is needed
 * Returns true if tree should be updated (e.g., after escrow completion)
 */
export function shouldUpdateTree(escrowStatus: number): boolean {
	// Update tree when escrow reaches a completed state
	const completedStates = [4, 2]; // Completed, DisputeResolved
	return completedStates.includes(escrowStatus);
}

/**
 * Get tree update status summary
 */
export function getTreeUpdateStatus(): {
	isUpdating: boolean;
	lastUpdateTime: number | null;
	hasError: boolean;
	pendingCount: number;
} {
	let status: any = {};
	treeUpdateStatus.subscribe(s => {
		status = {
			isUpdating: s.isUpdating,
			lastUpdateTime: s.lastUpdateTime,
			hasError: s.error !== null,
			pendingCount: s.pendingUpdates
		};
	})();
	return status;
}

