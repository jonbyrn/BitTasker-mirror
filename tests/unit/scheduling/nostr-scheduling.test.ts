import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
	sendTimeSlotRequest,
	sendSoonestAvailableRequest,
	sendRequestAcceptance,
	sendEscrowFundedNotification,
	sendSlotConfirmation,
	sendAvailabilityResponse,
	sendRequestCancellation,
	sendAvailabilityUpdate,
	handleIncomingSchedulingMessage,
	handleRequestExpiry
} from '$lib/utils/nostr-scheduling';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import type {
	TimeSlotRequest,
	SoonestAvailableRequest,
	RequestAcceptance,
	EscrowFundedNotification,
	SlotConfirmation,
	AvailabilityResponse,
	RequestCancellation
} from '$lib/types/scheduling';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';
import type { Event as NostrEvent } from 'nostr-tools';

// Mock dependencies
vi.mock('$lib/utils/nostr-message', () => ({
	sendDirectMessage: vi.fn().mockResolvedValue(undefined),
	getMessagedPeople: vi.fn().mockResolvedValue([]),
	getMessageHistory: vi.fn().mockResolvedValue([])
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue({
		nsec: new Uint8Array(32),
		npub: 'test-npub'
	})
}));

vi.mock('$lib/utils/escrow-verification', () => ({
	verifyEscrowStatus: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
	verifyEscrowParties: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
	verifyEscrowTime: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] }),
	verifyEscrowForScheduling: vi.fn().mockResolvedValue({ isValid: true, errors: [], warnings: [] })
}));

