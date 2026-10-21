import { writable, get } from 'svelte/store';
import * as Sentry from '@sentry/sveltekit';
import type { NotificationCenterItem, NotificationFilters } from '$lib/types/notification';
import { notificationCenterService } from '$lib/api/services/notificationCenter.service';
import { browserNetworkStatus } from '$lib/utils/network-status';
import { syncBadge } from '$lib/utils/badgeSync';
import {
	hideActivity,
	loadActivityNotifications,
	markActivityRead,
	watchActivityNotifications
} from '$lib/utils/notifications/activity-inbox';

/** RGB sandbox Pages has no staging notification service. */
export function sandboxPagesHost(hostname = ''): boolean {
	const host = hostname || (typeof window === 'undefined' ? '' : window.location.hostname);
	return (
		host === 'rgb.bittasker.com' ||
		host === 'bittasker-rgb.pages.dev' ||
		host.endsWith('.bittasker-rgb.pages.dev')
	);
}

interface PendingMutation {
	id: string;
	type: 'markRead' | 'markAllRead' | 'delete' | 'clearAll';
	payload?: string;
	timestamp: number;
}

interface NotificationCenterState {
	notifications: NotificationCenterItem[];
	unreadCount: number;
	allCount: number;
	readCount: number;
	loading: boolean;
	loadingMore: boolean;
	error: string | null;
	page: number;
	total: number;
	totalPages: number;
	hasMore: boolean;
	activeFilter: string;
	initialized: boolean;
	isOffline: boolean;
	pendingMutations: PendingMutation[];
}

const initialState: NotificationCenterState = {
	notifications: [],
	unreadCount: 0,
	allCount: 0,
	readCount: 0,
	loading: false,
	loadingMore: false,
	error: null,
	page: 1,
	total: 0,
	totalPages: 0,
	hasMore: true,
	activeFilter: 'all',
	initialized: false,
	isOffline: false,
	pendingMutations: []
};

const PAGE_SIZE = 20;
let unreadCountFlight: Promise<void> | null = null;

