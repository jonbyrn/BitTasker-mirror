/**
 * Notification counter re-login bug reproduction.
 *
 * Bug: After logging out and logging back into the same account,
 * the notification bell badge counter does not show until a manual
 * page refresh. The unread count API is never re-fetched because
 * the layout's onMount only fires once per component lifecycle.
 *
 * Root cause: (app)/+layout.svelte calls fetchNotificationCount()
 * inside onMount, which doesn't re-fire when the user re-authenticates
 * without a full page remount.
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

test.describe('Notification counter after re-login', () => {
	test('counter reappears after logout and re-login without page refresh', async ({
		authenticatedPage
	}) => {
		const page = authenticatedPage;

		// Mock the unread-count API to return a known value
		let unreadCountCallCount = 0;
		await page.route('**/api/v1/notification-center/unread-count', (route) => {
			unreadCountCallCount++;
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ count: 7 })
			});
		});

		// Step 1: Navigate to a protected route — triggers onMount → fetchNotificationCount()
		await page.goto('/hiring');
		await dismissOverlays(page);

		// Wait for the notification bell to be visible
		const bell = page.locator('button[aria-label*="otification"]').first();
		await expect(bell).toBeVisible({ timeout: 10000 });

		// Wait for the unread-count API to be called
		await page.waitForResponse((resp) => resp.url().includes('notification-center/unread-count'), {
			timeout: 10000
		});

		expect(unreadCountCallCount).toBe(1);

		// Verify the badge shows the count
		const badge = bell.locator('.badge');
		await expect(badge).toBeVisible({ timeout: 5000 });
		await expect(badge).toHaveText('7');

		// Step 2: Capture auth seed before logout so we can re-login
		const authSeed = await page.evaluate(() => {
			const P = 'CapacitorStorage.';
			return {
				access_token:
					localStorage.getItem(P + 'access_token') || localStorage.getItem('access_token'),
				refresh_token:
					localStorage.getItem(P + 'refresh_token') || localStorage.getItem('refresh_token'),
				npub: localStorage.getItem(P + 'npub') || localStorage.getItem('npub'),
				nsec: localStorage.getItem(P + '__E2E_NSEC__') || localStorage.getItem('__E2E_NSEC__'),
				mnemonic:
					localStorage.getItem(P + '__E2E_MNEMONIC__') || localStorage.getItem('__E2E_MNEMONIC__')
			};
		});

		// Step 3: Logout via the app's auth store
		await page.evaluate(async () => {
			const { authState } = await import('$lib/stores/auth.store');
			await authState.logout();
		});

		await page.waitForTimeout(500);

		// Verify notification store was reset
		const storeAfterLogout = await page.evaluate(async () => {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			return new Promise<{ unreadCount: number; initialized: boolean }>((resolve) => {
				let state;
				const unsub = notificationCenterStore.subscribe((s) => {
					state = s;
				});
				unsub();
				resolve({ unreadCount: state.unreadCount, initialized: state.initialized });
			});
		});
		expect(storeAfterLogout.unreadCount).toBe(0);
		expect(storeAfterLogout.initialized).toBe(false);

		// Step 4: Re-login by re-seeding auth data and calling login()
		// This simulates what happens when a user logs back in to the same account.
		// In the real app, setupAuthData() calls login() + initNotifications().
		await page.evaluate(
			async (seed: Record<string, string | null>) => {
				const P = 'CapacitorStorage.';
				if (seed.access_token) {
					localStorage.setItem('access_token', seed.access_token);
					localStorage.setItem(P + 'access_token', seed.access_token);
				}
				if (seed.refresh_token) {
					localStorage.setItem('refresh_token', seed.refresh_token);
					localStorage.setItem(P + 'refresh_token', seed.refresh_token);
				}
				if (seed.npub) {
					localStorage.setItem('npub', seed.npub);
					localStorage.setItem(P + 'npub', seed.npub);
				}
				if (seed.nsec) {
					localStorage.setItem('__E2E_NSEC__', seed.nsec);
					localStorage.setItem(P + '__E2E_NSEC__', seed.nsec);
				}
				if (seed.mnemonic) {
					localStorage.setItem('__E2E_MNEMONIC__', seed.mnemonic);
					localStorage.setItem(P + '__E2E_MNEMONIC__', seed.mnemonic);
				}
				localStorage.setItem('auth_method', 'nostr');
				localStorage.setItem(P + 'auth_method', 'nostr');

				// Trigger login + notification init (mirrors setupAuthData flow)
				const { authState } = await import('$lib/stores/auth.store');
				await authState.login();

				const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
				await notificationCenterStore.fetchUnreadCount();

				const { connectNotificationSocket } = await import(
					'$lib/api/services/notificationSocket.service'
				);
				await connectNotificationSocket();
			},
			authSeed as Record<string, string | null>
		);

		// Step 5: Navigate to a protected route WITHOUT a full page refresh
		// This is the critical part — in the buggy state, the layout's onMount
		// doesn't re-fire, so fetchNotificationCount() is never called again.
		await page.goto('/hiring');
		await dismissOverlays(page);

		// Wait for the notification bell to appear
		const bellAfterLogin = page.locator('button[aria-label*="otification"]').first();
		await expect(bellAfterLogin).toBeVisible({ timeout: 10000 });

		// Wait for potential API call (give it time if the fix is in place)
		await page.waitForTimeout(3000);

		// CRITICAL ASSERTION: The unread-count API should have been called again.
		// Before the fix: only 1 call (initial login), counter stays at 0.
		// After the fix: 2 calls (initial + re-login), counter shows 7.
		expect(unreadCountCallCount).toBe(2);

		// Verify the badge shows the count after re-login
		const badgeAfterLogin = bellAfterLogin.locator('.badge');
		await expect(badgeAfterLogin).toBeVisible({ timeout: 5000 });
		await expect(badgeAfterLogin).toHaveText('7');
	});

	test('notification store is properly reset on logout', async ({ authenticatedPage }) => {
		const page = authenticatedPage;

		// Mock API so the store gets initialized with data
		await page.route('**/api/v1/notification-center/unread-count', (route) => {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ count: 5 })
			});
		});

		await page.goto('/hiring');
		await dismissOverlays(page);

		const bell = page.locator('button[aria-label*="otification"]').first();
		await expect(bell).toBeVisible({ timeout: 10000 });

		// Wait for API call so the store is initialized
		await page.waitForResponse((resp) => resp.url().includes('notification-center/unread-count'), {
			timeout: 10000
		});

		// Verify store has data
		const stateBefore = await page.evaluate(async () => {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			return new Promise<{ unreadCount: number; initialized: boolean }>((resolve) => {
				let state;
				const unsub = notificationCenterStore.subscribe((s) => {
					state = s;
				});
				unsub();
				resolve({ unreadCount: state.unreadCount, initialized: state.initialized });
			});
		});
		expect(stateBefore.unreadCount).toBe(5);

		// Logout
		await page.evaluate(async () => {
			const { authState } = await import('$lib/stores/auth.store');
			await authState.logout();
		});

		await page.waitForTimeout(500);

		// Store should be fully reset
		const stateAfter = await page.evaluate(async () => {
			const { notificationCenterStore } = await import('$lib/stores/notificationCenter.store');
			return new Promise<{ unreadCount: number; initialized: boolean }>((resolve) => {
				let state;
				const unsub = notificationCenterStore.subscribe((s) => {
					state = s;
				});
				unsub();
				resolve({ unreadCount: state.unreadCount, initialized: state.initialized });
			});
		});

		expect(stateAfter.unreadCount).toBe(0);
		expect(stateAfter.initialized).toBe(false);
	});
});