describe('Nostr Scheduling Messages', () => {
	const now = Date.now();
	const taskerPubkey = 'tasker-pubkey';
	const taskeePubkey = 'taskee-pubkey';
	const requestId = 'request-123';
	const bidId = 'bid-123';
	const taskId = 'task-123';

	beforeEach(() => {
		vi.clearAllMocks();
		requestQueueStore.clear();
	});

	describe('sendTimeSlotRequest', () => {
		it('should send time slot request', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendTimeSlotRequest(
				{
					requestId,
					bidId,
					taskId,
					taskerPubkey,
					taskeePubkey,
					requestedStartTime: now + 24 * 60 * 60 * 1000,
					requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000
				},
				15
			);

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const callArgs = vi.mocked(sendDirectMessage).mock.calls[0];
			expect(callArgs[1]).toBe(taskeePubkey);

			const sentMessage = JSON.parse(callArgs[0] as string);
			expect(sentMessage.messageType).toBe('time-slot-request');
			expect(sentMessage.requestId).toBe(requestId);
			expect(sentMessage.nonce).toBeDefined();
			expect(sentMessage.timestamp).toBeGreaterThan(0);
		});

		it('should use custom expiry minutes', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendTimeSlotRequest(
				{
					requestId,
					bidId,
					taskId,
					taskerPubkey,
					taskeePubkey,
					requestedStartTime: now + 24 * 60 * 60 * 1000,
					requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000
				},
				30
			);

			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			const expectedExpiry = sentMessage.timestamp + 30 * 60 * 1000;
			expect(sentMessage.expiresAt).toBe(expectedExpiry);
		});
	});

	describe('sendSoonestAvailableRequest', () => {
		it('should send soonest available request', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendSoonestAvailableRequest({
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey
			});

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.messageType).toBe('soonest-available-request');
			expect(sentMessage.requestId).toBe(requestId);
		});

		it('should include preferred time ranges if provided', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendSoonestAvailableRequest({
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				preferredTimeRanges: [
					{
						start: now + 24 * 60 * 60 * 1000,
						end: now + 25 * 60 * 60 * 1000
					}
				]
			});

			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.preferredTimeRanges).toBeDefined();
			expect(sentMessage.preferredTimeRanges.length).toBe(1);
		});
	});

	describe('sendRequestAcceptance', () => {
		it('should send request acceptance', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendRequestAcceptance({
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				acceptedStartTime: now + 24 * 60 * 60 * 1000,
				acceptedEndTime: now + 24 * 60 * 60 * 1000 + 3600000
			});

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.messageType).toBe('request-acceptance');
			expect(sentMessage.acceptedStartTime).toBe(now + 24 * 60 * 60 * 1000);
		});
	});

	describe('sendEscrowFundedNotification', () => {
		it('should send escrow funded notification', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendEscrowFundedNotification({
				requestId,
				bidId,
				taskId,
				escrowId: 'escrow-123',
				taskerPubkey,
				taskeePubkey,
				escrowAmount: '1000000000000000000',
				transactionHash: '0x123'
			});

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.messageType).toBe('escrow-funded-notification');
			expect(sentMessage.escrowId).toBe('escrow-123');
		});
	});

	describe('sendSlotConfirmation', () => {
		it('should send slot confirmation', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendSlotConfirmation({
				requestId,
				bidId,
				taskId,
				escrowId: 'escrow-123',
				taskerPubkey,
				taskeePubkey,
				confirmedStartTime: now + 24 * 60 * 60 * 1000,
				confirmedEndTime: now + 24 * 60 * 60 * 1000 + 3600000
			});

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.messageType).toBe('slot-confirmation');
			expect(sentMessage.escrowId).toBe('escrow-123');
		});
	});

	describe('sendRequestCancellation', () => {
		it('should send request cancellation', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			await sendRequestCancellation({
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey
			});

			expect(sendDirectMessage).toHaveBeenCalledTimes(1);
			const sentMessage = JSON.parse(vi.mocked(sendDirectMessage).mock.calls[0][0] as string);
			expect(sentMessage.messageType).toBe('request-cancellation');
			expect(sentMessage.requestId).toBe(requestId);
		});
	});

	describe('handleIncomingSchedulingMessage', () => {
		const createMockEvent = (id: string, created_at: number = Math.floor(Date.now() / 1000)): NostrEvent => ({
			id,
			pubkey: taskerPubkey,
			created_at,
			kind: 4,
			tags: [['p', taskeePubkey]],
			content: '',
			sig: 'mock-signature'
		});

		it('should handle time slot request', async () => {
			const message: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};

			const event = createMockEvent('event-1');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(message), event, taskerPubkey);

			expect(result.success).toBe(true);
			const request = requestQueueStore.getRequest(requestId);
			expect(request).toBeDefined();
			expect(request?.status).toBe('pending');
		});

		it('should reject duplicate messages (replay attack)', async () => {
			const message: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};

			const event = createMockEvent('event-1');
			await handleIncomingSchedulingMessage(JSON.stringify(message), event, taskerPubkey);

			// Try to process same message again
			const result = await handleIncomingSchedulingMessage(JSON.stringify(message), event, taskerPubkey);

			expect(result.success).toBe(false);
			expect(result.error).toContain('already processed');
		});

		it('should reject messages with invalid timestamp', async () => {
			const message: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'request-old-timestamp',
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now - 2 * 60 * 60 * 1000, // 2 hours ago (too old)
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};

			const event = createMockEvent('event-old-timestamp');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(message), event, taskerPubkey);

			expect(result.success).toBe(false);
			expect(result.error).toContain('too old');
		});

		it('should reject messages with invalid nonce', async () => {
			const message: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'request-invalid-nonce',
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: 'invalid-nonce' // Invalid format
			};

			const event = createMockEvent('event-invalid-nonce');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(message), event, taskerPubkey);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Invalid nonce');
		});

		it('should handle request acceptance and update status', async () => {
			// First add a request
			const request: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};
			requestQueueStore.addRequest(request);

			// Then handle acceptance
			const acceptance: RequestAcceptance = {
				messageType: 'request-acceptance',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				acceptedStartTime: now + 24 * 60 * 60 * 1000,
				acceptedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				nonce: generateNonce()
			};

			const event = createMockEvent('event-2');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(acceptance), event, taskeePubkey);

			expect(result.success).toBe(true);
			const updatedRequest = requestQueueStore.getRequest(requestId);
			expect(updatedRequest?.status).toBe('accepted');
			expect(updatedRequest?.acceptedTime).toBeDefined();
		});

		it('should handle request cancellation', async () => {
			// First add a request
			const request: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};
			requestQueueStore.addRequest(request);

			// Then handle cancellation
			const cancellation: RequestCancellation = {
				messageType: 'request-cancellation',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				timestamp: now,
				nonce: generateNonce()
			};

			const event = createMockEvent('event-3');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(cancellation), event, taskerPubkey);

			expect(result.success).toBe(true);
			const updatedRequest = requestQueueStore.getRequest(requestId);
			expect(updatedRequest?.status).toBe('cancelled');
		});

		it('should handle slot confirmation', async () => {
			// First add and accept a request
			const request: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId,
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				expiresAt: calculateExpiryTimestamp(now, 15),
				nonce: generateNonce()
			};
			requestQueueStore.addRequest(request);
			requestQueueStore.updateRequestStatus(requestId, 'accepted', {
				acceptedTime: {
					startTime: now + 24 * 60 * 60 * 1000,
					endTime: now + 24 * 60 * 60 * 1000 + 3600000
				}
			});

			// Then handle confirmation
			const confirmation: SlotConfirmation = {
				messageType: 'slot-confirmation',
				requestId,
				bidId,
				taskId,
				escrowId: 'escrow-123',
				taskerPubkey,
				taskeePubkey,
				confirmedStartTime: now + 24 * 60 * 60 * 1000,
				confirmedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now,
				nonce: generateNonce()
			};

			const event = createMockEvent('event-4');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(confirmation), event, taskeePubkey);

			expect(result.success).toBe(true);
			const updatedRequest = requestQueueStore.getRequest(requestId);
			expect(updatedRequest?.status).toBe('confirmed');
		});

		it('should reject unknown message types', async () => {
			const invalidMessage = {
				messageType: 'unknown-type',
				timestamp: now,
				nonce: generateNonce()
			};

			const event = createMockEvent('event-5');
			const result = await handleIncomingSchedulingMessage(JSON.stringify(invalidMessage), event, taskerPubkey);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Unknown message type');
		});

		it('should handle invalid JSON gracefully', async () => {
			const event = createMockEvent('event-6');
			const result = await handleIncomingSchedulingMessage('invalid json', event, taskerPubkey);

			expect(result.success).toBe(false);
			expect(result.error).toContain('Failed to parse');
		});
	});

	describe('handleRequestExpiry', () => {
		it('should update expired requests', () => {
			const expiredRequest: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'expired-1',
				bidId,
				taskId,
				taskerPubkey,
				taskeePubkey,
				requestedStartTime: now + 24 * 60 * 60 * 1000,
				requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: now - 10000,
				expiresAt: now - 1000, // Expired
				nonce: generateNonce()
			};

			requestQueueStore.addRequest(expiredRequest);
			handleRequestExpiry();

			const request = requestQueueStore.getRequest('expired-1');
			expect(request?.status).toBe('expired');
		});
	});
});

