import { describe, it, expect, beforeEach } from 'vitest';
import {
	detectRapidRequests,
	detectDuplicateRequests,
	detectSpamTimeSlots,
	detectAbuse,
	validateRequestForAbuse
} from '$lib/utils/scheduling-abuse-detection';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';

describe('Scheduling Abuse Detection', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	function createRequest(
		id: string,
		taskerPubkey: string,
		startTime: number,
		endTime: number,
		timestamp: number = now
	): RequestQueueItem {
		return {
			id,
			bidId: `bid-${id}`,
			taskId: `task-${id}`,
			taskerPubkey,
			taskeePubkey: 'taskee',
			type: 'time-slot-request',
			status: 'pending',
			createdAt: timestamp,
			expiresAt: timestamp + 15 * 60 * 1000,
			timestamp,
			nonce: `nonce-${id}`,
			request: {
				messageType: 'time-slot-request',
				requestId: id,
				bidId: `bid-${id}`,
				taskId: `task-${id}`,
				taskerPubkey,
				taskeePubkey: 'taskee',
				requestedStartTime: startTime,
				requestedEndTime: endTime,
				timestamp,
				expiresAt: timestamp + 15 * 60 * 1000,
				nonce: `nonce-${id}`
			} as TimeSlotRequest
		};
	}

	describe('detectRapidRequests', () => {
		it('should detect rapid requests from same user', () => {
			const requests: RequestQueueItem[] = [];
			const testNow = Date.now();
			const thirtySecondsAgo = testNow - 30 * 1000; // 30 seconds ago (within 1 minute window)

			// Create 6 requests in the last minute (exceeds default limit of 5)
			for (let i = 0; i < 6; i++) {
				requests.push(
					createRequest(`req-${i}`, 'tasker-1', testNow + oneHour, testNow + 2 * oneHour, thirtySecondsAgo + i * 1000)
				);
			}

			const pattern = detectRapidRequests(requests);
			expect(pattern).toBeDefined();
			expect(pattern?.type).toBe('rapid-requests');
			expect(pattern?.severity).toBe('medium');
		});

		it('should not detect rapid requests if under limit', () => {
			const requests: RequestQueueItem[] = [];
			const oneMinuteAgo = now - 60 * 1000;

			// Create 3 requests (under limit)
			for (let i = 0; i < 3; i++) {
				requests.push(
					createRequest(`req-${i}`, 'tasker-1', now + oneHour, now + 2 * oneHour, oneMinuteAgo + i * 1000)
				);
			}

			const pattern = detectRapidRequests(requests);
			expect(pattern).toBeNull();
		});

		it('should mark high severity for very rapid requests', () => {
			const requests: RequestQueueItem[] = [];
			const oneMinuteAgo = now - 60 * 1000;

			// Create 15 requests (high severity)
			for (let i = 0; i < 15; i++) {
				requests.push(
					createRequest(`req-${i}`, 'tasker-1', now + oneHour, now + 2 * oneHour, oneMinuteAgo + i * 100)
				);
			}

			const pattern = detectRapidRequests(requests);
			expect(pattern?.severity).toBe('high');
		});
	});

	describe('detectDuplicateRequests', () => {
		it('should detect duplicate requests from same tasker', () => {
			const requests: RequestQueueItem[] = [
				createRequest('req-1', 'tasker-1', now + oneHour, now + 2 * oneHour),
				createRequest('req-2', 'tasker-1', now + oneHour, now + 2 * oneHour), // Same time slot
				createRequest('req-3', 'tasker-1', now + oneHour, now + 2 * oneHour) // Same time slot
			];

			const pattern = detectDuplicateRequests(requests);
			expect(pattern).toBeDefined();
			expect(pattern?.type).toBe('duplicate-requests');
		});

		it('should not detect duplicates from different taskers', () => {
			const requests: RequestQueueItem[] = [
				createRequest('req-1', 'tasker-1', now + oneHour, now + 2 * oneHour),
				createRequest('req-2', 'tasker-2', now + oneHour, now + 2 * oneHour) // Same time slot, different tasker
			];

			const pattern = detectDuplicateRequests(requests);
			expect(pattern).toBeNull(); // Different taskers = normal conflict, not abuse
		});
	});

	describe('detectSpamTimeSlots', () => {
		it('should detect spam time slots', () => {
			const requests: RequestQueueItem[] = [];
			const oneHourAgo = now - 60 * 60 * 1000;

			// Create 25 different time slots (exceeds default limit of 20)
			for (let i = 0; i < 25; i++) {
				requests.push(
					createRequest(
						`req-${i}`,
						'tasker-1',
						now + oneHour + i * 60 * 60 * 1000,
						now + 2 * oneHour + i * 60 * 60 * 1000,
						oneHourAgo + i * 1000
					)
				);
			}

			const pattern = detectSpamTimeSlots(requests);
			expect(pattern).toBeDefined();
			expect(pattern?.type).toBe('spam-time-slots');
		});
	});

	describe('detectAbuse', () => {
		it('should detect multiple abuse patterns', () => {
			const requests: RequestQueueItem[] = [];
			const oneMinuteAgo = now - 60 * 1000;

			// Create rapid requests
			for (let i = 0; i < 6; i++) {
				requests.push(
					createRequest(`req-${i}`, 'tasker-1', now + oneHour, now + 2 * oneHour, oneMinuteAgo + i * 1000)
				);
			}

			const result = detectAbuse(requests);
			expect(result.isAbuse).toBe(true);
			expect(result.patterns.length).toBeGreaterThan(0);
		});

		it('should recommend block for high severity', () => {
			const requests: RequestQueueItem[] = [];
			const oneMinuteAgo = now - 60 * 1000;

			// Create many rapid requests (high severity)
			for (let i = 0; i < 15; i++) {
				requests.push(
					createRequest(`req-${i}`, 'tasker-1', now + oneHour, now + 2 * oneHour, oneMinuteAgo + i * 100)
				);
			}

			const result = detectAbuse(requests);
			expect(result.recommendation).toBe('block');
		});
	});

	describe('validateRequestForAbuse', () => {
		it('should reject duplicate request IDs', () => {
			const existingRequests: RequestQueueItem[] = [
				createRequest('req-1', 'tasker-1', now + oneHour, now + 2 * oneHour)
			];

			const newRequest: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'req-1', // Duplicate ID
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker-1',
				taskeePubkey: 'taskee',
				requestedStartTime: now + oneHour,
				requestedEndTime: now + 2 * oneHour,
				timestamp: now,
				expiresAt: now + 15 * 60 * 1000,
				nonce: 'nonce-1'
			};

			const result = validateRequestForAbuse(newRequest, existingRequests);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Duplicate request ID');
		});

		it('should reject rapid requests', () => {
			const existingRequests: RequestQueueItem[] = [];
			const testNow = Date.now();
			const thirtySecondsAgo = testNow - 30 * 1000; // 30 seconds ago (definitely within 1 minute window)

			// Create 5 recent requests within the last minute
			for (let i = 0; i < 5; i++) {
				existingRequests.push(
					createRequest(`req-${i}`, 'tasker-1', testNow + oneHour, testNow + 2 * oneHour, thirtySecondsAgo + i * 1000)
				);
			}

			const newRequest: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'req-new',
				bidId: 'bid-new',
				taskId: 'task-new',
				taskerPubkey: 'tasker-1', // Same tasker
				taskeePubkey: 'taskee',
				requestedStartTime: testNow + oneHour,
				requestedEndTime: testNow + 2 * oneHour,
				timestamp: testNow,
				expiresAt: testNow + 15 * 60 * 1000,
				nonce: 'nonce-new'
			};

			const result = validateRequestForAbuse(newRequest, existingRequests);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Too many requests in short time');
		});

		it('should allow valid requests', () => {
			const existingRequests: RequestQueueItem[] = [
				createRequest('req-1', 'tasker-1', now + oneHour, now + 2 * oneHour, now - 2 * 60 * 1000) // 2 minutes ago
			];

			const newRequest: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'req-new',
				bidId: 'bid-new',
				taskId: 'task-new',
				taskerPubkey: 'tasker-1',
				taskeePubkey: 'taskee',
				requestedStartTime: now + 3 * oneHour,
				requestedEndTime: now + 4 * oneHour,
				timestamp: now,
				expiresAt: now + 15 * 60 * 1000,
				nonce: 'nonce-new'
			};

			const result = validateRequestForAbuse(newRequest, existingRequests);
			expect(result.valid).toBe(true);
		});
	});
});

