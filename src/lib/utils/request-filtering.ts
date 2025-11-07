import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { RequestStatus } from '$lib/types/scheduling';

/**
 * Filter options for request queue
 */
export interface RequestFilterOptions {
	status?: RequestStatus[];
	type?: ('time-slot-request' | 'soonest-available-request')[];
	taskId?: string;
	bidId?: string;
	taskerPubkey?: string;
	expiresSoon?: boolean; // Less than 5 minutes remaining
	expired?: boolean;
}

/**
 * Sort options for request queue
 */
export type RequestSortOption =
	| 'expires-asc' // Earliest expiry first
	| 'expires-desc' // Latest expiry first
	| 'created-asc' // Oldest first
	| 'created-desc' // Newest first
	| 'status'; // Group by status

/**
 * Filter requests based on options
 */
export function filterRequests(
	requests: RequestQueueItem[],
	options: RequestFilterOptions
): RequestQueueItem[] {
	const now = Date.now();

	return requests.filter((request) => {
		// Filter by status
		if (options.status && !options.status.includes(request.status)) {
			return false;
		}

		// Filter by type
		if (options.type && !options.type.includes(request.type)) {
			return false;
		}

		// Filter by taskId
		if (options.taskId && request.taskId !== options.taskId) {
			return false;
		}

		// Filter by bidId
		if (options.bidId && request.bidId !== options.bidId) {
			return false;
		}

		// Filter by taskerPubkey
		if (options.taskerPubkey && request.taskerPubkey !== options.taskerPubkey) {
			return false;
		}

		// Filter by expires soon (less than 5 minutes)
		if (options.expiresSoon !== undefined) {
			const remaining = request.expiresAt - now;
			const expiresSoon = remaining < 5 * 60 * 1000 && remaining > 0;
			if (options.expiresSoon !== expiresSoon) {
				return false;
			}
		}

		// Filter by expired
		if (options.expired !== undefined) {
			const isExpired = request.expiresAt <= now;
			if (options.expired !== isExpired) {
				return false;
			}
		}

		return true;
	});
}

/**
 * Sort requests based on option
 */
export function sortRequests(
	requests: RequestQueueItem[],
	sortOption: RequestSortOption
): RequestQueueItem[] {
	const sorted = [...requests];

	switch (sortOption) {
		case 'expires-asc':
			return sorted.sort((a, b) => a.expiresAt - b.expiresAt);

		case 'expires-desc':
			return sorted.sort((a, b) => b.expiresAt - a.expiresAt);

		case 'created-asc':
			return sorted.sort((a, b) => a.createdAt - b.createdAt);

		case 'created-desc':
			return sorted.sort((a, b) => b.createdAt - a.createdAt);

		case 'status':
			// Group by status: pending first, then accepted, then others
			const statusOrder: Record<RequestStatus, number> = {
				pending: 0,
				accepted: 1,
				confirmed: 2,
				expired: 3,
				cancelled: 4,
				rejected: 5
			};
			return sorted.sort((a, b) => {
				const statusDiff = statusOrder[a.status] - statusOrder[b.status];
				if (statusDiff !== 0) return statusDiff;
				// Within same status, sort by expiry
				return a.expiresAt - b.expiresAt;
			});

		default:
			return sorted;
	}
}

/**
 * Paginate requests
 */
export function paginateRequests(
	requests: RequestQueueItem[],
	page: number,
	pageSize: number
): {
	items: RequestQueueItem[];
	total: number;
	page: number;
	pageSize: number;
	totalPages: number;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
} {
	const total = requests.length;
	const totalPages = Math.ceil(total / pageSize);
	const startIndex = (page - 1) * pageSize;
	const endIndex = startIndex + pageSize;
	const items = requests.slice(startIndex, endIndex);

	return {
		items,
		total,
		page,
		pageSize,
		totalPages,
		hasNextPage: page < totalPages,
		hasPreviousPage: page > 1
	};
}

