import type { Notification } from '$lib/stores/notification.store';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import { get } from 'svelte/store';
import { requestQueueStore } from '$lib/stores/request-queue.store';

/**
 * Scheduling-specific notification types
 */
export type SchedulingNotificationType =
	| 'scheduling_new_request'
	| 'scheduling_request_accepted'
	| 'scheduling_escrow_funded'
	| 'scheduling_slot_confirmed'
	| 'scheduling_request_cancelled'
	| 'scheduling_request_expired'
	| 'scheduling_conflict'
	| 'scheduling_best_offer'
	| 'scheduling_availability_updated';

/**
 * Batched notification group
 */
export interface BatchedNotificationGroup {
	id: string;
	type: SchedulingNotificationType;
	priority: number; // Higher = more important
	notifications: Notification[];
	timeSlot?: {
		startTime: number;
		endTime: number;
	};
	createdAt: Date;
}

/**
 * Notification batching service
 */
class NotificationBatchingService {
	private batchWindowMs = 5000; // 5 seconds
	private batches = new Map<string, BatchedNotificationGroup>();
	private batchTimeouts = new Map<string, NodeJS.Timeout>();

	/**
	 * Priority levels for scheduling notifications
	 */
	private readonly PRIORITIES: Record<SchedulingNotificationType, number> = {
		scheduling_escrow_funded: 100, // Highest priority
		scheduling_conflict: 90,
		scheduling_best_offer: 80,
		scheduling_request_accepted: 70,
		scheduling_slot_confirmed: 60,
		scheduling_availability_updated: 50,
		scheduling_request_cancelled: 40,
		scheduling_request_expired: 30,
		scheduling_new_request: 20 // Lowest priority
	};

	/**
	 * Add notification to batch
	 */
	addToBatch(notification: Notification, type: SchedulingNotificationType): void {
		// Create batch key based on type and time slot (if applicable)
		const batchKey = this.getBatchKey(type, notification);

		// Get or create batch
		let batch = this.batches.get(batchKey);
		if (!batch) {
			batch = {
				id: batchKey,
				type,
				priority: this.PRIORITIES[type],
				notifications: [],
				createdAt: new Date()
			};

			// Extract time slot from notification data if available
			if (notification.data?.timeSlot) {
				batch.timeSlot = notification.data.timeSlot;
			}

			this.batches.set(batchKey, batch);
		}

		// Add notification to batch (deduplicate by ID)
		if (!batch.notifications.find((n) => n.id === notification.id)) {
			batch.notifications.push(notification);
		}

		// Update priority if this notification has higher priority
		const notificationPriority = this.PRIORITIES[type];
		if (notificationPriority > batch.priority) {
			batch.priority = notificationPriority;
		}

		// Reset batch timeout
		this.resetBatchTimeout(batchKey);
	}

	/**
	 * Get batch key for grouping
	 */
	private getBatchKey(type: SchedulingNotificationType, notification: Notification): string {
		// Group by type and time slot if available
		if (notification.data?.timeSlot) {
			const timeSlot = notification.data.timeSlot;
			return `${type}-${timeSlot.startTime}-${timeSlot.endTime}`;
		}

		// Group by type and request ID if available
		if (notification.data?.requestId) {
			return `${type}-${notification.data.requestId}`;
		}

		// Default: group by type
		return type;
	}

	/**
	 * Reset batch timeout - batches are flushed after batchWindowMs
	 */
	private resetBatchTimeout(batchKey: string): void {
		// Clear existing timeout
		const existingTimeout = this.batchTimeouts.get(batchKey);
		if (existingTimeout) {
			clearTimeout(existingTimeout);
		}

		// Set new timeout
		const timeout = setTimeout(() => {
			this.flushBatch(batchKey);
		}, this.batchWindowMs);

		this.batchTimeouts.set(batchKey, timeout);
	}

	/**
	 * Flush a specific batch
	 */
	flushBatch(batchKey: string): BatchedNotificationGroup | null {
		const batch = this.batches.get(batchKey);
		if (!batch) return null;

		// Clear timeout
		const timeout = this.batchTimeouts.get(batchKey);
		if (timeout) {
			clearTimeout(timeout);
			this.batchTimeouts.delete(batchKey);
		}

		// Remove from batches
		this.batches.delete(batchKey);

		return batch;
	}

