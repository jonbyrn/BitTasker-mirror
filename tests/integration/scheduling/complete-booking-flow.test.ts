import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	sendTimeSlotRequest,
	sendRequestAcceptance,
	sendEscrowFundedNotification,
	sendSlotConfirmation,
	handleIncomingSchedulingMessage
} from '$lib/utils/nostr-scheduling';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';
import type { Event as NostrEvent } from 'nostr-tools';
import type {
	TimeSlotRequest,
	RequestAcceptance,
	EscrowFundedNotification,
	SlotConfirmation
} from '$lib/types/scheduling';

// Mock dependencies
vi.mock('$lib/utils/nostr-message', () => ({
	sendDirectMessage: vi.fn().mockResolvedValue(undefined),
	getMessagedPeople: vi.fn().mockResolvedValue([]),
	getMessageHistory: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/stores/nostr.store', () => ({
	nostrStore: {
		subscribe: vi.fn((callback) => {
			callback({
				nsec: new Uint8Array(32),
				npub: 'test-npub'
			});
			return () => {};
		})
	}
}));

vi.mock('$lib/utils/escrow-verification', () => ({
	verifyEscrowStatus: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
	verifyEscrowParties: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
	verifyEscrowTime: vi.fn().mockResolvedValue({ isValid: true, errors: [] }),
	verifyEscrowForScheduling: vi.fn().mockResolvedValue({ isValid: true, errors: [] })
}));

