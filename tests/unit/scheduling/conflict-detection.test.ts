import { describe, it, expect, beforeEach } from 'vitest';
import {
	timeRangesOverlap,
	calculateOverlapMinutes,
	extractTimeRange,
	detectConflicts,
	isRequestInConflict,
	findAlternativeSlots,
	calculateRequestScore,
	findBestOffer,
	groupRequestsByConflicts
} from '$lib/utils/conflict-detection';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';

describe('Conflict Detection', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	describe('timeRangesOverlap', () => {
		it('should detect overlapping time ranges', () => {
			expect(timeRangesOverlap(now, now + oneHour, now + 30 * 60 * 1000, now + 90 * 60 * 1000)).toBe(true);
		});

		it('should detect non-overlapping time ranges', () => {
			expect(timeRangesOverlap(now, now + oneHour, now + 2 * oneHour, now + 3 * oneHour)).toBe(false);
		});

		it('should detect adjacent ranges as non-overlapping', () => {
			expect(timeRangesOverlap(now, now + oneHour, now + oneHour, now + 2 * oneHour)).toBe(false);
		});

		it('should respect tolerance', () => {
			// With 15 minute tolerance, ranges 10 minutes apart should overlap
			expect(timeRangesOverlap(now, now + oneHour, now + 50 * 60 * 1000, now + 2 * oneHour, 15)).toBe(true);
		});
	});

	describe('calculateOverlapMinutes', () => {
		it('should calculate overlap correctly', () => {
			const overlap = calculateOverlapMinutes(
				now,
				now + oneHour,
				now + 30 * 60 * 1000,
				now + 90 * 60 * 1000
			);
			expect(overlap).toBe(30);
		});

		it('should return 0 for non-overlapping ranges', () => {
			const overlap = calculateOverlapMinutes(now, now + oneHour, now + 2 * oneHour, now + 3 * oneHour);
			expect(overlap).toBe(0);
		});
	});

	describe('extractTimeRange', () => {
		it('should extract time range from time-slot-request', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const range = extractTimeRange(request);
			expect(range).toEqual({ start: now + oneHour, end: now + 2 * oneHour });
		});

		it('should return null for soonest-available-request', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				type: 'soonest-available-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'soonest-available-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker',
					taskeePubkey: 'taskee',
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				}
			};

			const range = extractTimeRange(request);
			expect(range).toBeNull();
		});
	});

	describe('detectConflicts', () => {
		it('should detect conflicts between overlapping requests', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 90 * 60 * 1000,
						requestedEndTime: now + 150 * 60 * 1000,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				}
			];

			const result = detectConflicts(requests);
			expect(result.conflicts.length).toBeGreaterThan(0);
			expect(result.affectedRequests.size).toBe(2);
		});

		it('should not detect conflicts for non-overlapping requests', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 3 * oneHour,
						requestedEndTime: now + 4 * oneHour,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				}
			];

			const result = detectConflicts(requests);
			expect(result.conflicts.length).toBe(0);
			expect(result.affectedRequests.size).toBe(0);
		});

		it('should handle 3+ conflicts', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 90 * 60 * 1000,
						requestedEndTime: now + 150 * 60 * 1000,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				},
				{
					id: 'req-3',
					bidId: 'bid-3',
					taskId: 'task-3',
					taskerPubkey: 'tasker-3',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 15 * 60 * 1000,
					timestamp: now,
					nonce: 'nonce-3',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-3',
						bidId: 'bid-3',
						taskId: 'task-3',
						taskerPubkey: 'tasker-3',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 110 * 60 * 1000,
						requestedEndTime: now + 170 * 60 * 1000,
						timestamp: now,
						expiresAt: now + 15 * 60 * 1000,
						nonce: 'nonce-3'
					} as TimeSlotRequest
				}
			];

			const result = detectConflicts(requests);
			expect(result.conflicts.length).toBeGreaterThan(0);
			expect(result.affectedRequests.size).toBeGreaterThanOrEqual(2);
		});
	});

	describe('isRequestInConflict', () => {
		it('should detect if request is in conflict', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker-1',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const conflictingRequest: RequestQueueItem = {
				id: 'req-2',
				bidId: 'bid-2',
				taskId: 'task-2',
				taskerPubkey: 'tasker-2',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-2',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					requestedStartTime: now + 90 * 60 * 1000,
					requestedEndTime: now + 150 * 60 * 1000,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-2'
				} as TimeSlotRequest
			};

			const isConflict = isRequestInConflict(request, [request, conflictingRequest]);
			expect(isConflict).toBe(true);
		});
	});

	describe('findBestOffer', () => {
		it('should find best offer from multiple requests', () => {
			const requests: RequestQueueItem[] = [
				{
					id: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 5 * 60 * 1000, // Expires soon (higher urgency)
					timestamp: now,
					nonce: 'nonce-1',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-1',
						bidId: 'bid-1',
						taskId: 'task-1',
						taskerPubkey: 'tasker-1',
						taskeePubkey: 'taskee',
						requestedStartTime: now + oneHour,
						requestedEndTime: now + 2 * oneHour,
						timestamp: now,
						expiresAt: now + 5 * 60 * 1000,
						nonce: 'nonce-1'
					} as TimeSlotRequest
				},
				{
					id: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					type: 'time-slot-request',
					status: 'pending',
					createdAt: now,
					expiresAt: now + 30 * 60 * 1000, // Expires later (lower urgency)
					timestamp: now,
					nonce: 'nonce-2',
					request: {
						messageType: 'time-slot-request',
						requestId: 'req-2',
						bidId: 'bid-2',
						taskId: 'task-2',
						taskerPubkey: 'tasker-2',
						taskeePubkey: 'taskee',
						requestedStartTime: now + 2 * oneHour,
						requestedEndTime: now + 3 * oneHour,
						timestamp: now,
						expiresAt: now + 30 * 60 * 1000,
						nonce: 'nonce-2'
					} as TimeSlotRequest
				}
			];

			const bestOffer = findBestOffer(requests);
			expect(bestOffer).toBeDefined();
			expect(bestOffer?.id).toBe('req-1'); // Should prefer urgent request
		});
	});

	describe('findAlternativeSlots', () => {
		it('should find alternative slots that do not conflict', () => {
			const request: RequestQueueItem = {
				id: 'req-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker-1',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'pending',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-1',
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-1',
					bidId: 'bid-1',
					taskId: 'task-1',
					taskerPubkey: 'tasker-1',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-1'
				} as TimeSlotRequest
			};

			const blockedRequest: RequestQueueItem = {
				id: 'req-2',
				bidId: 'bid-2',
				taskId: 'task-2',
				taskerPubkey: 'tasker-2',
				taskeePubkey: 'taskee',
				type: 'time-slot-request',
				status: 'accepted',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000,
				timestamp: now,
				nonce: 'nonce-2',
				acceptedTime: {
					startTime: now + oneHour,
					endTime: now + 2 * oneHour
				},
				request: {
					messageType: 'time-slot-request',
					requestId: 'req-2',
					bidId: 'bid-2',
					taskId: 'task-2',
					taskerPubkey: 'tasker-2',
					taskeePubkey: 'taskee',
					requestedStartTime: now + oneHour,
					requestedEndTime: now + 2 * oneHour,
					timestamp: now,
					expiresAt: now + 15 * 60 * 1000,
					nonce: 'nonce-2'
				} as TimeSlotRequest
			};

			const availableSlots = [
				{ startTime: now + oneHour, endTime: now + 2 * oneHour, duration: 60 }, // Conflicts
				{ startTime: now + 3 * oneHour, endTime: now + 4 * oneHour, duration: 60 }, // Available
				{ startTime: now + 5 * oneHour, endTime: now + 6 * oneHour, duration: 60 } // Available
			];

			const alternatives = findAlternativeSlots(request, [request, blockedRequest], availableSlots);
			expect(alternatives.length).toBe(2);
			expect(alternatives[0].startTime).toBe(now + 3 * oneHour);
		});
	});
});

