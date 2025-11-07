import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
	notificationBatchingService,
	createSchedulingNotification,
	shouldShowNotification,
	deduplicateNotifications
} from '$lib/services/notification-batching.service';
import type { Notification } from '$lib/stores/notification.store';
import type { RequestQueueItem } from '$lib/stores/request-queue.store';
import type { TimeSlotRequest } from '$lib/types/scheduling';
import { calculateExpiryTimestamp, generateNonce } from '$lib/utils/scheduling-utils';

describe('Notification Batching Service', () => {
	beforeEach(() => {
		notificationBatchingService.clear();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('addToBatch', () => {
		it('should add notification to batch', () => {
			const notification: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notification, 'scheduling_new_request');

			const batches = notificationBatchingService.getBatches();
			expect(batches.length).toBe(1);
			expect(batches[0].notifications.length).toBe(1);
			expect(batches[0].notifications[0].id).toBe('notif-1');
		});

		it('should group notifications by type', () => {
			const notif1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Body 1',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			const notif2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Body 2',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notif1, 'scheduling_new_request');
			notificationBatchingService.addToBatch(notif2, 'scheduling_new_request');

			const batches = notificationBatchingService.getBatches();
			expect(batches.length).toBe(1);
			expect(batches[0].notifications.length).toBe(2);
		});

		it('should group notifications by time slot', () => {
			const timeSlot = {
				startTime: 1000000,
				endTime: 2000000
			};

			const notif1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Body 1',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(),
				data: { timeSlot }
			};

			const notif2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Body 2',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(),
				data: { timeSlot }
			};

			notificationBatchingService.addToBatch(notif1, 'scheduling_conflict');
			notificationBatchingService.addToBatch(notif2, 'scheduling_conflict');

			const batches = notificationBatchingService.getBatches();
			expect(batches.length).toBe(1);
			expect(batches[0].timeSlot).toEqual(timeSlot);
		});

		it('should deduplicate notifications by ID', () => {
			const notification: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notification, 'scheduling_new_request');
			notificationBatchingService.addToBatch(notification, 'scheduling_new_request'); // Duplicate

			const batches = notificationBatchingService.getBatches();
			expect(batches[0].notifications.length).toBe(1);
		});

		it('should update priority to highest in batch', () => {
			const notif1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Body 1',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			const notif2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Body 2',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notif1, 'scheduling_new_request'); // Priority 20
			notificationBatchingService.addToBatch(notif2, 'scheduling_escrow_funded'); // Priority 100

			const batches = notificationBatchingService.getBatches();
			// Should create separate batches due to different types
			expect(batches.length).toBe(2);
			// Escrow funded should have higher priority
			const escrowBatch = batches.find((b) => b.type === 'scheduling_escrow_funded');
			expect(escrowBatch?.priority).toBe(100);
		});
	});

	describe('flushBatch', () => {
		it('should flush a specific batch', () => {
			const notification: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notification, 'scheduling_new_request');
			const batches = notificationBatchingService.getBatches();
			const batchId = batches[0].id;

			const flushed = notificationBatchingService.flushBatch(batchId);
			expect(flushed).not.toBeNull();
			expect(flushed?.notifications.length).toBe(1);

			const remainingBatches = notificationBatchingService.getBatches();
			expect(remainingBatches.length).toBe(0);
		});

		it('should flush all batches', () => {
			const notif1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Body 1',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			const notif2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Body 2',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notif1, 'scheduling_new_request');
			notificationBatchingService.addToBatch(notif2, 'scheduling_conflict');

			const flushed = notificationBatchingService.flushAll();
			expect(flushed.length).toBe(2);

			const remainingBatches = notificationBatchingService.getBatches();
			expect(remainingBatches.length).toBe(0);
		});
	});

	describe('getBatches', () => {
		it('should return batches sorted by priority', () => {
			const notif1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Body 1',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			const notif2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Body 2',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date()
			};

			notificationBatchingService.addToBatch(notif1, 'scheduling_new_request'); // Priority 20
			notificationBatchingService.addToBatch(notif2, 'scheduling_escrow_funded'); // Priority 100

			const batches = notificationBatchingService.getBatches();
			expect(batches.length).toBe(2);
			expect(batches[0].type).toBe('scheduling_escrow_funded'); // Higher priority first
			expect(batches[1].type).toBe('scheduling_new_request');
		});
	});

	describe('createSchedulingNotification', () => {
		const createMockRequest = (): RequestQueueItem => {
			const request: TimeSlotRequest = {
				messageType: 'time-slot-request',
				requestId: 'request-1',
				bidId: 'bid-1',
				taskId: 'task-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee',
				requestedStartTime: Date.now() + 24 * 60 * 60 * 1000,
				requestedEndTime: Date.now() + 24 * 60 * 60 * 1000 + 3600000,
				timestamp: Date.now(),
				expiresAt: calculateExpiryTimestamp(Date.now(), 15),
				nonce: generateNonce()
			};

			return {
				id: 'request-1',
				type: 'time-slot-request',
				request,
				status: 'pending',
				createdAt: Date.now(),
				expiresAt: calculateExpiryTimestamp(Date.now(), 15),
				lastUpdated: Date.now(),
				taskId: 'task-1',
				bidId: 'bid-1',
				taskerPubkey: 'tasker',
				taskeePubkey: 'taskee'
			};
		};

		it('should create new request notification', () => {
			const request = createMockRequest();
			const notification = createSchedulingNotification(request, 'scheduling_new_request');

			expect(notification.title).toContain('New Time Slot Request');
			expect(notification.data?.requestId).toBe('request-1');
			expect(notification.priority).toBe('low');
		});

		it('should create escrow funded notification with urgent priority', () => {
			const request = createMockRequest();
			const notification = createSchedulingNotification(request, 'scheduling_escrow_funded', {
				escrowId: 'escrow-123'
			});

			expect(notification.title).toBe('Escrow Funded');
			expect(notification.priority).toBe('urgent');
			expect(notification.data?.escrowId).toBe('escrow-123');
		});

		it('should create conflict notification with high priority', () => {
			const request = createMockRequest();
			const notification = createSchedulingNotification(request, 'scheduling_conflict');

			expect(notification.title).toBe('Scheduling Conflict');
			expect(notification.priority).toBe('high');
		});
	});

	describe('shouldShowNotification', () => {
		const createNotification = (): Notification => ({
			id: 'notif-1',
			userId: 'user-1',
			type: 'system',
			title: 'Test',
			body: 'Test body',
			priority: 'normal',
			read: false,
			delivered: { inApp: true },
			createdAt: new Date()
		});

		it('should show notification when no quiet hours', () => {
			const notification = createNotification();
			expect(shouldShowNotification(notification)).toBe(true);
		});

		it('should hide notification during quiet hours', () => {
			const notification = createNotification();
			const quietHours = { start: 22, end: 6 }; // 10 PM - 6 AM

			// Mock current hour to be 23 (11 PM)
			const originalDate = Date;
			global.Date = class extends originalDate {
				getHours() {
					return 23;
				}
			} as any;

			expect(shouldShowNotification(notification, quietHours)).toBe(false);

			global.Date = originalDate;
		});

		it('should show notification outside quiet hours', () => {
			const notification = createNotification();
			const quietHours = { start: 22, end: 6 }; // 10 PM - 6 AM

			// Mock current hour to be 14 (2 PM)
			const originalDate = Date;
			global.Date = class extends originalDate {
				getHours() {
					return 14;
				}
			} as any;

			expect(shouldShowNotification(notification, quietHours)).toBe(true);

			global.Date = originalDate;
		});
	});

	describe('deduplicateNotifications', () => {
		it('should remove duplicate notifications', () => {
			const now = Date.now();
			const notification1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(now),
				data: { requestId: 'request-1' }
			};

			const notification2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(now), // Same minute
				data: { requestId: 'request-1' } // Same request
			};

			const deduplicated = deduplicateNotifications([notification1, notification2]);
			expect(deduplicated.length).toBe(1);
		});

		it('should keep notifications with different request IDs', () => {
			const now = Date.now();
			const notification1: Notification = {
				id: 'notif-1',
				userId: 'user-1',
				type: 'system',
				title: 'Test 1',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(now),
				data: { requestId: 'request-1' }
			};

			const notification2: Notification = {
				id: 'notif-2',
				userId: 'user-1',
				type: 'system',
				title: 'Test 2',
				body: 'Test body',
				priority: 'normal',
				read: false,
				delivered: { inApp: true },
				createdAt: new Date(now),
				data: { requestId: 'request-2' } // Different request
			};

			const deduplicated = deduplicateNotifications([notification1, notification2]);
			expect(deduplicated.length).toBe(2);
		});
	});
});

