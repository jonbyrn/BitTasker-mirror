/**
 * Notification count synchronization e2e tests.
 *
 * Reproduces and verifies fixes for:
 * 1. Dropdown shows empty when unreadCount > 0 but notifications were never fetched
 *    (NotificationBell only fetches on first open via !initialized guard).
 * 2. markRead optimistic count not reverted on API failure.
 * 3. Notifications page should always show items the API returns (baseline).
 *
 * These tests assert CORRECT behavior. They will FAIL before the fix and PASS after.
 */
import { test, expect } from './fixtures/cross-browser-auth';

async function dismissOverlays(page: import('@playwright/test').Page) {
	const closeButtons = page.locator('.modal-backdrop, [aria-label*="ismiss"]');
	for (const btn of await closeButtons.all()) {
		try {
			await btn.click({ timeout: 500 });
		} catch {
			/* no overlay */
		}
	}
	await page.waitForTimeout(300);
}

function makeNotification(id: string, overrides: Record<string, unknown> = {}) {
	return {
		id,
		recipientNpub: 'npub1test',
		type: 'task',
		title: `Notification ${id}`,
		body: `Body for ${id}`,
		isRead: false,
		priority: 'NORMAL',
		data: { deepLink: '/tasks' },
		dedupeKey: `dedupe-${id}`,
		readAt: null,
		pushSentAt: null,
		dismissedAt: null,
		expiresAt: null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		userId: null,
		...overrides
	};
}

function makeListResponse(
	items: ReturnType<typeof makeNotification>[],
	overrides: Record<string, unknown> = {}
) {
	return {
		items,
		total: items.length,
		page: 1,
		limit: 20,
		totalPages: items.length > 0 ? 1 : 0,
		...overrides
	};
}

