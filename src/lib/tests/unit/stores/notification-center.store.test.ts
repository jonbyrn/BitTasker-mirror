import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$lib/api/services/notificationCenter.service', () => ({
	notificationCenterService: {
		list: vi.fn(),
		getUnreadCount: vi.fn(),
		markRead: vi.fn(),
		markAllRead: vi.fn(),
		deleteOne: vi.fn(),
		deleteMany: vi.fn()
	}
}));

vi.mock('$lib/utils/network-status', () => ({
	browserNetworkStatus: {
		subscribe: (fn: (val: { online: boolean }) => void) => {
			fn({ online: true });
			return () => {};
		}
	}
}));

vi.mock('@capacitor/core', () => ({
	Capacitor: { isNativePlatform: () => false }
}));

vi.mock('$lib/utils/badgeSync', () => ({
	syncBadge: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

import { notificationCenterStore } from '$lib/stores/notificationCenter.store';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
import type { NotificationCenterItem, NotificationCenterListResponse } from '$lib/types/notification';

function createNotification(overrides: Partial<NotificationCenterItem> = {}): NotificationCenterItem {
	return {
		id: 'test-id-1',
		recipientNpub: 'npub1abc',
		type: 'new_bid_on_task',
		title: 'New Bid on Your Task',
		body: 'Someone placed a bid on your task.',
		isRead: false,
		priority: 'NORMAL',
		data: { deepLink: '/hiring/my-tasks' },
		dedupeKey: 'dedupe-1',
		readAt: null,
		pushSentAt: null,
		dismissedAt: null,
		expiresAt: null,
		createdAt: '2026-06-15T10:00:00Z',
		updatedAt: '2026-06-15T10:00:00Z',
		userId: null,
		...overrides
	};
}

function createListResponse(
	items: NotificationCenterItem[],
	overrides: Partial<NotificationCenterListResponse> = {}
): NotificationCenterListResponse {
	return {
		items,
		total: items.length,
		page: 1,
		limit: 20,
		totalPages: 1,
		...overrides
	};
}

describe('notification-center.store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		notificationCenterStore.reset();
	});

	describe('initial state', () => {
		it('has correct initial state', () => {
			const state = get(notificationCenterStore);
			expect(state.notifications).toEqual([]);
			expect(state.unreadCount).toBe(0);
			expect(state.loading).toBe(false);
			expect(state.error).toBeNull();
			expect(state.initialized).toBe(false);
			expect(state.hasMore).toBe(true);
			expect(state.activeFilter).toBe('all');
		});
	});

	describe('fetchNotifications', () => {
		it('loads notifications and updates state', async () => {
			const items = [createNotification(), createNotification({ id: 'test-id-2' })];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));

			await notificationCenterStore.fetchNotifications(true);

			const state = get(notificationCenterStore);
			expect(state.notifications).toHaveLength(2);
			expect(state.loading).toBe(false);
			expect(state.initialized).toBe(true);
			expect(state.error).toBeNull();
		});

		it('sets error state on failure', async () => {
			vi.mocked(notificationCenterService.list).mockRejectedValueOnce(new Error('Network error'));

			await notificationCenterStore.fetchNotifications(true);

			const state = get(notificationCenterStore);
			expect(state.error).toBe('Network error');
			expect(state.loading).toBe(false);
		});

		it('appends notifications when not resetting', async () => {
			const items1 = [createNotification({ id: '1' })];
			const items2 = [createNotification({ id: '2' })];

			vi.mocked(notificationCenterService.list)
				.mockResolvedValueOnce(createListResponse(items1, { page: 1, totalPages: 2 }))
				.mockResolvedValueOnce(createListResponse(items2, { page: 2, totalPages: 2 }));

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.loadMore();

			const state = get(notificationCenterStore);
			expect(state.notifications).toHaveLength(2);
			expect(state.notifications[0].id).toBe('1');
			expect(state.notifications[1].id).toBe('2');
		});
	});

	describe('markRead', () => {
		it('optimistically marks a notification as read', async () => {
			const items = [
				createNotification({ id: 'n1', isRead: false }),
				createNotification({ id: 'n2', isRead: false })
			];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.markRead).mockResolvedValueOnce(
				createNotification({ id: 'n1', isRead: true })
			);

			await notificationCenterStore.fetchNotifications(true);

			const stateBefore = get(notificationCenterStore);
			expect(stateBefore.unreadCount).toBe(0); // list response sets this

			await notificationCenterStore.markRead('n1');

			const state = get(notificationCenterStore);
			const n1 = state.notifications.find((n) => n.id === 'n1');
			expect(n1?.isRead).toBe(true);
			expect(n1?.readAt).toBeTruthy();
			expect(notificationCenterService.markRead).toHaveBeenCalledWith('n1');
		});
	});

	describe('markAllRead', () => {
		it('optimistically marks all as read', async () => {
			const items = [
				createNotification({ id: 'n1', isRead: false }),
				createNotification({ id: 'n2', isRead: false })
			];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.markAllRead).mockResolvedValueOnce(2);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.markAllRead();

			const state = get(notificationCenterStore);
			expect(state.unreadCount).toBe(0);
			expect(state.notifications.every((n) => n.isRead)).toBe(true);
			expect(notificationCenterService.markAllRead).toHaveBeenCalled();
		});
	});

	describe('deleteNotification', () => {
		it('optimistically removes a notification', async () => {
			const items = [createNotification({ id: 'n1' }), createNotification({ id: 'n2' })];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.deleteOne).mockResolvedValueOnce(undefined);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.deleteNotification('n1');

			const state = get(notificationCenterStore);
			expect(state.notifications).toHaveLength(1);
			expect(state.notifications[0].id).toBe('n2');
			expect(notificationCenterService.deleteOne).toHaveBeenCalledWith('n1');
		});
	});

	describe('clearAll', () => {
		it('clears all notifications', async () => {
			const items = [createNotification({ id: 'n1' })];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.deleteMany).mockResolvedValueOnce(1);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.clearAll();

			const state = get(notificationCenterStore);
			expect(state.notifications).toEqual([]);
			expect(state.total).toBe(0);
			expect(notificationCenterService.deleteMany).toHaveBeenCalled();
		});
	});

	describe('setFilter', () => {
		it('updates active filter and refreshes', async () => {
			vi.mocked(notificationCenterService.list).mockResolvedValue(createListResponse([]));

			notificationCenterStore.setFilter('unread');

			const state = get(notificationCenterStore);
			expect(state.activeFilter).toBe('unread');
			expect(notificationCenterService.list).toHaveBeenCalled();
		});
	});

	describe('addFromRealtime', () => {
		it('prepends a notification and increments count', async () => {
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse([]));
			await notificationCenterStore.fetchNotifications(true);

			const newNotif = createNotification({ id: 'realtime-1', title: 'Real-time notification' });
			notificationCenterStore.addFromRealtime(newNotif);

			const state = get(notificationCenterStore);
			expect(state.notifications).toHaveLength(1);
			expect(state.notifications[0].id).toBe('realtime-1');
			expect(state.total).toBe(1);
		});
	});

	describe('fetchUnreadCount', () => {
		it('updates unread count from API', async () => {
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValueOnce(5);

			await notificationCenterStore.fetchUnreadCount();

			const state = get(notificationCenterStore);
			expect(state.unreadCount).toBe(5);
		});

		it('silently fails on error', async () => {
			vi.mocked(notificationCenterService.getUnreadCount).mockRejectedValueOnce(
				new Error('Network error')
			);

			await notificationCenterStore.fetchUnreadCount();

			// Should not throw, state unchanged
			const state = get(notificationCenterStore);
			expect(state.unreadCount).toBe(0);
		});
	});

	describe('reset', () => {
		it('resets to initial state', async () => {
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(
				createListResponse([createNotification()])
			);
			await notificationCenterStore.fetchNotifications(true);

			notificationCenterStore.reset();

			const state = get(notificationCenterStore);
			expect(state.notifications).toEqual([]);
			expect(state.unreadCount).toBe(0);
			expect(state.initialized).toBe(false);
		});
	});
});
