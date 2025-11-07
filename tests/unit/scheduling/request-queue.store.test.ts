import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import {
	requestQueueStore,
	pendingRequests,
	activeRequests,
	expiredRequests,
	requestQueueStats
} from '$lib/stores/request-queue.store';
import type { TimeSlotRequest, SoonestAvailableRequest } from '$lib/types/scheduling';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';

describe('Request Queue Store', () => {
	const now = Date.now();
	const taskerPubkey = 'tasker-pubkey';
	const taskeePubkey = 'taskee-pubkey';

	const createTimeSlotRequest = (overrides?: Partial<TimeSlotRequest>): TimeSlotRequest => ({
		messageType: 'time-slot-request',
		requestId: 'request-1',
		bidId: 'bid-1',
		taskId: 'task-1',
		taskerPubkey,
		taskeePubkey,
		requestedStartTime: now + 24 * 60 * 60 * 1000,
		requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
		timestamp: now,
		expiresAt: calculateExpiryTimestamp(now, 15),
		nonce: generateNonce(),
		...overrides
	});

	const createSoonestAvailableRequest = (
		overrides?: Partial<SoonestAvailableRequest>
	): SoonestAvailableRequest => ({
		messageType: 'soonest-available-request',
		requestId: 'request-2',
		bidId: 'bid-2',
		taskId: 'task-2',
		taskerPubkey,
		taskeePubkey,
		timestamp: now,
		expiresAt: calculateExpiryTimestamp(now, 15),
		nonce: generateNonce(),
		...overrides
	});

	beforeEach(() => {
		requestQueueStore.clear();
	});

	describe('addRequest', () => {
		it('should add a time slot request to the queue', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].id).toBe('request-1');
			expect(queue[0].type).toBe('time-slot-request');
			expect(queue[0].status).toBe('pending');
		});

		it('should add a soonest available request to the queue', () => {
			const request = createSoonestAvailableRequest();
			requestQueueStore.addRequest(request);

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].id).toBe('request-2');
			expect(queue[0].type).toBe('soonest-available-request');
		});

		it('should replace existing request with same ID', () => {
			const request1 = createTimeSlotRequest({ requestId: 'request-1' });
			const request2 = createTimeSlotRequest({
				requestId: 'request-1',
				requestedStartTime: now + 48 * 60 * 60 * 1000
			});

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].request.requestedStartTime).toBe(now + 48 * 60 * 60 * 1000);
		});

		it('should sort requests by expiry time', () => {
			const request1 = createTimeSlotRequest({
				requestId: 'request-1',
				expiresAt: calculateExpiryTimestamp(now, 30)
			});
			const request2 = createTimeSlotRequest({
				requestId: 'request-2',
				expiresAt: calculateExpiryTimestamp(now, 15)
			});

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(2);
			expect(queue[0].id).toBe('request-2'); // Earlier expiry first
			expect(queue[1].id).toBe('request-1');
		});
	});

	describe('updateRequestStatus', () => {
		it('should update request status', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);
			requestQueueStore.updateRequestStatus('request-1', 'accepted');

			const queue = get(requestQueueStore);
			expect(queue[0].status).toBe('accepted');
			expect(queue[0].lastUpdated).toBeGreaterThan(request.timestamp);
		});

		it('should update request with metadata', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);
			requestQueueStore.updateRequestStatus('request-1', 'accepted', {
				acceptedTime: {
					startTime: now + 24 * 60 * 60 * 1000,
					endTime: now + 24 * 60 * 60 * 1000 + 3600000
				},
				escrowId: 'escrow-123'
			});

			const queue = get(requestQueueStore);
			expect(queue[0].status).toBe('accepted');
			expect(queue[0].acceptedTime).toBeDefined();
			expect(queue[0].escrowId).toBe('escrow-123');
		});

		it('should not update non-existent request', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);
			requestQueueStore.updateRequestStatus('non-existent', 'accepted');

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].status).toBe('pending');
		});
	});

	describe('removeRequest', () => {
		it('should remove request from queue', () => {
			const request1 = createTimeSlotRequest({ requestId: 'request-1' });
			const request2 = createTimeSlotRequest({ requestId: 'request-2' });

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);
			requestQueueStore.removeRequest('request-1');

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].id).toBe('request-2');
		});

		it('should handle removing non-existent request', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);
			requestQueueStore.removeRequest('non-existent');

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
		});
	});

	describe('getRequest', () => {
		it('should get request by ID', () => {
			const request = createTimeSlotRequest();
			requestQueueStore.addRequest(request);

			const found = requestQueueStore.getRequest('request-1');
			expect(found).toBeDefined();
			expect(found?.id).toBe('request-1');
		});

		it('should return undefined for non-existent request', () => {
			const found = requestQueueStore.getRequest('non-existent');
			expect(found).toBeUndefined();
		});
	});

	describe('removeExpired', () => {
		it('should remove expired requests', () => {
			const expiredRequest = createTimeSlotRequest({
				requestId: 'expired-1',
				expiresAt: now - 1000
			});
			const activeRequest = createTimeSlotRequest({
				requestId: 'active-1',
				expiresAt: now + 15 * 60 * 1000
			});

			requestQueueStore.addRequest(expiredRequest);
			requestQueueStore.addRequest(activeRequest);
			requestQueueStore.removeExpired();

			const queue = get(requestQueueStore);
			expect(queue.length).toBe(1);
			expect(queue[0].id).toBe('active-1');
		});
	});

	describe('updateExpiredStatus', () => {
		it('should update expired pending requests to expired status', () => {
			const expiredRequest = createTimeSlotRequest({
				requestId: 'expired-1',
				expiresAt: now - 1000
			});
			const activeRequest = createTimeSlotRequest({
				requestId: 'active-1',
				expiresAt: now + 15 * 60 * 1000
			});

			requestQueueStore.addRequest(expiredRequest);
			requestQueueStore.addRequest(activeRequest);
			requestQueueStore.updateExpiredStatus();

			const queue = get(requestQueueStore);
			const expired = queue.find((item) => item.id === 'expired-1');
			const active = queue.find((item) => item.id === 'active-1');

			expect(expired?.status).toBe('expired');
			expect(active?.status).toBe('pending');
		});

		it('should not update non-pending requests', () => {
			const acceptedRequest = createTimeSlotRequest({
				requestId: 'accepted-1',
				expiresAt: now - 1000
			});

			requestQueueStore.addRequest(acceptedRequest);
			requestQueueStore.updateRequestStatus('accepted-1', 'accepted');
			requestQueueStore.updateExpiredStatus();

			const queue = get(requestQueueStore);
			expect(queue[0].status).toBe('accepted'); // Should remain accepted
		});
	});

	describe('derived stores', () => {
		it('pendingRequests should filter pending requests', () => {
			const request1 = createTimeSlotRequest({ requestId: 'request-1' });
			const request2 = createTimeSlotRequest({ requestId: 'request-2' });

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);
			requestQueueStore.updateRequestStatus('request-1', 'accepted');

			const pending = get(pendingRequests);
			expect(pending.length).toBe(1);
			expect(pending[0].id).toBe('request-2');
		});

		it('activeRequests should filter pending and accepted requests', () => {
			const request1 = createTimeSlotRequest({ requestId: 'request-1' });
			const request2 = createTimeSlotRequest({ requestId: 'request-2' });
			const request3 = createTimeSlotRequest({ requestId: 'request-3' });

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);
			requestQueueStore.addRequest(request3);
			requestQueueStore.updateRequestStatus('request-1', 'accepted');
			requestQueueStore.updateRequestStatus('request-2', 'expired');

			const active = get(activeRequests);
			expect(active.length).toBe(2);
			expect(active.some((item) => item.id === 'request-1')).toBe(true);
			expect(active.some((item) => item.id === 'request-3')).toBe(true);
		});

		it('requestQueueStats should calculate correct statistics', () => {
			const request1 = createTimeSlotRequest({ requestId: 'request-1' });
			const request2 = createTimeSlotRequest({ requestId: 'request-2' });
			const request3 = createTimeSlotRequest({ requestId: 'request-3' });

			requestQueueStore.addRequest(request1);
			requestQueueStore.addRequest(request2);
			requestQueueStore.addRequest(request3);
			requestQueueStore.updateRequestStatus('request-1', 'accepted');
			requestQueueStore.updateRequestStatus('request-2', 'expired');

			const stats = get(requestQueueStats);
			expect(stats.total).toBe(3);
			expect(stats.pending).toBe(1);
			expect(stats.accepted).toBe(1);
			expect(stats.expired).toBe(1);
		});
	});
});

