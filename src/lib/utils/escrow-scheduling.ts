import { sendEscrowFundedNotification } from './nostr-scheduling';
import { requestQueueStore, type RequestQueueItem } from '../stores/request-queue.store';
import { escrow } from './wallet/escrow';
import { EscrowStatus } from './enums/wallet.enum';
import { pollEscrowStatus } from './escrow-verification';
import type { EscrowCreatedEvent } from './wallet/escrowEvents';

/**
 * Map to track escrow creation for scheduling requests
 * Key: escrowId, Value: requestId
 */
const escrowToRequestMap = new Map<string, string>();

/**
 * Map to track pending escrow creations for scheduling
 * Key: transactionHash, Value: requestId
 */
const pendingEscrowCreations = new Map<string, string>();

/**
 * Register a pending escrow creation for a scheduling request
 */
export function registerPendingEscrowForScheduling(
	transactionHash: string,
	requestId: string
): void {
	pendingEscrowCreations.set(transactionHash, requestId);
	console.log(`Registered pending escrow creation for scheduling request ${requestId}, tx: ${transactionHash}`);
}

/**
 * Handle escrow created event for scheduling
 * This is called when an escrow is created that was initiated from a scheduling request
 */
export async function handleEscrowCreatedForScheduling(
	event: EscrowCreatedEvent,
	requestId?: string
): Promise<{ success: boolean; error?: string }> {
	try {
		// Find request ID if not provided
		let actualRequestId = requestId;

		if (!actualRequestId) {
			// Try to find by transaction hash
			actualRequestId = pendingEscrowCreations.get(event.transactionHash);
		}

		if (!actualRequestId) {
			// Try to find by checking request queue for matching bid/task
			// This is a fallback - ideally requestId should be provided
			console.warn('No request ID found for escrow creation, cannot send scheduling notification');
			return { success: false, error: 'No request ID found' };
		}

		// Get the request from queue
		const request = requestQueueStore.getRequest(actualRequestId);
		if (!request) {
			console.warn(`Request ${actualRequestId} not found in queue`);
			return { success: false, error: 'Request not found in queue' };
		}

		// Verify escrow is funded before sending notification
		const pollResult = await pollEscrowStatus(event.escrowId, EscrowStatus.Funded, 30000); // 30 second timeout
		if (!pollResult.success) {
			console.warn(`Escrow ${event.escrowId} not funded yet: ${pollResult.error}`);
			// Still proceed, but log warning
		}

		// Send escrow-funded notification to taskee
		await sendEscrowFundedNotification({
			requestId: actualRequestId,
			bidId: request.bidId,
			taskId: request.taskId,
			escrowId: event.escrowId,
			taskerPubkey: request.taskerPubkey,
			taskeePubkey: request.taskeePubkey,
			escrowAmount: event.amount,
			transactionHash: event.transactionHash
		});

		// Update request with escrow ID
		requestQueueStore.updateRequestStatus(actualRequestId, 'accepted', {
			escrowId: event.escrowId
		});

		// Map escrow ID to request ID for future reference
		escrowToRequestMap.set(event.escrowId, actualRequestId);

		// Clean up pending registration
		pendingEscrowCreations.delete(event.transactionHash);

		console.log(`✅ Escrow-funded notification sent for request ${actualRequestId}, escrow ${event.escrowId}`);
		return { success: true };
	} catch (error) {
		console.error('Failed to handle escrow created for scheduling:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Get request ID for an escrow (if it's a scheduling escrow)
 */
export function getRequestIdForEscrow(escrowId: string): string | undefined {
	return escrowToRequestMap.get(escrowId);
}

/**
 * Check if an escrow is associated with a scheduling request
 */
export function isSchedulingEscrow(escrowId: string): boolean {
	return escrowToRequestMap.has(escrowId);
}

/**
 * Clear escrow-to-request mappings (useful for cleanup)
 */
export function clearEscrowMappings(): void {
	escrowToRequestMap.clear();
	pendingEscrowCreations.clear();
}

