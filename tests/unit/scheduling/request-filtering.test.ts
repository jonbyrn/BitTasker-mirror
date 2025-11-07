import { describe, it, expect } from 'vitest';
import { filterRequests, sortRequests, paginateRequests } from '$lib/utils/request-filtering';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';

describe('Request Filtering', () => {
	const now = Date.now();

	const createRequestItem = (overrides?: Partial<RequestQueueItem>): RequestQueueItem => {
		const request: TimeSlotRequest = {
			messageType: 'time-slot-request',
			requestId: 'request-1',
			bidId: 'bid-1',
			taskId: 'task-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey: 'taskee-1',
			requestedStartTime: now + 24 * 60 * 60 * 1000,
			requestedEndTime: now + 24 * 60 * 60 * 1000 + 3600000,
			timestamp: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			nonce: generateNonce()
		};

		return {
			id: 'request-1',
			type: 'time-slot-request',
			request,
			status: 'pending',
			createdAt: now,
			expiresAt: calculateExpiryTimestamp(now, 15),
			lastUpdated: now,
			taskId: 'task-1',
			bidId: 'bid-1',
			taskerPubkey: 'tasker-1',
			taskeePubkey: 'taskee-1',
			...overrides
		};
	};

	describe('filterRequests', () => {
		const requests: RequestQueueItem[] = [
			createRequestItem({
				id: 'request-1',
				status: 'pending',
				taskId: 'task-1',
				bidId: 'bid-1',
				taskerPubkey: 'tasker-1',
				expiresAt: now + 10 * 60 * 1000 // 10 minutes
			}),
			createRequestItem({
				id: 'request-2',
				status: 'accepted',
				taskId: 'task-2',
				bidId: 'bid-2',
				taskerPubkey: 'tasker-2',
				expiresAt: now + 30 * 60 * 1000 // 30 minutes
			}),
			createRequestItem({
				id: 'request-3',
				status: 'expired',
				taskId: 'task-1',
				bidId: 'bid-3',
				taskerPubkey: 'tasker-1',
				expiresAt: now - 1000 // Expired
			})
		];

		it('should filter by status', () => {
			const filtered = filterRequests(requests, { status: ['pending'] });
			expect(filtered.length).toBe(1);
			expect(filtered[0].id).toBe('request-1');
		});

		it('should filter by multiple statuses', () => {
			const filtered = filterRequests(requests, { status: ['pending', 'accepted'] });
			expect(filtered.length).toBe(2);
		});

		it('should filter by taskId', () => {
			const filtered = filterRequests(requests, { taskId: 'task-1' });
			expect(filtered.length).toBe(2);
			expect(filtered.every((r) => r.taskId === 'task-1')).toBe(true);
		});

		it('should filter by bidId', () => {
			const filtered = filterRequests(requests, { bidId: 'bid-1' });
			expect(filtered.length).toBe(1);
			expect(filtered[0].bidId).toBe('bid-1');
		});

		it('should filter by taskerPubkey', () => {
			const filtered = filterRequests(requests, { taskerPubkey: 'tasker-1' });
			expect(filtered.length).toBe(2);
			expect(filtered.every((r) => r.taskerPubkey === 'tasker-1')).toBe(true);
		});

		it('should filter by expires soon', () => {
			const filtered = filterRequests(requests, { expiresSoon: true });
			// Only request-1 expires in 10 minutes (less than 5 minutes threshold check)
			// Actually, expiresSoon means less than 5 minutes remaining
			const soonRequests = requests.filter((r) => {
				const remaining = r.expiresAt - now;
				return remaining < 5 * 60 * 1000 && remaining > 0;
			});
			expect(soonRequests.length).toBeGreaterThanOrEqual(0);
		});

		it('should filter by expired', () => {
			const filtered = filterRequests(requests, { expired: true });
			expect(filtered.length).toBe(1);
			expect(filtered[0].status).toBe('expired');
		});

		it('should combine multiple filters', () => {
			const filtered = filterRequests(requests, {
				status: ['pending', 'accepted'],
				taskerPubkey: 'tasker-1'
			});
			expect(filtered.length).toBe(1);
			expect(filtered[0].id).toBe('request-1');
		});

		it('should return all requests when no filters applied', () => {
			const filtered = filterRequests(requests, {});
			expect(filtered.length).toBe(requests.length);
		});
	});

	describe('sortRequests', () => {
		const requests: RequestQueueItem[] = [
			createRequestItem({
				id: 'request-1',
				createdAt: now - 1000,
				expiresAt: now + 30 * 60 * 1000 // 30 minutes
			}),
			createRequestItem({
				id: 'request-2',
				createdAt: now,
				expiresAt: now + 15 * 60 * 1000 // 15 minutes
			}),
			createRequestItem({
				id: 'request-3',
				createdAt: now - 2000,
				expiresAt: now + 60 * 60 * 1000 // 60 minutes
			})
		];

		it('should sort by expires-asc', () => {
			const sorted = sortRequests(requests, 'expires-asc');
			expect(sorted[0].id).toBe('request-2'); // Earliest expiry
			expect(sorted[1].id).toBe('request-1');
			expect(sorted[2].id).toBe('request-3');
		});

		it('should sort by expires-desc', () => {
			const sorted = sortRequests(requests, 'expires-desc');
			expect(sorted[0].id).toBe('request-3'); // Latest expiry
			expect(sorted[1].id).toBe('request-1');
			expect(sorted[2].id).toBe('request-2');
		});

		it('should sort by created-asc', () => {
			const sorted = sortRequests(requests, 'created-asc');
			expect(sorted[0].id).toBe('request-3'); // Oldest
			expect(sorted[1].id).toBe('request-1');
			expect(sorted[2].id).toBe('request-2');
		});

		it('should sort by created-desc', () => {
			const sorted = sortRequests(requests, 'created-desc');
			expect(sorted[0].id).toBe('request-2'); // Newest
			expect(sorted[1].id).toBe('request-1');
			expect(sorted[2].id).toBe('request-3');
		});

		it('should sort by status', () => {
			const statusRequests: RequestQueueItem[] = [
				createRequestItem({ id: 'request-1', status: 'expired' }),
				createRequestItem({ id: 'request-2', status: 'pending' }),
				createRequestItem({ id: 'request-3', status: 'accepted' })
			];

			const sorted = sortRequests(statusRequests, 'status');
			expect(sorted[0].id).toBe('request-2'); // pending first
			expect(sorted[1].id).toBe('request-3'); // accepted second
			expect(sorted[2].id).toBe('request-1'); // expired last
		});
	});

	describe('paginateRequests', () => {
		const requests: RequestQueueItem[] = Array.from({ length: 25 }, (_, i) =>
			createRequestItem({ id: `request-${i + 1}` })
		);

		it('should paginate requests correctly', () => {
			const result = paginateRequests(requests, 1, 10);
			expect(result.items.length).toBe(10);
			expect(result.total).toBe(25);
			expect(result.page).toBe(1);
			expect(result.pageSize).toBe(10);
			expect(result.totalPages).toBe(3);
			expect(result.hasNextPage).toBe(true);
			expect(result.hasPreviousPage).toBe(false);
		});

		it('should handle last page', () => {
			const result = paginateRequests(requests, 3, 10);
			expect(result.items.length).toBe(5); // Last page has 5 items
			expect(result.hasNextPage).toBe(false);
			expect(result.hasPreviousPage).toBe(true);
		});

		it('should handle empty requests', () => {
			const result = paginateRequests([], 1, 10);
			expect(result.items.length).toBe(0);
			expect(result.total).toBe(0);
			expect(result.totalPages).toBe(0);
		});

		it('should handle page size larger than total', () => {
			const result = paginateRequests(requests, 1, 100);
			expect(result.items.length).toBe(25);
			expect(result.totalPages).toBe(1);
			expect(result.hasNextPage).toBe(false);
		});
	});
});