describe('Complete Booking Flow Integration', () => {
	const now = Date.now();
	const taskerPubkey = 'tasker-pubkey';
	const taskeePubkey = 'taskee-pubkey';
	const requestId = 'request-complete-flow';
	const bidId = 'bid-complete-flow';
	const taskId = 'task-complete-flow';
	const escrowId = 'escrow-complete-flow';

	let eventCounter = 0;
	const createMockEvent = (pubkey: string = taskerPubkey): NostrEvent => {
		eventCounter++;
		return {
			id: `event-${eventCounter}-${Date.now()}`,
			pubkey,
			created_at: Math.floor(Date.now() / 1000),
			kind: 4,
			tags: [['p', pubkey === taskerPubkey ? taskeePubkey : taskerPubkey]],
			content: '',
			sig: 'mock-signature'
		};
	};

	beforeEach(async () => {
		vi.clearAllMocks();
		requestQueueStore.clear();
		eventCounter = 0;
		// Clear processed message IDs to prevent replay attack detection in tests
		const { clearProcessedMessageIds } = await import('$lib/utils/nostr-scheduling');
		clearProcessedMessageIds();
	});

	it('should handle complete booking flow: request → acceptance → escrow → confirmation', async () => {
		const requestedStartTime = now + 24 * 60 * 60 * 1000; // 24 hours from now
		const requestedEndTime = requestedStartTime + 3600000; // 1 hour duration

		// Use a timestamp that's clearly in the past but within valid window
		const requestTimestamp = now - 5 * 60 * 1000; // 5 minutes ago

		// Step 1: Tasker sends time slot request
		const request: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId,
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: requestTimestamp,
			expiresAt: calculateExpiryTimestamp(requestTimestamp, 15),
			nonce: generateNonce()
		};

		const requestEvent = createMockEvent(taskerPubkey);
		const requestResult = await handleIncomingSchedulingMessage(
			JSON.stringify(request),
			requestEvent,
			taskerPubkey
		);

		expect(requestResult.success).toBe(true);

		let queueItem = requestQueueStore.getRequest(requestId);
		expect(queueItem).toBeDefined();
		expect(queueItem?.status).toBe('pending');
		expect(queueItem?.type).toBe('time-slot-request');

		// Step 2: Taskee accepts request
		const acceptance: RequestAcceptance = {
			messageType: 'request-acceptance',
			requestId,
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			acceptedStartTime: requestedStartTime,
			acceptedEndTime: requestedEndTime,
			timestamp: requestTimestamp + 1000,
			nonce: generateNonce()
		};

		const acceptanceEvent = createMockEvent(taskeePubkey);
		const acceptanceResult = await handleIncomingSchedulingMessage(
			JSON.stringify(acceptance),
			acceptanceEvent,
			taskeePubkey
		);

		expect(acceptanceResult.success).toBe(true);

		queueItem = requestQueueStore.getRequest(requestId);
		expect(queueItem?.status).toBe('accepted');
		expect(queueItem?.acceptedTime).toBeDefined();
		expect(queueItem?.acceptedTime?.startTime).toBe(requestedStartTime);
		expect(queueItem?.acceptedTime?.endTime).toBe(requestedEndTime);

		// Step 3: Tasker funds escrow and notifies taskee
		const escrowNotification: EscrowFundedNotification = {
			messageType: 'escrow-funded-notification',
			requestId,
			bidId,
			taskId,
			escrowId,
			taskerPubkey,
			taskeePubkey,
			escrowAmount: '1000000000000000000',
			transactionHash: '0x1234567890abcdef',
			timestamp: requestTimestamp + 2000,
			nonce: generateNonce()
		};

		const escrowEvent = createMockEvent(taskerPubkey);
		const escrowResult = await handleIncomingSchedulingMessage(
			JSON.stringify(escrowNotification),
			escrowEvent,
			taskerPubkey
		);

		expect(escrowResult.success).toBe(true);

		queueItem = requestQueueStore.getRequest(requestId);
		expect(queueItem?.status).toBe('accepted'); // Still accepted, not confirmed yet

		// Step 4: Taskee confirms slot after verifying escrow
		const confirmation: SlotConfirmation = {
			messageType: 'slot-confirmation',
			requestId,
			bidId,
			taskId,
			escrowId,
			taskerPubkey,
			taskeePubkey,
			confirmedStartTime: requestedStartTime,
			confirmedEndTime: requestedEndTime,
			timestamp: requestTimestamp + 3000,
			nonce: generateNonce()
		};

		const confirmationEvent = createMockEvent(taskeePubkey);
		const confirmationResult = await handleIncomingSchedulingMessage(
			JSON.stringify(confirmation),
			confirmationEvent,
			taskeePubkey
		);

		expect(confirmationResult.success).toBe(true);

		queueItem = requestQueueStore.getRequest(requestId);
		expect(queueItem?.status).toBe('confirmed');
		expect(queueItem?.confirmationTime).toBe(requestTimestamp + 3000);
		expect(queueItem?.escrowId).toBe(escrowId);
	});

	it('should handle request expiry during booking flow', async () => {
		// Use a timestamp that's within the valid window (30 minutes ago) but expires in the past
		const expiredTimestamp = now - 30 * 60 * 1000; // 30 minutes ago (within 1 hour max age)
		const expiredExpiresAt = now - 5 * 60 * 1000; // Expired 5 minutes ago

		const request: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'expired-request',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			requestedStartTime: now + 24 * 60 * 60 * 1000,
			requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
			timestamp: expiredTimestamp,
			expiresAt: expiredExpiresAt,
			nonce: generateNonce()
		};

		const requestEvent = createMockEvent(taskerPubkey);
		const requestResult = await handleIncomingSchedulingMessage(
			JSON.stringify(request),
			requestEvent,
			taskerPubkey
		);

		// Request should still be added (for display), but marked as expired
		expect(requestResult.success).toBe(true);

		const queueItem = requestQueueStore.getRequest('expired-request');
		expect(queueItem).toBeDefined();

		// Expiry should be handled by expiry handler
		const { handleRequestExpiry } = await import('$lib/utils/nostr-scheduling');
		await handleRequestExpiry();

		const expiredItem = requestQueueStore.getRequest('expired-request');
		expect(expiredItem?.status).toBe('expired');
	});

	it('should handle concurrent requests for same time slot', async () => {
		const requestedStartTime = now + 24 * 60 * 60 * 1000;
		const requestedEndTime = requestedStartTime + 3600000;

		// Use timestamps that are clearly in the past but within valid window
		const timestamp1 = now - 5 * 60 * 1000; // 5 minutes ago
		const timestamp2 = now - 4 * 60 * 1000; // 4 minutes ago

		// Create two requests for the same time slot
		const request1: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'concurrent-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: timestamp1,
			expiresAt: calculateExpiryTimestamp(timestamp1, 15),
			nonce: generateNonce()
		};

		const request2: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'concurrent-2',
			bidId: 'bid-2',
			taskId: 'task-2',
			taskerPubkey: 'tasker-2',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: timestamp2,
			expiresAt: calculateExpiryTimestamp(timestamp2, 15),
			nonce: generateNonce()
		};

		const event1 = createMockEvent('tasker-1');
		const event2 = createMockEvent('tasker-2');

		const result1 = await handleIncomingSchedulingMessage(JSON.stringify(request1), event1, 'tasker-1');
		const result2 = await handleIncomingSchedulingMessage(JSON.stringify(request2), event2, 'tasker-2');

		expect(result1.success).toBe(true);
		expect(result2.success).toBe(true);

		const queueItem1 = requestQueueStore.getRequest('concurrent-1');
		const queueItem2 = requestQueueStore.getRequest('concurrent-2');

		expect(queueItem1).toBeDefined();
		expect(queueItem2).toBeDefined();
		expect(queueItem1?.status).toBe('pending');
		expect(queueItem2?.status).toBe('pending');

		// Both should be in conflict
		const { detectConflicts } = await import('$lib/utils/conflict-detection');
		const allRequests = requestQueueStore.getAllRequests();
		const conflicts = detectConflicts(allRequests);

		expect(conflicts.conflicts.length).toBeGreaterThan(0);
		const conflict = conflicts.conflicts.find((c) =>
			c.requests.some((r) => r.id === 'concurrent-1')
		);
		expect(conflict).toBeDefined();
		expect(conflict?.requests.length).toBe(2);
	});

	it('should handle request cancellation during booking flow', async () => {
		// Use a timestamp that's clearly in the past but within valid window
		const requestTimestamp = now - 5 * 60 * 1000; // 5 minutes ago

		const request: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'cancel-request',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			requestedStartTime: now + 24 * 60 * 60 * 1000,
			requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
			timestamp: requestTimestamp,
			expiresAt: calculateExpiryTimestamp(requestTimestamp, 15),
			nonce: generateNonce()
		};

		const requestEvent = createMockEvent(taskerPubkey);
		const requestResult = await handleIncomingSchedulingMessage(JSON.stringify(request), requestEvent, taskerPubkey);

		expect(requestResult.success).toBe(true);

		let queueItem = requestQueueStore.getRequest('cancel-request');
		expect(queueItem?.status).toBe('pending');

		// Tasker cancels request
		const cancellation = {
			messageType: 'request-cancellation' as const,
			requestId: 'cancel-request',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			reason: 'Changed my mind',
			timestamp: requestTimestamp + 1000,
			nonce: generateNonce()
		};

		const cancellationEvent = createMockEvent(taskerPubkey);
		const cancellationResult = await handleIncomingSchedulingMessage(
			JSON.stringify(cancellation),
			cancellationEvent,
			taskerPubkey
		);

		expect(cancellationResult.success).toBe(true);

		queueItem = requestQueueStore.getRequest('cancel-request');
		expect(queueItem?.status).toBe('cancelled');
	});
});

