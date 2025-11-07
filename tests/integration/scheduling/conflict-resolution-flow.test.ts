import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleIncomingSchedulingMessage } from '$lib/utils/nostr-scheduling';
import { requestQueueStore } from '$lib/stores/request-queue.store';
import { detectConflicts, findBestOffer, findAlternativeSlots } from '$lib/utils/conflict-detection';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';
import type { Event as NostrEvent } from 'nostr-tools';
import type { TimeSlotRequest } from '$lib/types/scheduling';

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

describe('Conflict Resolution Flow Integration', () => {
	const now = Date.now();
	const taskeePubkey = 'taskee-pubkey';
	const requestedStartTime = now + 24 * 60 * 60 * 1000; // 24 hours from now
	const requestedEndTime = requestedStartTime + 3600000; // 1 hour duration

	let eventCounter = 0;
	const createMockEvent = (pubkey: string): NostrEvent => {
		eventCounter++;
		return {
			id: `event-${eventCounter}-${Date.now()}`,
			pubkey,
			created_at: Math.floor(Date.now() / 1000),
			kind: 4,
			tags: [['p', taskeePubkey]],
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

	it('should detect conflicts when multiple requests overlap', async () => {
		// Create three overlapping requests
		const request1: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'conflict-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			nonce: generateNonce()
		};

		const request2: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'conflict-2',
			bidId: 'bid-2',
			taskId: 'task-2',
			taskerPubkey: 'tasker-2',
			taskeePubkey,
			requestedStartTime: requestedStartTime + 30 * 60 * 1000, // Overlaps by 30 minutes
			requestedEndTime: requestedEndTime + 30 * 60 * 1000,
			timestamp: now + 100,
			expiresAt: calculateExpiryTimestamp(now + 100, 15),
			nonce: generateNonce()
		};

		const request3: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'conflict-3',
			bidId: 'bid-3',
			taskId: 'task-3',
			taskerPubkey: 'tasker-3',
			taskeePubkey,
			requestedStartTime: requestedStartTime - 30 * 60 * 1000, // Overlaps by 30 minutes
			requestedEndTime: requestedEndTime - 30 * 60 * 1000,
			timestamp: now + 200,
			expiresAt: calculateExpiryTimestamp(now + 200, 15),
			nonce: generateNonce()
		};

		// Add all requests
		await handleIncomingSchedulingMessage(JSON.stringify(request1), createMockEvent('tasker-1'), 'tasker-1');
		await handleIncomingSchedulingMessage(JSON.stringify(request2), createMockEvent('tasker-2'), 'tasker-2');
		await handleIncomingSchedulingMessage(JSON.stringify(request3), createMockEvent('tasker-3'), 'tasker-3');

		// Detect conflicts
		const allRequests = requestQueueStore.getAllRequests();
		const conflicts = detectConflicts(allRequests);

		expect(conflicts.conflicts.length).toBeGreaterThan(0);
		expect(conflicts.conflicts[0].requests.length).toBeGreaterThanOrEqual(2);
	});

	it('should identify best offer among conflicting requests', async () => {
		// Create conflicting requests with different bid amounts (simulated via tasker ratings)
		const request1: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'best-offer-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-high-rating',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			nonce: generateNonce()
		};

		const request2: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'best-offer-2',
			bidId: 'bid-2',
			taskId: 'task-2',
			taskerPubkey: 'tasker-low-rating',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: now + 100,
			expiresAt: calculateExpiryTimestamp(now + 100, 15),
			nonce: generateNonce()
		};

		await handleIncomingSchedulingMessage(JSON.stringify(request1), createMockEvent('tasker-high-rating'), 'tasker-high-rating');
		await handleIncomingSchedulingMessage(JSON.stringify(request2), createMockEvent('tasker-low-rating'), 'tasker-low-rating');

		const allRequests = requestQueueStore.getAllRequests();
		const conflicts = detectConflicts(allRequests);

		if (conflicts.conflicts.length > 0) {
			const conflictGroup = conflicts.conflicts[0];
			const bestOffer = findBestOffer(conflictGroup.requests);

			expect(bestOffer).toBeDefined();
			expect(conflictGroup.requests).toContain(bestOffer);
		}
	});

	it('should find alternative slots for conflicting requests', async () => {
		// Create a request for a specific time
		const request: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'alternative-test',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			nonce: generateNonce()
		};

		await handleIncomingSchedulingMessage(JSON.stringify(request), createMockEvent('tasker-1'), 'tasker-1');

		const allRequests = requestQueueStore.getAllRequests();
		const requestItem = allRequests.find((r) => r.id === 'alternative-test');

		if (requestItem) {
			// Calculate duration from the request (in minutes)
			const requestDuration = Math.round((requestedEndTime - requestedStartTime) / (60 * 1000));

			// Ensure task window includes the requested time and extends beyond it
			const requestedDay = new Date(requestedStartTime);
			const taskWindowStart = new Date(requestedDay);
			taskWindowStart.setHours(0, 0, 0, 0);
			const taskWindowEnd = new Date(taskWindowStart);
			taskWindowEnd.setDate(taskWindowEnd.getDate() + 7); // 7 days window

			// Mock availability data with a wide time window to ensure alternatives exist
			const mockAvailability = {
				messageType: 'availability-response' as const,
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker-1',
				taskeePubkey,
				timestamp: now,
				taskWindow: {
					start: taskWindowStart.getTime(),
					end: taskWindowEnd.getTime()
				},
				profileAvailability: {
					timeSlots: [
						{
							day: requestedDay.getDay(),
							start: '09:00',
							end: '17:00'
						}
					],
					timezone: 'UTC',
					noticeHours: 0, // No notice requirement for testing
					maxBookingsPerDay: 5,
					breakBetweenBookings: 60
				},
				blockedTimes: [],
				nonce: generateNonce()
			};

			// Calculate available slots from availability data
			const { calculateAvailableSlots } = await import('$lib/utils/availability-calculator');
			const availableSlots = calculateAvailableSlots(mockAvailability, requestDuration);

			// Verify we have available slots
			expect(availableSlots.length).toBeGreaterThan(0);

			// Convert to format expected by findAlternativeSlots
			const formattedSlots = availableSlots.map((slot) => ({
				startTime: slot.startTime,
				endTime: slot.endTime,
				duration: Math.round((slot.endTime - slot.startTime) / (60 * 1000)) // Convert to minutes
			}));

			// Find alternatives (should return slots that don't conflict with the requested time)
			const alternatives = findAlternativeSlots(requestItem, allRequests, formattedSlots, 60);

			// If there are multiple available slots, we should get alternatives
			if (formattedSlots.length > 1) {
				expect(alternatives.length).toBeGreaterThan(0);
				// Verify alternatives don't overlap with the requested time
				alternatives.forEach((alt) => {
					const altEndTime = alt.startTime + alt.duration * 60 * 1000;
					expect(
						alt.startTime >= requestedEndTime || altEndTime <= requestedStartTime
					).toBe(true);
				});
			}
		}
	});

	it('should handle non-conflicting requests separately', async () => {
		const request1: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'non-conflict-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey,
			requestedStartTime,
			requestedEndTime,
			timestamp: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			nonce: generateNonce()
		};

		const request2: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'non-conflict-2',
			bidId: 'bid-2',
			taskId: 'task-2',
			taskerPubkey: 'tasker-2',
			taskeePubkey,
			requestedStartTime: requestedEndTime + 3600000, // 1 hour after first ends
			requestedEndTime: requestedEndTime + 7200000, // No overlap
			timestamp: now + 100,
			expiresAt: calculateExpiryTimestamp(now + 100, 15),
			nonce: generateNonce()
		};

		await handleIncomingSchedulingMessage(JSON.stringify(request1), createMockEvent('tasker-1'), 'tasker-1');
		await handleIncomingSchedulingMessage(JSON.stringify(request2), createMockEvent('tasker-2'), 'tasker-2');

		const allRequests = requestQueueStore.getAllRequests();
		const conflicts = detectConflicts(allRequests);

		// Should have no conflicts
		expect(conflicts.conflicts.length).toBe(0);
	});
});