test.describe('Notification count synchronization', () => {
	test('dropdown re-fetches when notifications empty but unreadCount > 0', async ({
		authenticatedPage
	}) => {
		/**
		 * Scenario: Backend has 3 unread notifications, but the frontend's
		 * notification list was never populated (e.g., legacy path without
		 * WebSocket notification:new event, or the first fetch returned empty
		 * due to a timing issue).
		 *
		 * Before fix: dropdown opens, fetches once (returns empty), sets initialized=true.
		 * Subsequent opens never re-fetch -> dropdown stays empty despite count=3.
		 *
		 * After fix: dropdown re-fetches when notifications.length === 0 && unreadCount > 0.
		 */
		const page = authenticatedPage;

		const notifications = [
			makeNotification('n1', { title: 'New bid on your task' }),
			makeNotification('n2', { title: 'Payment received' }),
			makeNotification('n3', { title: 'New message' })
		];

		let listCallCount = 0;

		await page.route(/\/api\/v1\/notification-center/, (route) => {
			const url = route.request().url();
			const method = route.request().method();

			if (url.includes('/unread-count')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ count: 3 })
				});
			}

			if (method === 'GET' && !url.includes('/unread-count') && !url.includes('/read')) {
				listCallCount++;
				if (listCallCount <= 1) {
					return route.fulfill({
						status: 200,
						contentType: 'application/json',
						body: JSON.stringify(makeListResponse([]))
					});
				}
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(makeListResponse(notifications))
				});
			}

			return route.continue();
		});

		// Set up listener BEFORE navigation so we don't miss the instant mocked response
		const unreadCountPromise = page.waitForResponse(
			(resp) => resp.url().includes('notification-center/unread-count'),
			{ timeout: 15000 }
		);

		await page.goto('/hiring');
		await dismissOverlays(page);
		await unreadCountPromise;

		const bell = page.locator('button[aria-label*="otification"]').first();
		await expect(bell).toBeVisible({ timeout: 10000 });

		const badge = bell.locator('.badge');
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toHaveText('3');

		// First dropdown open - fetches because initialized=false, gets empty response
		const firstListPromise = page.waitForResponse(
			(resp) =>
				resp.url().includes('notification-center') &&
				!resp.url().includes('unread-count') &&
				resp.request().method() === 'GET',
			{ timeout: 10000 }
		);
		await bell.click({ force: true });
		await firstListPromise;
		await page.waitForTimeout(500);

		const dropdown = page.locator('[role="dialog"][aria-label*="otification"]');
		await expect(dropdown).toBeVisible({ timeout: 5000 });

		// Close dropdown
		await page.keyboard.press('Escape');
		await page.waitForTimeout(500);

		// Second dropdown open - this is the critical test point
		// Before fix: no re-fetch (initialized=true), dropdown stays empty
		// After fix: re-fetches because notifications.length=0 && unreadCount=3
		const secondListPromise = page.waitForResponse(
			(resp) =>
				resp.url().includes('notification-center') &&
				!resp.url().includes('unread-count') &&
				resp.request().method() === 'GET',
			{ timeout: 8000 }
		);
		await bell.click({ force: true });

		// After fix: second API call fires and returns 3 notifications
		// Before fix: no second call -> timeout -> test fails
		const secondListResp = await secondListPromise;
		expect(secondListResp.status()).toBe(200);

		await page.waitForTimeout(500);
		const cards = dropdown.locator('[role="listitem"]');
		await expect(cards).toHaveCount(3, { timeout: 5000 });
	});

	test('markRead failure reverts optimistic count decrement', async ({ authenticatedPage }) => {
		/**
		 * Scenario: User has 1 unread notification in the local store. They click it.
		 * markRead is called. The optimistic update decrements count to 0.
		 * The API call FAILS (500 error).
		 *
		 * Before fix: refresh() re-fetches the list but NOT the count.
		 *   Count stays at 0 (wrong).
		 *
		 * After fix: refresh() + fetchUnreadCount() are both called on failure.
		 *   Count is reverted to 1 (correct).
		 */
		const page = authenticatedPage;

		const notification = makeNotification('n1', { isRead: false });
		let markReadCallCount = 0;

		await page.route(/\/api\/v1\/notification-center/, (route) => {
			const url = route.request().url();
			const method = route.request().method();

			if (url.includes('/unread-count')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ count: 1 })
				});
			}

			if (method === 'GET' && !url.includes('/unread-count') && !url.includes('/read')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(makeListResponse([notification]))
				});
			}

			if (method === 'PATCH' && url.includes('/read')) {
				markReadCallCount++;
				return route.fulfill({
					status: 500,
					contentType: 'application/json',
					body: JSON.stringify({ error: 'Internal server error' })
				});
			}

			return route.continue();
		});

		// Set up listener BEFORE navigation
		const unreadCountPromise = page.waitForResponse(
			(resp) => resp.url().includes('notification-center/unread-count'),
			{ timeout: 15000 }
		);

		await page.goto('/hiring');
		await dismissOverlays(page);
		await unreadCountPromise;

		const bell = page.locator('button[aria-label*="otification"]').first();
		await expect(bell).toBeVisible({ timeout: 10000 });

		const badge = bell.locator('.badge');
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toHaveText('1');

		// Open dropdown so the notification list is fetched into the store
		const listPromise = page.waitForResponse(
			(resp) =>
				resp.url().includes('notification-center') &&
				!resp.url().includes('unread-count') &&
				resp.request().method() === 'GET',
			{ timeout: 10000 }
		);
		await bell.click({ force: true });
		await listPromise;
		await page.waitForTimeout(500);

		// Close dropdown
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);

		// Set up listener for the unread-count re-fetch that should happen after markRead failure
		const unreadCountAfterFailPromise = page.waitForResponse(
			(resp) => resp.url().includes('notification-center/unread-count'),
			{ timeout: 8000 }
		);

		// Call markRead - this will trigger optimistic update (count: 1->0) then API fails
		await page.evaluate(async () => {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			await notificationCenterStore.markRead('n1');
		});

		expect(markReadCallCount).toBe(1);

		// After fix: fetchUnreadCount is called on failure, reverting count
		// Before fix: no fetchUnreadCount -> timeout -> test fails
		await unreadCountAfterFailPromise;

		// Verify count was reverted to 1
		const storeState = await page.evaluate(async () => {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			return new Promise<{ unreadCount: number }>((resolve) => {
				let state: { unreadCount: number };
				const unsub = notificationCenterStore.subscribe((s) => {
					state = s as { unreadCount: number };
				});
				unsub();
				resolve(state!);
			});
		});

		expect(storeState.unreadCount).toBe(1);
	});

	test('notifications page shows items returned by API', async ({ authenticatedPage }) => {
		/**
		 * Baseline test: the /notifications page should show notifications
		 * when the API returns them. This verifies the basic data flow works.
		 */
		const page = authenticatedPage;

		const notifications = [
			makeNotification('n1', { title: 'Task assigned to you' }),
			makeNotification('n2', { title: 'New bid received', isRead: true })
		];

		await page.route(/\/api\/v1\/notification-center/, (route) => {
			const url = route.request().url();
			const method = route.request().method();

			if (url.includes('/unread-count')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ count: 1 })
				});
			}

			if (method === 'GET' && !url.includes('/unread-count') && !url.includes('/read')) {
				return route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify(makeListResponse(notifications))
				});
			}

			return route.continue();
		});

		const listPromise = page.waitForResponse(
			(resp) =>
				resp.url().includes('notification-center') &&
				!resp.url().includes('unread-count') &&
				resp.request().method() === 'GET',
			{ timeout: 15000 }
		);

		await page.goto('/notifications');
		await dismissOverlays(page);
		await listPromise;
		await page.waitForTimeout(500);

		const cards = page.locator('[role="listitem"]');
		await expect(cards).toHaveCount(2, { timeout: 5000 });

		await expect(page.locator('text=Task assigned to you')).toBeVisible();
		await expect(page.locator('text=New bid received')).toBeVisible();
	});
});