function createNotificationCenterStore() {
	const { subscribe, set, update } = writable<NotificationCenterState>(initialState);
	let stopWatch: (() => void) | null = null;
	const laterTimers = new Map<string, ReturnType<typeof setTimeout>>();
	const ingested = new Set<string>();

	function ingest(notice: NotificationCenterItem): void {
		if (ingested.has(notice.id)) return;
		ingested.add(notice.id);
		update((s) => {
			const visible =
				s.activeFilter === 'unread'
					? !notice.isRead
					: s.activeFilter === 'read'
						? notice.isRead
						: s.activeFilter === 'all' || s.activeFilter === notice.type;
			return {
				...s,
				notifications: s.initialized && visible ? [notice, ...s.notifications] : s.notifications,
				total: s.initialized && visible ? s.total + 1 : s.total,
				unreadCount: s.unreadCount + (notice.isRead ? 0 : 1),
				allCount: s.allCount + 1,
				readCount: s.readCount + (notice.isRead ? 1 : 0)
			};
		});
	}

	function armLater(notice: NotificationCenterItem, atMs: number): void {
		if (laterTimers.has(notice.id) || ingested.has(notice.id)) return;
		const delay = Math.max(0, atMs - Date.now());
		laterTimers.set(
			notice.id,
			setTimeout(() => {
				laterTimers.delete(notice.id);
				ingest(notice);
			}, delay)
		);
	}

	function ensureWatch(): void {
		if (stopWatch || typeof window === 'undefined' || !sandboxPagesHost()) return;
		stopWatch = watchActivityNotifications(ingest, armLater);
	}

	function remember(items: NotificationCenterItem[]): void {
		for (const item of items) ingested.add(item.id);
	}

	function buildFilters(state: NotificationCenterState): NotificationFilters {
		const filters: NotificationFilters = {
			page: state.page,
			limit: PAGE_SIZE
		};
		if (state.activeFilter === 'unread') {
			filters.read = false;
		} else if (state.activeFilter === 'read') {
			filters.read = true;
		} else if (state.activeFilter !== 'all') {
			filters.type = state.activeFilter;
		}
		return filters;
	}

	function visibleItems(items: NotificationCenterItem[], filter: string): NotificationCenterItem[] {
		if (filter === 'unread') return items.filter((item) => !item.isRead);
		if (filter === 'read') return items.filter((item) => item.isRead);
		return items;
	}

	return {
		subscribe,

		async fetchRelayNotifications() {
			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({ ...s, isOffline: true, loading: false }));
				return;
			}
			update((s) => ({ ...s, loading: !s.initialized, error: null }));
			try {
				ensureWatch();
				const all = await loadActivityNotifications(armLater);
				remember(all);
				const filter = get({ subscribe }).activeFilter;
				const notifications = visibleItems(all, filter);
				const unreadCount = all.filter((item) => !item.isRead).length;
				update((s) => ({
					...s,
					notifications,
					unreadCount,
					allCount: all.length,
					readCount: all.length - unreadCount,
					total: notifications.length,
					page: 1,
					totalPages: 1,
					hasMore: false,
					loading: false,
					loadingMore: false,
					initialized: true,
					isOffline: false,
					error: null
				}));
				await syncBadge(unreadCount);
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to load notifications';
				update((s) => ({ ...s, loading: false, loadingMore: false, error: message }));
			}
		},

		async fetchNotifications(reset = false) {
			if (sandboxPagesHost()) {
				await this.fetchRelayNotifications();
				return;
			}
			const state = get({ subscribe });
			if (state.loading) return;

			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({ ...s, isOffline: true }));
				return;
			}

			update((s) => ({
				...s,
				loading: reset || !s.initialized,
				loadingMore: !reset && s.initialized,
				error: null,
				page: reset ? 1 : s.page
			}));

			try {
				const currentState = get({ subscribe });
				const filters = buildFilters(currentState);
				const response = await notificationCenterService.list(filters);

				update((s) => ({
					...s,
					notifications: reset ? response.items : [...s.notifications, ...response.items],
					total: response.total,
					page: response.page,
					totalPages: response.totalPages,
					hasMore: response.page < response.totalPages,
					loading: false,
					loadingMore: false,
					initialized: true,
					isOffline: false
				}));
			} catch (error) {
				const message = error instanceof Error ? error.message : 'Failed to load notifications';
				update((s) => ({
					...s,
					loading: false,
					loadingMore: false,
					error: message
				}));
			}
		},

		async loadMore() {
			const state = get({ subscribe });
			if (!state.hasMore || state.loadingMore) return;
			update((s) => ({ ...s, page: s.page + 1 }));
			await this.fetchNotifications(false);
		},

		async refresh() {
			await this.fetchNotifications(true);
		},

		async fetchUnreadCount() {
			if (unreadCountFlight) return unreadCountFlight;
			let flight: Promise<void> = Promise.resolve();
			flight = this.loadUnreadCount().finally(() => {
				if (unreadCountFlight === flight) unreadCountFlight = null;
			});
			unreadCountFlight = flight;
			return flight;
		},

		async loadUnreadCount() {
			if (sandboxPagesHost()) {
				try {
					const { getNpub } = await import('$lib/utils/nostrKeys');
					if (!(await getNpub())) return;
					ensureWatch();
					const all = await loadActivityNotifications(armLater);
					remember(all);
					const unreadCount = all.filter((item) => !item.isRead).length;
					update((s) => ({
						...s,
						unreadCount,
						allCount: all.length,
						readCount: all.length - unreadCount,
						notifications: s.initialized ? visibleItems(all, s.activeFilter) : s.notifications,
						total: s.initialized ? visibleItems(all, s.activeFilter).length : s.total,
						isOffline: false
					}));
					await syncBadge(unreadCount);
				} catch {
					// A relay miss keeps the last badge. It must not ask for a passkey.
				}
				return;
			}
			const network = get(browserNetworkStatus);
			if (!network.online) return;

			try {
				const count = await notificationCenterService.getUnreadCount();
				update((s) => ({ ...s, unreadCount: count, isOffline: false }));
				await syncBadge(count);
			} catch {
				// Silent fail — badge shows stale count until next successful fetch
			}
		},

		// Called by the WebSocket gateway when it pushes a count update
		setUnreadCount(count: number) {
			update((s) => ({ ...s, unreadCount: count }));
			syncBadge(count);
		},

		async markRead(id: string) {
			if (sandboxPagesHost()) {
				markActivityRead([id]);
				let unreadCount = 0;
				update((s) => {
					unreadCount = Math.max(
						0,
						s.unreadCount - (s.notifications.some((n) => n.id === id && !n.isRead) ? 1 : 0)
					);
					return {
						...s,
						notifications: s.notifications.map((n) =>
							n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
						),
						unreadCount
					};
				});
				await syncBadge(unreadCount);
				return;
			}
			const wasUnread = get({ subscribe }).notifications.find((n) => n.id === id && !n.isRead);

			// Optimistic update — UI responds immediately, server confirms async
			update((s) => ({
				...s,
				notifications: s.notifications.map((n) =>
					n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
				),
				unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount
			}));

			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({
					...s,
					pendingMutations: [
						...s.pendingMutations,
						{ id: crypto.randomUUID(), type: 'markRead', payload: id, timestamp: Date.now() }
					]
				}));
				return;
			}

			try {
				await notificationCenterService.markRead(id);
				Sentry.addBreadcrumb({
					category: 'notification',
					level: 'info',
					message: 'Notification marked as read',
					data: { notificationId: id }
				});
			} catch {
				await this.refresh();
				await this.fetchUnreadCount();
			}
		},

		async markAllRead() {
			if (sandboxPagesHost()) {
				const all = await loadActivityNotifications();
				markActivityRead(all.map((item) => item.id));
				await this.fetchRelayNotifications();
				return;
			}
			update((s) => ({
				...s,
				notifications: s.notifications.map((n) => ({
					...n,
					isRead: true,
					readAt: n.readAt ?? new Date().toISOString()
				})),
				unreadCount: 0
			}));

			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({
					...s,
					pendingMutations: [
						...s.pendingMutations,
						{ id: crypto.randomUUID(), type: 'markAllRead', timestamp: Date.now() }
					]
				}));
				return;
			}

			try {
				await notificationCenterService.markAllRead();
				await syncBadge(0);
				Sentry.addBreadcrumb({
					category: 'notification',
					level: 'info',
					message: 'All notifications marked as read'
				});
			} catch {
				await this.refresh();
				await this.fetchUnreadCount();
				update((s) => ({
					...s,
					error: "Couldn't mark notifications as read. Tap Retry."
				}));
			}
		},

		async deleteNotification(id: string) {
			if (sandboxPagesHost()) {
				hideActivity([id]);
				let unreadCount = 0;
				update((s) => {
					const target = s.notifications.find((n) => n.id === id);
					unreadCount = target && !target.isRead ? Math.max(0, s.unreadCount - 1) : s.unreadCount;
					return {
						...s,
						notifications: s.notifications.filter((n) => n.id !== id),
						total: Math.max(0, s.total - 1),
						unreadCount
					};
				});
				await syncBadge(unreadCount);
				return;
			}
			let wasUnread = false;
			update((s) => {
				const target = s.notifications.find((n) => n.id === id);
				wasUnread = target ? !target.isRead : false;
				return {
					...s,
					notifications: s.notifications.filter((n) => n.id !== id),
					total: Math.max(0, s.total - 1),
					unreadCount: wasUnread ? Math.max(0, s.unreadCount - 1) : s.unreadCount
				};
			});

			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({
					...s,
					pendingMutations: [
						...s.pendingMutations,
						{ id: crypto.randomUUID(), type: 'delete', payload: id, timestamp: Date.now() }
					]
				}));
				return;
			}

			try {
				await notificationCenterService.deleteOne(id);
				Sentry.addBreadcrumb({
					category: 'notification',
					level: 'info',
					message: 'Notification deleted',
					data: { notificationId: id }
				});
			} catch {
				await this.refresh();
				await this.fetchUnreadCount();
			}
		},

		async clearAll() {
			if (sandboxPagesHost()) {
				hideActivity(get({ subscribe }).notifications.map((item) => item.id));
				set({ ...initialState, initialized: true });
				await syncBadge(0);
				return;
			}
			const prev = get({ subscribe });
			set({ ...initialState, initialized: true });

			const network = get(browserNetworkStatus);
			if (!network.online) {
				update((s) => ({
					...s,
					pendingMutations: [
						...s.pendingMutations,
						{ id: crypto.randomUUID(), type: 'clearAll', timestamp: Date.now() }
					]
				}));
				return;
			}

			try {
				await notificationCenterService.deleteMany();
				await syncBadge(0);
				Sentry.addBreadcrumb({
					category: 'notification',
					level: 'info',
					message: 'All notifications cleared'
				});
			} catch {
				set(prev);
				await this.fetchUnreadCount();
				update((s) => ({
					...s,
					error: "Couldn't clear notifications. Tap Retry."
				}));
			}
		},

		setFilter(filter: string) {
			update((s) => ({ ...s, activeFilter: filter }));
			this.refresh();
		},

		addFromRealtime(notification: NotificationCenterItem) {
			update((s) => {
				if (s.notifications.some((n) => n.id === notification.id)) {
					return s;
				}
				return {
					...s,
					notifications: [notification, ...s.notifications],
					total: s.total + 1
				};
			});
		},

		async flushPendingMutations() {
			const state = get({ subscribe });
			const pending = state.pendingMutations;
			if (pending.length === 0) return;

			const failed: PendingMutation[] = [];

			for (const mutation of pending) {
				try {
					switch (mutation.type) {
						case 'markRead':
							if (mutation.payload) await notificationCenterService.markRead(mutation.payload);
							break;
						case 'markAllRead':
							await notificationCenterService.markAllRead();
							break;
						case 'delete':
							if (mutation.payload) await notificationCenterService.deleteOne(mutation.payload);
							break;
						case 'clearAll':
							await notificationCenterService.deleteMany();
							break;
					}
				} catch {
					failed.push(mutation);
				}
			}

			update((s) => ({ ...s, pendingMutations: failed }));
			if (failed.length < pending.length) {
				await this.refresh();
			}
		},

		reset() {
			stopWatch?.();
			stopWatch = null;
			for (const timer of laterTimers.values()) clearTimeout(timer);
			laterTimers.clear();
			ingested.clear();
			set(initialState);
			syncBadge(0);
		}
	};
}

export const notificationCenterStore = createNotificationCenterStore();
