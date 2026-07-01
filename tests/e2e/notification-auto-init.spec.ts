/**
 * Notification auto-init e2e tests.
 *
 * Verifies that pushNotificationService.init() is called automatically
 * when the browser's Notification.permission is already 'granted',
 * without requiring the user to tap the "Enable Notifications" banner.
 *
 * Root cause being tested: previously, init() was ONLY called when the
 * user tapped the banner. If permission was already granted (e.g. from a
 * previous install), the banner never showed and init() was never called,
 * so the FCM token was never obtained or registered on the server.
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

test.describe('Notification auto-init', () => {
	test('auto-calls init() when permission is already granted', async ({ authenticatedPage }) => {
		// Mock Notification API with permission already granted BEFORE page scripts run
		await authenticatedPage.addInitScript(() => {
			// Track whether requestPermission is called (happens inside init())
			(window as any).__pushInitRequested = false;

			// Ensure Notification exists
			if (!('Notification' in window)) {
				(window as any).Notification = {};
			}

			// Override permission to report 'granted'
			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'granted',
				configurable: true
			});

			// Track requestPermission calls — this is called inside initWebPushNotifications
			window.Notification.requestPermission = async () => {
				(window as any).__pushInitRequested = true;
				return 'granted';
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);

		// Wait for the component to mount and init to be triggered
		// The banner's onMount checks permission and calls init() if granted
		await authenticatedPage.waitForFunction(
			() => (window as any).__pushInitRequested === true,
			{ timeout: 10000 }
		);

		const initRequested = await authenticatedPage.evaluate(
			() => (window as any).__pushInitRequested
		);
		expect(initRequested).toBe(true);
	});

	test('does NOT auto-call init() when permission is prompt', async ({ authenticatedPage }) => {
		await authenticatedPage.addInitScript(() => {
			(window as any).__pushInitRequested = false;

			if (!('Notification' in window)) {
				(window as any).Notification = {};
			}

			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'default', // 'default' maps to 'prompt' in the permission API
				configurable: true
			});

			window.Notification.requestPermission = async () => {
				(window as any).__pushInitRequested = true;
				return 'granted';
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);

		// Wait enough time for the component to mount
		await authenticatedPage.waitForTimeout(5000);

		const initRequested = await authenticatedPage.evaluate(
			() => (window as any).__pushInitRequested
		);

		// init() should NOT have been called automatically — the banner should show instead
		expect(initRequested).toBe(false);
	});

	test('does NOT auto-call init() when permission is denied', async ({ authenticatedPage }) => {
		await authenticatedPage.addInitScript(() => {
			(window as any).__pushInitRequested = false;

			if (!('Notification' in window)) {
				(window as any).Notification = {};
			}

			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'denied',
				configurable: true
			});

			window.Notification.requestPermission = async () => {
				(window as any).__pushInitRequested = true;
				return 'denied';
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);

		await authenticatedPage.waitForTimeout(5000);

		const initRequested = await authenticatedPage.evaluate(
			() => (window as any).__pushInitRequested
		);

		// init() should NOT have been called — permission is denied, nothing to do
		expect(initRequested).toBe(false);

		// Banner should NOT be visible (permission already decided)
		const banner = authenticatedPage.locator('text=Enable Notifications').first();
		const bannerVisible = await banner.isVisible().catch(() => false);
		expect(bannerVisible).toBe(false);
	});

	test('banner still works when user taps Enable (prompt → granted flow)', async ({
		authenticatedPage
	}) => {
		let permissionState = 'default'; // starts as 'prompt'

		await authenticatedPage.addInitScript(() => {
			(window as any).__pushInitRequested = false;

			if (!('Notification' in window)) {
				(window as any).Notification = {};
			}

			// Use a getter that reads from a mutable variable
			Object.defineProperty(window.Notification, 'permission', {
				get: () => (window as any).__notificationPermission ?? 'default',
				configurable: true
			});

			(window as any).__notificationPermission = 'default';

			window.Notification.requestPermission = async () => {
				(window as any).__pushInitRequested = true;
				// Simulate user granting permission
				(window as any).__notificationPermission = 'granted';
				return 'granted';
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);

		// Banner should be visible (permission is 'prompt')
		const banner = authenticatedPage.locator('text=Enable Notifications').first();
		await expect(banner).toBeVisible({ timeout: 10000 });

		// Click the Enable button
		const enableBtn = authenticatedPage
			.locator('button', { hasText: /enable/i })
			.first();
		await enableBtn.click({ force: true });

		// Wait for init to be called
		await authenticatedPage.waitForFunction(
			() => (window as any).__pushInitRequested === true,
			{ timeout: 10000 }
		);

		const initRequested = await authenticatedPage.evaluate(
			() => (window as any).__pushInitRequested
		);
		expect(initRequested).toBe(true);
	});
});
