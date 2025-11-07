/**
 * Performance utilities for request queue
 * Includes pagination, virtual scrolling helpers, and performance monitoring
 */

import type { RequestQueueItem } from '$lib/stores/request-queue.store';

export interface PaginationOptions {
	page: number;
	pageSize: number;
}

export interface PaginationResult<T> {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNext: boolean;
	hasPrevious: boolean;
}

export interface VirtualScrollOptions {
	containerHeight: number;
	itemHeight: number;
	overscan?: number; // Number of items to render outside visible area
}

export interface VirtualScrollResult {
	visibleItems: RequestQueueItem[];
	startIndex: number;
	endIndex: number;
	totalHeight: number;
	offsetY: number;
}

/**
 * Paginate a list of requests
 */
export function paginateRequests<T>(
	items: T[],
	options: PaginationOptions
): PaginationResult<T> {
	const { page, pageSize } = options;
	const total = items.length;
	const totalPages = Math.ceil(total / pageSize);
	const startIndex = (page - 1) * pageSize;
	const endIndex = Math.min(startIndex + pageSize, total);
	const paginatedItems = items.slice(startIndex, endIndex);

	return {
		items: paginatedItems,
		total,
		page,
		pageSize,
		totalPages,
		hasNext: page < totalPages,
		hasPrevious: page > 1
	};
}

/**
 * Calculate virtual scroll visible items
 */
export function calculateVirtualScroll(
	items: RequestQueueItem[],
	scrollTop: number,
	options: VirtualScrollOptions
): VirtualScrollResult {
	const { containerHeight, itemHeight, overscan = 3 } = options;

	// Calculate visible range
	const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
	const endIndex = Math.min(
		items.length,
		Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
	);

	const visibleItems = items.slice(startIndex, endIndex);
	const totalHeight = items.length * itemHeight;
	const offsetY = startIndex * itemHeight;

	return {
		visibleItems,
		startIndex,
		endIndex,
		totalHeight,
		offsetY
	};
}

/**
 * Performance monitor for queue operations
 */
export class QueuePerformanceMonitor {
	private metrics: {
		operation: string;
		duration: number;
		itemCount: number;
		timestamp: number;
	}[] = [];
	private readonly maxMetrics = 100;

	/**
	 * Measure operation performance
	 */
	measure<T>(
		operation: string,
		itemCount: number,
		fn: () => T
	): T {
		const start = performance.now();
		const result = fn();
		const duration = performance.now() - start;

		this.addMetric({
			operation,
			duration,
			itemCount,
			timestamp: Date.now()
		});

		return result;
	}

	/**
	 * Add performance metric
	 */
	addMetric(metric: {
		operation: string;
		duration: number;
		itemCount: number;
		timestamp: number;
	}): void {
		this.metrics.push(metric);
		if (this.metrics.length > this.maxMetrics) {
			this.metrics.shift();
		}
	}

	/**
	 * Get average performance for an operation
	 */
	getAveragePerformance(operation: string): {
		avgDuration: number;
		avgItemCount: number;
		count: number;
	} {
		const operationMetrics = this.metrics.filter((m) => m.operation === operation);
		if (operationMetrics.length === 0) {
			return { avgDuration: 0, avgItemCount: 0, count: 0 };
		}

		const totalDuration = operationMetrics.reduce((sum, m) => sum + m.duration, 0);
		const totalItemCount = operationMetrics.reduce((sum, m) => sum + m.itemCount, 0);

		return {
			avgDuration: totalDuration / operationMetrics.length,
			avgItemCount: totalItemCount / operationMetrics.length,
			count: operationMetrics.length
		};
	}

	/**
	 * Get all metrics
	 */
	getMetrics(): typeof this.metrics {
		return [...this.metrics];
	}

	/**
	 * Clear metrics
	 */
	clear(): void {
		this.metrics = [];
	}
}

// Global performance monitor instance
export const queuePerformanceMonitor = new QueuePerformanceMonitor();

/**
 * Debounce function for availability updates
 */
export function createDebouncedFunction<T extends (...args: any[]) => any>(
	fn: T,
	delay: number = 300
): (...args: Parameters<T>) => void {
	let timeoutId: number | null = null;

	return (...args: Parameters<T>) => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}

		timeoutId = setTimeout(() => {
			fn(...args);
			timeoutId = null;
		}, delay) as unknown as number;
	};
}

/**
 * Throttle function for scroll events
 */
export function createThrottledFunction<T extends (...args: any[]) => any>(
	fn: T,
	delay: number = 100
): (...args: Parameters<T>) => void {
	let lastCall = 0;
	let timeoutId: number | null = null;

	return (...args: Parameters<T>) => {
		const now = Date.now();

		if (now - lastCall >= delay) {
			lastCall = now;
			fn(...args);
		} else {
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
			timeoutId = setTimeout(() => {
				lastCall = Date.now();
				fn(...args);
				timeoutId = null;
			}, delay - (now - lastCall)) as unknown as number;
		}
	};
}

