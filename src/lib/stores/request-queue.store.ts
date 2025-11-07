import { writable, derived, get } from 'svelte/store';
import type {
	TimeSlotRequest,
	SoonestAvailableRequest,
	RequestStatus,
	SchedulingMessage
} from '$lib/types/scheduling';
import { isRequestExpired, getRemainingTime } from '$lib/utils/scheduling-utils';

/**
 * Request queue item combining both request types
 */
export interface RequestQueueItem {
	id: string; // requestId
	type: 'time-slot-request' | 'soonest-available-request';
	request: TimeSlotRequest | SoonestAvailableRequest;
	status: RequestStatus;
	createdAt: number;
	expiresAt: number;
	lastUpdated: number;
	// Additional metadata
	taskId: string;
	bidId: string;
	taskerPubkey: string;
	taskeePubkey: string;
	// Status tracking
	acceptedTime?: {
		startTime: number;
		endTime: number;
	};
	escrowId?: string;
	confirmationTime?: number;
}

/**
 * Request queue store
 */
function createRequestQueueStore() {
	const { subscribe, set, update } = writable<RequestQueueItem[]>([]);

	return {
		subscribe,

		/**
		 * Add a new request to the queue
		 */
		addRequest(request: TimeSlotRequest | SoonestAvailableRequest): void {
			const item: RequestQueueItem = {
				id: request.requestId,
				type: request.messageType,
				request,
				status: 'pending',
				createdAt: request.timestamp,
				expiresAt: request.expiresAt,
				lastUpdated: request.timestamp,
				taskId: request.taskId,
				bidId: request.bidId,
				taskerPubkey: request.taskerPubkey,
				taskeePubkey: request.taskeePubkey
			};

			update((queue) => {
				// Remove if already exists (replace)
				const filtered = queue.filter((item) => item.id !== request.requestId);
				return [...filtered, item].sort((a, b) => a.expiresAt - b.expiresAt);
			});
		},

		/**
		 * Update request status
		 */
		updateRequestStatus(
			requestId: string,
			status: RequestStatus,
			metadata?: {
				acceptedTime?: { startTime: number; endTime: number };
				escrowId?: string;
				confirmationTime?: number;
			}
		): void {
			update((queue) =>
				queue.map((item) => {
					if (item.id === requestId) {
						return {
							...item,
							status,
							lastUpdated: Date.now(),
							...(metadata?.acceptedTime && { acceptedTime: metadata.acceptedTime }),
							...(metadata?.escrowId && { escrowId: metadata.escrowId }),
							...(metadata?.confirmationTime && { confirmationTime: metadata.confirmationTime })
						};
					}
					return item;
				})
			);
		},

		/**
		 * Remove request from queue
		 */
		removeRequest(requestId: string): void {
			update((queue) => queue.filter((item) => item.id !== requestId));
		},

		/**
		 * Get request by ID
		 */
		getRequest(requestId: string): RequestQueueItem | undefined {
			const queue = get({ subscribe });
			return queue.find((item) => item.id === requestId);
		},

		/**
		 * Get all requests
		 */
		getAllRequests(): RequestQueueItem[] {
			return get({ subscribe });
		},

		/**
		 * Archive old requests (>24 hours old)
		 */
		archiveOldRequests(): RequestQueueItem[] {
			const now = Date.now();
			const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

			let archived: RequestQueueItem[] = [];

			update((queue) => {
				const active: RequestQueueItem[] = [];
				archived = [];

				for (const item of queue) {
					if (item.createdAt < twentyFourHoursAgo && item.status !== 'pending') {
						archived.push(item);
					} else {
						active.push(item);
					}
				}

				return active;
			});

			return archived;
		},

		/**
		 * Get archived requests (for display/history)
		 */
		getArchivedRequests(archived: RequestQueueItem[]): RequestQueueItem[] {
			return archived.filter((item) => {
				const now = Date.now();
				const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
				return item.createdAt < twentyFourHoursAgo && item.status !== 'pending';
			});
		},

		/**
		 * Clear all requests
		 */
		clear(): void {
			set([]);
		},

		/**
		 * Remove expired requests
		 */
		removeExpired(): void {
			const now = Date.now();
			update((queue) => queue.filter((item) => !isRequestExpired(item.expiresAt, now)));
		},

		/**
		 * Update expired requests status
		 */
		updateExpiredStatus(): void {
			const now = Date.now();
			update((queue) =>
				queue.map((item) => {
					if (item.status === 'pending' && isRequestExpired(item.expiresAt, now)) {
						return {
							...item,
							status: 'expired',
							lastUpdated: now
						};
					}
					return item;
				})
			);
		}
	};
}

export const requestQueueStore = createRequestQueueStore();

/**
 * Derived stores for filtered views
 */
export const pendingRequests = derived(requestQueueStore, ($queue) =>
	$queue.filter((item) => item.status === 'pending')
);

export const activeRequests = derived(requestQueueStore, ($queue) =>
	$queue.filter((item) => ['pending', 'accepted'].includes(item.status))
);

export const expiredRequests = derived(requestQueueStore, ($queue) =>
	$queue.filter((item) => item.status === 'expired')
);

export const cancelledRequests = derived(requestQueueStore, ($queue) =>
	$queue.filter((item) => item.status === 'cancelled')
);

export const confirmedRequests = derived(requestQueueStore, ($queue) =>
	$queue.filter((item) => item.status === 'confirmed')
);

/**
 * Request queue statistics
 */
export const requestQueueStats = derived(requestQueueStore, ($queue) => {
	const now = Date.now();
	return {
		total: $queue.length,
		pending: $queue.filter((item) => item.status === 'pending').length,
		accepted: $queue.filter((item) => item.status === 'accepted').length,
		expired: $queue.filter((item) => item.status === 'expired').length,
		cancelled: $queue.filter((item) => item.status === 'cancelled').length,
		confirmed: $queue.filter((item) => item.status === 'confirmed').length,
		expiringSoon: $queue.filter(
			(item) => item.status === 'pending' && getRemainingTime(item.expiresAt, now) < 5 * 60 * 1000
		).length // Less than 5 minutes remaining
	};
});

