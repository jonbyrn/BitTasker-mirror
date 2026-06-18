import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import NotificationCard from '$lib/components/notifications/NotificationCard.svelte';
import type { NotificationCenterItem } from '$lib/types/notification';

const mockGoto = vi.fn();
const mockMarkRead = vi.fn().mockResolvedValue(undefined);
const mockDeleteNotification = vi.fn().mockResolvedValue(undefined);

vi.mock('$app/navigation', () => ({
	goto: (...args: unknown[]) => mockGoto(...args)
}));

vi.mock('$lib/stores/notificationCenter.store', () => ({
	notificationCenterStore: {
		markRead: (...args: unknown[]) => mockMarkRead(...args),
		deleteNotification: (...args: unknown[]) => mockDeleteNotification(...args)
	}
}));

vi.mock('svelte-i18n', async () => {
	const { readable } = await import('svelte/store');
	return {
		t: readable((key: string) => key)
	};
});

function createNotification(
	overrides: Partial<NotificationCenterItem> = {}
): NotificationCenterItem {
	return {
		id: 'notif-1',
		recipientNpub: 'npub1abc',
		type: 'new_bid_on_task',
		title: 'New bid on your task',
		body: 'Someone placed a bid on your task "Build a website".',
		isRead: false,
		priority: 'NORMAL',
		data: { deepLink: '/task/abc123' },
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

describe('NotificationCard click behavior', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('navigates to deepLink when notification has one', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({
					data: { deepLink: '/hiring/my-tasks' }
				})
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockGoto).toHaveBeenCalledWith('/hiring/my-tasks');
		});
	});

	it('does not navigate when deepLink is missing', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({
					data: null
				})
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockMarkRead).toHaveBeenCalledWith('notif-1');
		});
		expect(mockGoto).not.toHaveBeenCalled();
	});

	it('does not navigate to protocol-relative URLs', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({
					data: { deepLink: '//evil.com' }
				})
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockGoto).not.toHaveBeenCalled();
		});
	});

	it('does not navigate to external URLs', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({
					data: { deepLink: 'https://example.com' }
				})
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockGoto).not.toHaveBeenCalled();
		});
	});

	it('marks notification as read on click when unread', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({ isRead: false })
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockMarkRead).toHaveBeenCalledWith('notif-1');
		});
	});

	it('does not mark as read when already read', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({ isRead: true })
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockMarkRead).not.toHaveBeenCalled();
		});
	});

	it('still navigates to deepLink even when already read', async () => {
		render(NotificationCard, {
			props: {
				notification: createNotification({
					isRead: true,
					data: { deepLink: '/wallet' }
				})
			}
		});

		const card = screen.getByRole('listitem');
		await fireEvent.click(card);

		await waitFor(() => {
			expect(mockGoto).toHaveBeenCalledWith('/wallet');
		});
		expect(mockMarkRead).not.toHaveBeenCalled();
	});
});
