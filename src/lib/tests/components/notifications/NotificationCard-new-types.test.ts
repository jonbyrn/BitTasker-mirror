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
		body: 'Someone placed a bid on your task.',
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

describe('NotificationCard — New Notification Types', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('new_task_broadcast', () => {
		it('renders with correct title and body', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_task_broadcast',
						title: 'New task available',
						body: 'A new task "Build a website" is now open for bidding.',
						data: { deepLink: '/tasks/task-123' }
					})
				}
			});

			expect(screen.getByText('New task available')).toBeTruthy();
			expect(
				screen.getByText('A new task "Build a website" is now open for bidding.')
			).toBeTruthy();
		});

		it('navigates to /tasks/{taskId} on click', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_task_broadcast',
						data: { deepLink: '/tasks/task-123' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/tasks/task-123');
			});
		});
	});

	describe('new_service_broadcast', () => {
		it('renders with correct title and body', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_service_broadcast',
						title: 'New service listed',
						body: 'A new service "Web Development" is now available.',
						data: { deepLink: '/services/service-456' }
					})
				}
			});

			expect(screen.getByText('New service listed')).toBeTruthy();
			expect(screen.getByText('A new service "Web Development" is now available.')).toBeTruthy();
		});

		it('navigates to /services/{serviceId} on click', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_service_broadcast',
						data: { deepLink: '/services/service-456' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/services/service-456');
			});
		});
	});

	describe('new_service_match', () => {
		it('renders with match title', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_service_match',
						title: 'New service match!',
						body: 'A new service "Logo Design" matches your search.',
						data: { deepLink: '/services/service-789' }
					})
				}
			});

			expect(screen.getByText('New service match!')).toBeTruthy();
		});

		it('navigates to service detail on click', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_service_match',
						data: { deepLink: '/services/service-789' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/services/service-789');
			});
		});
	});

	describe('proposal_withdrawn', () => {
		it('renders correctly', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'proposal_withdrawn',
						title: 'Proposal withdrawn',
						body: 'Provider withdrew proposal for "Fix plumbing".',
						data: { deepLink: '/hiring/service-requests' }
					})
				}
			});

			expect(screen.getByText('Proposal withdrawn')).toBeTruthy();
		});

		it('navigates to /hiring/service-requests', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'proposal_withdrawn',
						data: { deepLink: '/hiring/service-requests' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/hiring/service-requests');
			});
		});
	});

	describe('proposal_updated', () => {
		it('renders correctly', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'proposal_updated',
						title: 'Proposal updated',
						body: 'Proposal for "Fix plumbing" updated.',
						data: { deepLink: '/hiring/service-requests' }
					})
				}
			});

			expect(screen.getByText('Proposal updated')).toBeTruthy();
		});
	});

	describe('service_expiring_soon', () => {
		it('renders with warning icon context', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'service_expiring_soon',
						title: 'Service expiring',
						body: 'Your service "Web Dev" expires in 7 days.',
						data: { deepLink: '/earning/my-services' }
					})
				}
			});

			expect(screen.getByText('Service expiring')).toBeTruthy();
		});

		it('navigates to /earning/my-services', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'service_expiring_soon',
						data: { deepLink: '/earning/my-services' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/earning/my-services');
			});
		});
	});

	describe('service_expired', () => {
		it('renders correctly', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'service_expired',
						title: 'Service expired',
						body: 'Your service "Web Dev" has expired.',
						data: { deepLink: '/earning/my-services' }
					})
				}
			});

			expect(screen.getByText('Service expired')).toBeTruthy();
		});
	});

	describe('service_review_received', () => {
		it('renders correctly', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'service_review_received',
						title: 'New review',
						body: 'Your service "Web Dev" got a new review.',
						data: { deepLink: '/services/service-123' }
					})
				}
			});

			expect(screen.getByText('New review')).toBeTruthy();
		});
	});

	describe('service_price_changed', () => {
		it('renders correctly', () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'service_price_changed',
						title: 'Price changed',
						body: 'Pricing changed for "Web Dev".',
						data: { deepLink: '/hiring/service-requests' }
					})
				}
			});

			expect(screen.getByText('Price changed')).toBeTruthy();
		});
	});

	describe('icon mapping for new types', () => {
		it.each([
			'new_task_broadcast',
			'new_service_broadcast',
			'new_service_match',
			'proposal_withdrawn',
			'proposal_updated',
			'service_expiring_soon',
			'service_expired',
			'service_review_received',
			'service_price_changed'
		])('renders an icon for type %s without error', (type) => {
			expect(() => {
				render(NotificationCard, {
					props: {
						notification: createNotification({
							type,
							title: `Test ${type}`,
							body: `Body for ${type}`
						})
					}
				});
			}).not.toThrow();
		});
	});

	describe('deep link with serviceId placeholder', () => {
		it('navigates with serviceId in deep link', async () => {
			render(NotificationCard, {
				props: {
					notification: createNotification({
						type: 'new_service_broadcast',
						data: { deepLink: '/services/abc-def-123', serviceId: 'abc-def-123' }
					})
				}
			});

			const card = screen.getByRole('listitem');
			await fireEvent.click(card);

			await waitFor(() => {
				expect(mockGoto).toHaveBeenCalledWith('/services/abc-def-123');
			});
		});
	});
});
