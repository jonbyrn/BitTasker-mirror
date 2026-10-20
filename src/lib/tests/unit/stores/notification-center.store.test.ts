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

vi.mock('$lib/utils/notifications/activity-inbox', () => ({
	loadActivityNotifications: vi.fn().mockResolvedValue([]),
	markActivityRead: vi.fn(),
	hideActivity: vi.fn()
}));

vi.mock('@sentry/sveltekit', () => ({
	addBreadcrumb: vi.fn(),
	captureException: vi.fn()
}));

import { notificationCenterStore, sandboxPagesHost } from '$lib/stores/notificationCenter.store';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
import { syncBadge } from '$lib/utils/badgeSync';
import type {
	NotificationCenterItem,
	NotificationCenterListResponse
} from '$lib/types/notification';

function createNotification(
	overrides: Partial<NotificationCenterItem> = {}
): NotificationCenterItem {
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

		it('reverts count on API failure', async () => {
			const items = [
				createNotification({ id: 'n1', isRead: false }),
				createNotification({ id: 'n2', isRead: false })
			];
			vi.mocked(notificationCenterService.list)
				.mockResolvedValueOnce(createListResponse(items))
				.mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValue(2);
			vi.mocked(notificationCenterService.markRead).mockRejectedValueOnce(
				new Error('Server error')
			);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.fetchUnreadCount();

			expect(get(notificationCenterStore).unreadCount).toBe(2);

			await notificationCenterStore.markRead('n1');

			// After fix: fetchUnreadCount reverts count from optimistic 1 back to 2
			// Before fix: count stays at 1 (optimistic decrement not reverted)
			expect(get(notificationCenterStore).unreadCount).toBe(2);
			expect(notificationCenterService.getUnreadCount).toHaveBeenCalledTimes(2);
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

		it('reverts count on API failure', async () => {
			const items = [
				createNotification({ id: 'n1', isRead: false }),
				createNotification({ id: 'n2', isRead: false })
			];
			vi.mocked(notificationCenterService.list)
				.mockResolvedValueOnce(createListResponse(items))
				.mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValue(2);
			vi.mocked(notificationCenterService.markAllRead).mockRejectedValueOnce(
				new Error('Server error')
			);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.fetchUnreadCount();

			expect(get(notificationCenterStore).unreadCount).toBe(2);

			await notificationCenterStore.markAllRead();

			// After fix: fetchUnreadCount reverts count from optimistic 0 back to 2
			// Before fix: count stays at 0
			expect(get(notificationCenterStore).unreadCount).toBe(2);
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

		it('reverts count on API failure', async () => {
			const items = [
				createNotification({ id: 'n1', isRead: false }),
				createNotification({ id: 'n2', isRead: false })
			];
			vi.mocked(notificationCenterService.list)
				.mockResolvedValueOnce(createListResponse(items))
				.mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValue(2);
			vi.mocked(notificationCenterService.deleteOne).mockRejectedValueOnce(
				new Error('Server error')
			);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.fetchUnreadCount();

			expect(get(notificationCenterStore).unreadCount).toBe(2);

			await notificationCenterStore.deleteNotification('n1');

			// After fix: fetchUnreadCount reverts count from optimistic 1 back to 2
			// Before fix: count stays at 1
			expect(get(notificationCenterStore).unreadCount).toBe(2);
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

		it('reverts state and badge on API failure', async () => {
			const items = [createNotification({ id: 'n1' })];
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse(items));
			vi.mocked(notificationCenterService.deleteMany).mockRejectedValueOnce(
				new Error('Server error')
			);
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValue(1);

			await notificationCenterStore.fetchNotifications(true);
			await notificationCenterStore.fetchUnreadCount();

			expect(get(notificationCenterStore).unreadCount).toBe(1);

			await notificationCenterStore.clearAll();

			// State reverted by set(prev)
			expect(get(notificationCenterStore).notifications).toHaveLength(1);
			// After fix: fetchUnreadCount reverts count and badge
			// Before fix: syncBadge(0) is called even on failure
			expect(get(notificationCenterStore).unreadCount).toBe(1);
			expect(syncBadge).toHaveBeenLastCalledWith(1);
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
		it('prepends a notification without touching unreadCount', async () => {
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse([]));
			await notificationCenterStore.fetchNotifications(true);

			const newNotif = createNotification({ id: 'realtime-1', title: 'Real-time notification' });
			notificationCenterStore.addFromRealtime(newNotif);

			const state = get(notificationCenterStore);
			expect(state.notifications).toHaveLength(1);
			expect(state.notifications[0].id).toBe('realtime-1');
			expect(state.total).toBe(1);
			// unreadCount is NOT incremented — the backend's notification:unread-count
			// event is the single source of truth for the count
			expect(state.unreadCount).toBe(0);
		});

		it('skips duplicate notifications by id', async () => {
			vi.mocked(notificationCenterService.list).mockResolvedValueOnce(createListResponse([]));
			await notificationCenterStore.fetchNotifications(true);

			const notif = createNotification({ id: 'dup-1', title: 'First arrival' });
			notificationCenterStore.addFromRealtime(notif);
			expect(get(notificationCenterStore).notifications).toHaveLength(1);

			// Same notification arrives again (e.g., WebSocket re-send or REST fetch overlap)
			const duplicate = createNotification({ id: 'dup-1', title: 'Duplicate' });
			notificationCenterStore.addFromRealtime(duplicate);

			// Still 1 notification — duplicate was skipped
			expect(get(notificationCenterStore).notifications).toHaveLength(1);
		});
	});

	describe('fetchUnreadCount', () => {
		it('updates unread count from API', async () => {
			vi.mocked(notificationCenterService.getUnreadCount).mockResolvedValueOnce(5);

			await notificationCenterStore.fetchUnreadCount();

			const state = get(notificationCenterStore);
			expect(state.unreadCount).toBe(5);
		});

		it('skips the staging unread API on the RGB sandbox', async () => {
			vi.mocked(notificationCenterService.getUnreadCount).mockClear();
			vi.spyOn(window, 'location', 'get').mockReturnValue({
				hostname: 'rgb.bittasker.com'
			} as Location);

			await notificationCenterStore.fetchUnreadCount();

			expect(notificationCenterService.getUnreadCount).not.toHaveBeenCalled();
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

	describe('sandboxPagesHost', () => {
		it('matches the RGB sandbox hosts only', () => {
			expect(sandboxPagesHost('rgb.bittasker.com')).toBe(true);
			expect(sandboxPagesHost('bittasker-rgb.pages.dev')).toBe(true);
			expect(sandboxPagesHost('a9496a82.bittasker-rgb.pages.dev')).toBe(true);
			expect(sandboxPagesHost('staging.bittasker.com')).toBe(false);
			expect(sandboxPagesHost('bittasker.com')).toBe(false);
			expect(sandboxPagesHost('localhost')).toBe(false);
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