	/**
	 * Flush all batches
	 */
	flushAll(): BatchedNotificationGroup[] {
		const allBatches: BatchedNotificationGroup[] = [];

		// Clear all timeouts
		this.batchTimeouts.forEach((timeout) => clearTimeout(timeout));
		this.batchTimeouts.clear();

		// Flush all batches
		for (const [batchKey] of this.batches) {
			const batch = this.flushBatch(batchKey);
			if (batch) {
				allBatches.push(batch);
			}
		}

		// Sort by priority (highest first)
		return allBatches.sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Get all current batches sorted by priority
	 */
	getBatches(): BatchedNotificationGroup[] {
		return Array.from(this.batches.values()).sort((a, b) => b.priority - a.priority);
	}

	/**
	 * Clear all batches
	 */
	clear(): void {
		this.batchTimeouts.forEach((timeout) => clearTimeout(timeout));
		this.batchTimeouts.clear();
		this.batches.clear();
	}
}

export const notificationBatchingService = new NotificationBatchingService();

/**
 * Create scheduling notification from request queue item
 */
export function createSchedulingNotification(
	request: RequestQueueItem,
	type: SchedulingNotificationType,
	additionalData?: Record<string, any>
): Omit<Notification, 'id' | 'createdAt' | 'delivered' | 'read'> {
	const baseNotification = {
		userId: request.taskeePubkey, // For taskee notifications
		type: 'scheduling' as const,
		priority: getNotificationPriority(type),
		data: {
			requestId: request.id,
			bidId: request.bidId,
			taskId: request.taskId,
			taskerPubkey: request.taskerPubkey,
			taskeePubkey: request.taskeePubkey,
			...additionalData
		}
	};

	switch (type) {
		case 'scheduling_new_request':
			return {
				...baseNotification,
				title: 'New Time Slot Request',
				body: `You have a new time slot request for task ${request.taskId}`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		case 'scheduling_request_accepted':
			return {
				...baseNotification,
				title: 'Request Accepted',
				body: `Your time slot request has been accepted`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		case 'scheduling_escrow_funded':
			return {
				...baseNotification,
				title: 'Escrow Funded',
				body: `Escrow has been funded for your accepted request`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		case 'scheduling_slot_confirmed':
			return {
				...baseNotification,
				title: 'Slot Confirmed',
				body: `Your time slot has been confirmed`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		case 'scheduling_request_cancelled':
			return {
				...baseNotification,
				title: 'Request Cancelled',
				body: `A time slot request has been cancelled`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests`
				}
			};

		case 'scheduling_request_expired':
			return {
				...baseNotification,
				title: 'Request Expired',
				body: `A time slot request has expired`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests`
				}
			};

		case 'scheduling_conflict':
			return {
				...baseNotification,
				title: 'Scheduling Conflict',
				body: `Multiple requests for the same time slot`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/conflicts`
				}
			};

		case 'scheduling_best_offer':
			return {
				...baseNotification,
				title: 'Better Offer Available',
				body: `A better offer is available for this time slot`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		case 'scheduling_availability_updated':
			return {
				...baseNotification,
				title: 'Availability Updated',
				body: `Taskee availability has been updated`,
				action: {
					type: 'navigation',
					payload: `/dashboard/scheduling/requests/${request.id}`
				}
			};

		default:
			return {
				...baseNotification,
				title: 'Scheduling Update',
				body: `Scheduling update for request ${request.id}`
			};
	}
}

/**
 * Get notification priority based on type
 */
function getNotificationPriority(type: SchedulingNotificationType): 'low' | 'normal' | 'high' | 'urgent' {
	switch (type) {
		case 'scheduling_escrow_funded':
			return 'urgent';
		case 'scheduling_conflict':
		case 'scheduling_best_offer':
			return 'high';
		case 'scheduling_request_accepted':
		case 'scheduling_slot_confirmed':
			return 'normal';
		default:
			return 'low';
	}
}

/**
 * Check if notification should be shown based on quiet hours
 */
export function shouldShowNotification(
	notification: Notification,
	quietHours?: { start: number; end: number } // Hours 0-23
): boolean {
	if (!quietHours) return true;

	const now = new Date();
	const currentHour = now.getHours();

	// Handle quiet hours that span midnight (e.g., 22:00 - 06:00)
	if (quietHours.start > quietHours.end) {
		// Quiet hours span midnight
		return !(currentHour >= quietHours.start || currentHour < quietHours.end);
	} else {
		// Normal quiet hours
		return !(currentHour >= quietHours.start && currentHour < quietHours.end);
	}
}

/**
 * Deduplicate notifications by checking for similar content
 */
export function deduplicateNotifications(notifications: Notification[]): Notification[] {
	const seen = new Set<string>();
	const deduplicated: Notification[] = [];

	for (const notification of notifications) {
		// Create a key based on type and relevant data
		const key = createNotificationKey(notification);
		if (!seen.has(key)) {
			seen.add(key);
			deduplicated.push(notification);
		}
	}

	return deduplicated;
}

/**
 * Create a unique key for notification deduplication
 */
function createNotificationKey(notification: Notification): string {
	const parts = [notification.type, notification.userId];

	// Add request-specific data if available
	if (notification.data?.requestId) {
		parts.push(notification.data.requestId);
	}

	// Add time slot if available
	if (notification.data?.timeSlot) {
		parts.push(`${notification.data.timeSlot.startTime}-${notification.data.timeSlot.endTime}`);
	}

	// Add timestamp (rounded to minute for deduplication window)
	const timestamp = Math.floor(notification.createdAt.getTime() / (60 * 1000));
	parts.push(timestamp.toString());

	return parts.join('-');
}

