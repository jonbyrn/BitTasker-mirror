import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendSoonestAvailableRequest, handleIncomingSchedulingMessage } from '$lib/utils/nostr-scheduling';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';
import { findSoonestAvailableSlot } from '$lib/utils/availability-calculator';
import type { Event as NostrEvent } from 'nostr-tools';
import type { SoonestAvailableRequest, AvailabilityResponse } from '$lib/types/scheduling';

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

describe('Soonest Available Flow Integration', () => {
	const now = Date.now();
	const taskerPubkey = 'tasker-pubkey';
	const taskeePubkey = 'taskee-pubkey';
	const bidId = 'bid-soonest';
	const taskId = 'task-soonest';

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

	it('should handle soonest available request flow', async () => {
		// Use a timestamp that's clearly in the past but within valid window
		const requestTimestamp = now - 5 * 60 * 1000; // 5 minutes ago

		const request: SoonestAvailableRequest = {
			messageType: 'soonest-available-request',
			requestId: 'soonest-request-1',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
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

		const queueItem = requestQueueStore.getRequest('soonest-request-1');
		expect(queueItem).toBeDefined();
		expect(queueItem?.status).toBe('pending');
		expect(queueItem?.type).toBe('soonest-available-request');
	});

	it('should find soonest available slot from availability data', () => {
		const availability: AvailabilityResponse = {
			messageType: 'availability-response',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			timestamp: now,
			taskWindow: {
				start: now,
				end: now + 7 * 24 * 60 * 60 * 1000 // 7 days
			},
			profileAvailability: {
				timeSlots: [
					{
						day: new Date(now).getDay(),
						start: '09:00',
						end: '17:00',
						recurring: true
					}
				],
				timezone: 'UTC',
				noticeHours: 24,
				maxBookingsPerDay: 5,
				breakBetweenBookings: 60
			},
			blockedTimes: [],
			nonce: generateNonce()
		};

		const soonestSlot = findSoonestAvailableSlot(availability, 60); // 60 minutes duration

		expect(soonestSlot).toBeDefined();
		if (soonestSlot) {
			expect(soonestSlot.startTime).toBeGreaterThan(now);
			expect(soonestSlot.endTime).toBeGreaterThan(soonestSlot.startTime);
		}
	});

	it('should handle soonest available request with preferred time ranges', async () => {
		// Use a timestamp that's clearly in the past but within valid window
		const requestTimestamp = now - 5 * 60 * 1000; // 5 minutes ago
		const preferredStart = now + 2 * 24 * 60 * 60 * 1000; // 2 days from now
		const preferredEnd = preferredStart + 7 * 24 * 60 * 60 * 1000; // 7 days window

		const request: SoonestAvailableRequest = {
			messageType: 'soonest-available-request',
			requestId: 'soonest-with-preferences',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
			preferredTimeRanges: [
				{
					start: preferredStart,
					end: preferredEnd
				}
			],
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

		const queueItem = requestQueueStore.getRequest('soonest-with-preferences');
		expect(queueItem).toBeDefined();
		expect(queueItem?.type).toBe('soonest-available-request');
	});

	it('should handle soonest available request without preferred ranges', async () => {
		// Use a timestamp that's clearly in the past but within valid window
		const requestTimestamp = now - 5 * 60 * 1000; // 5 minutes ago

		const request: SoonestAvailableRequest = {
			messageType: 'soonest-available-request',
			requestId: 'soonest-no-preferences',
			bidId,
			taskId,
			taskerPubkey,
			taskeePubkey,
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

		const queueItem = requestQueueStore.getRequest('soonest-no-preferences');
		expect(queueItem).toBeDefined();
		expect(queueItem?.type).toBe('soonest-available-request');
	});
});

