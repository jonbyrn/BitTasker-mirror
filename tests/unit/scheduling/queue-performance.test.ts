import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
	paginateRequests,
	calculateVirtualScroll,
	QueuePerformanceMonitor,
	createDebouncedFunction,
	createThrottledFunction
} from '$lib/utils/queue-performance';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';

describe('Queue Performance', () => {
	const now = Date.now();
	const oneHour = 60 * 60 * 1000;

	function createRequest(id: string): RequestQueueItem {
		return {
			id,
			bidId: `bid-${id}`,
			taskId: `task-${id}`,
			taskerPubkey: `tasker-${id}`,
			taskeePubkey: 'taskee',
			type: 'time-slot-request',
			status: 'pending',
			createdAt: now,
			expiresAt: now + 15 * 60 * 1000,
			lastUpdated: now,
			request: {
				messageType: 'time-slot-request',
				requestId: id,
				bidId: `bid-${id}`,
				taskId: `task-${id}`,
				taskerPubkey: `tasker-${id}`,
				taskeePubkey: 'taskee',
				requestedStartTime: now + oneHour,
				requestedEndTime: now + 2 * oneHour,
				timestamp: now,
				expiresAt: now + 15 * 60 * 1000,
				nonce: `nonce-${id}`
			} as TimeSlotRequest
		};
	}

	describe('paginateRequests', () => {
		it('should paginate requests correctly', () => {
			const requests = Array.from({ length: 25 }, (_, i) => createRequest(`req-${i}`));
			const result = paginateRequests(requests, { page: 1, pageSize: 10 });

			expect(result.items.length).toBe(10);
			expect(result.total).toBe(25);
			expect(result.page).toBe(1);
			expect(result.totalPages).toBe(3);
			expect(result.hasNext).toBe(true);
			expect(result.hasPrevious).toBe(false);
		});

		it('should handle last page correctly', () => {
			const requests = Array.from({ length: 25 }, (_, i) => createRequest(`req-${i}`));
			const result = paginateRequests(requests, { page: 3, pageSize: 10 });

			expect(result.items.length).toBe(5);
			expect(result.hasNext).toBe(false);
			expect(result.hasPrevious).toBe(true);
		});

		it('should handle empty list', () => {
			const result = paginateRequests([], { page: 1, pageSize: 10 });

			expect(result.items.length).toBe(0);
			expect(result.total).toBe(0);
			expect(result.totalPages).toBe(0);
		});
	});

	describe('calculateVirtualScroll', () => {
		it('should calculate visible items correctly', () => {
			const requests = Array.from({ length: 100 }, (_, i) => createRequest(`req-${i}`));
			const result = calculateVirtualScroll(requests, 0, {
				containerHeight: 500,
				itemHeight: 100,
				overscan: 2
			});

			expect(result.visibleItems.length).toBeGreaterThan(0);
			expect(result.startIndex).toBe(0);
			expect(result.totalHeight).toBe(10000); // 100 items * 100px
		});

		it('should handle scrolling', () => {
			const requests = Array.from({ length: 100 }, (_, i) => createRequest(`req-${i}`));
			const result = calculateVirtualScroll(requests, 1000, {
				containerHeight: 500,
				itemHeight: 100,
				overscan: 2
			});

			expect(result.startIndex).toBeGreaterThan(0);
			expect(result.offsetY).toBeGreaterThan(0);
		});

		it('should include overscan items', () => {
			const requests = Array.from({ length: 100 }, (_, i) => createRequest(`req-${i}`));
			const result = calculateVirtualScroll(requests, 0, {
				containerHeight: 500,
				itemHeight: 100,
				overscan: 5
			});

			// Should include overscan items before visible area
			expect(result.startIndex).toBe(0); // Overscan doesn't go negative
		});
	});

	describe('QueuePerformanceMonitor', () => {
		let monitor: QueuePerformanceMonitor;

		beforeEach(() => {
			monitor = new QueuePerformanceMonitor();
		});

		it('should measure operation performance', () => {
			const result = monitor.measure('test-operation', 10, () => {
				return 'result';
			});

			expect(result).toBe('result');
			const metrics = monitor.getMetrics();
			expect(metrics.length).toBe(1);
			expect(metrics[0].operation).toBe('test-operation');
			expect(metrics[0].itemCount).toBe(10);
		});

		it('should calculate average performance', () => {
			monitor.measure('test-op', 10, () => {});
			monitor.measure('test-op', 20, () => {});
			monitor.measure('test-op', 30, () => {});

			const avg = monitor.getAveragePerformance('test-op');
			expect(avg.count).toBe(3);
			expect(avg.avgItemCount).toBe(20);
		});

		it('should limit metrics history', () => {
			for (let i = 0; i < 150; i++) {
				monitor.addMetric({
					operation: 'test',
					duration: 10,
					itemCount: 10,
					timestamp: Date.now()
				});
			}

			const metrics = monitor.getMetrics();
			expect(metrics.length).toBe(100); // Max metrics
		});
	});

	describe('createDebouncedFunction', () => {
		it('should debounce function calls', async () => {
			const fn = vi.fn();
			const debounced = createDebouncedFunction(fn, 100);

			debounced();
			debounced();
			debounced();

			expect(fn).not.toHaveBeenCalled();

			await new Promise((resolve) => setTimeout(resolve, 150));

			expect(fn).toHaveBeenCalledTimes(1);
		});
	});

	describe('createThrottledFunction', () => {
		it('should throttle function calls', async () => {
			const fn = vi.fn();
			const throttled = createThrottledFunction(fn, 100);

			throttled();
			throttled();
			throttled();

			// First call should execute immediately
			expect(fn).toHaveBeenCalledTimes(1);

			await new Promise((resolve) => setTimeout(resolve, 150));

			// Should have executed at least one more time
			expect(fn).toHaveBeenCalledTimes(2);
		});
	});
});

