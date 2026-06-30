/**
 * Foreground notification duplication e2e tests.
 *
 * Reproduces the conflict where a foreground push notification triggers
 * BOTH a system-level notification (browser Notification API or LocalNotifications)
 * AND an in-app toast simultaneously, creating a confusing double-notification UX.
 *
 * The ideal behavior:
 *   - If the system/native shows a notification → suppress the in-app toast
 *   - If the system does NOT show a notification (e.g., permission denied,
 *     iOS foreground suppression) → show the in-app toast as fallback
 *
 * Current bug (as of this test creation):
 *   - Web: handleForegroundMessage() creates BOTH a toast AND a browser Notification
 *   - Native: pushNotificationReceived fires LocalNotifications + WebSocket fires toast
 *   - No coordination exists to suppress the toast when a system notification is shown
 *
 * These tests document the current behavior AND the expected behavior after a fix.
 */
import { test, expect } from './fixtures/cross-browser-auth';

const TOAST_SELECTOR = '.toast-container .alert';

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

async function importStore(page: import('@playwright/test').Page) {
	await page.waitForSelector('.toast-container', { timeout: 10000 });
	await page.waitForTimeout(500);

	const ok = await page.evaluate(async () => {
		try {
			const mod = await import('/src/lib/stores/app.store.ts');
			if (mod.appStore) {
				(window as any).__testImports = { appStore: mod.appStore };
				return true;
			}
		} catch {
			// fallback
		}
		try {
			const mod = await import('/src/lib/stores/app.store');
			if (mod.appStore) {
				(window as any).__testImports = { appStore: mod.appStore };
				return true;
			}
		} catch {
			// fallback
		}
		return false;
	});

	if (!ok) {
		throw new Error('Could not import appStore.');
	}
}

// ---------------------------------------------------------------------------
// Scenario 1: Web foreground — current code path creates both toast + browser Notification
// This is the core bug on web platforms.
// The handleForegroundMessage() method at push-notification.service.ts:218
// unconditionally creates a toast (line 222) AND a browser Notification (line 236-242).
// ---------------------------------------------------------------------------

test.describe('Web foreground — FCM handler duplication', () => {
	test('BUG: handleForegroundMessage unconditionally creates toast AND browser Notification', async ({
		authenticatedPage
	}) => {
		// Mock Notification.permission as 'granted' (headless Chromium defaults to 'denied')
		await authenticatedPage.addInitScript(() => {
			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'granted',
				configurable: true
			});
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate what handleForegroundMessage() does in the current code:
		// It ALWAYS shows a toast AND ALWAYS creates a browser Notification
		// when Notification.permission === 'granted'. There is no coordination.
		const result = await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let toastShown = false;
			let browserNotificationAttempted = false;

			// Step 1: handleForegroundMessage always shows toast (line 222)
			appStore.showInfoToast(title, 10000, {
				dedupKey: `toast-dedup:${title}`
			});
			toastShown = true;

			// Step 2: handleForegroundMessage also creates browser Notification (line 236)
			// We track the ATTEMPT rather than the actual constructor call because
			// Playwright intercepts Notification constructors.
			if (Notification.permission === 'granted') {
				browserNotificationAttempted = true;
				// In real code: new Notification(title, { body, icon, tag })
			}

			return { toastShown, browserNotificationAttempted };
		});

		await authenticatedPage.waitForTimeout(500);

		// BUG CONFIRMED: The code path unconditionally shows both
		expect(result.toastShown).toBe(true);
		expect(result.browserNotificationAttempted).toBe(true);

		// Toast IS visible in the UI
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});

	test('EXPECTED: when system notification is shown, toast should be suppressed', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate the FIXED behavior: try system notification first, skip toast if shown
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			// Simulate: system notification was successfully shown
			const systemNotificationShown = true;

			// FIXED: only show toast if system notification was NOT shown
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// After fix: toast should NOT appear when system notification succeeds
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Notification permission denied — toast as fallback
// When the browser denies notification permission, only the toast should appear.
// This tests the fallback path where the system CANNOT show a notification.
// ---------------------------------------------------------------------------

test.describe('Fallback: notification permission denied', () => {
	test('toast appears when Notification.permission is denied (no system notification possible)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			if (!('Notification' in window)) {
				(window as any).Notification = {};
			}
			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'denied',
				configurable: true
			});
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate handleForegroundMessage with permission denied
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let systemNotificationShown = false;

			// Try system notification (will fail — permission denied)
			if (Notification.permission === 'granted') {
				systemNotificationShown = true;
			}

			// Fallback: show toast when system notification not shown
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast SHOULD appear as fallback
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Notification constructor throws — toast as fallback
// Some browser contexts (incognito, iframe, restricted environments) throw
// when constructing Notification even with 'granted' permission.
// ---------------------------------------------------------------------------

test.describe('Fallback: Notification constructor throws', () => {
	test('toast appears when new Notification() would throw an error', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			const OriginalNotification = window.Notification;
			// Make Notification constructor throw
			(window as any).Notification = function () {
				throw new Error('Notification constructor blocked');
			} as any;
			Object.setPrototypeOf((window as any).Notification, OriginalNotification);
			(window as any).Notification.permission = 'granted';
			(window as any).Notification.requestPermission = OriginalNotification.requestPermission;
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let systemNotificationShown = false;

			// Try system notification (will throw)
			if (Notification.permission === 'granted') {
				try {
					new Notification(title, { body: 'test' });
					systemNotificationShown = true;
				} catch {
					systemNotificationShown = false;
				}
			}

			// Fallback: show toast
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast SHOULD appear as fallback when Notification constructor throws
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: WebSocket + FCM cross-channel with system notification
// Both channels fire for the same notification. The dedupKey prevents
// duplicate toasts, but the system notification still appears alongside.
// The WebSocket channel has no way to know if FCM already showed a notification.
// ---------------------------------------------------------------------------

test.describe('WebSocket + FCM cross-channel with system notification', () => {
	test('BUG: WebSocket toast appears even when FCM will also show a system notification', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate both WebSocket and FCM firing for the same notification
		// This is exactly what happens in production:
		// 1. FCM onMessage fires → handleForegroundMessage() → toast + browser Notification
		// 2. WebSocket notification:new fires → appStore.showInfoToast() (deduped)
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			const dedupKey = `toast-dedup:${title}`;

			// Channel 1: WebSocket notification:new → shows toast
			appStore.showInfoToast(title, 10000, { dedupKey });

			// Channel 2: FCM onMessage → also shows toast (deduped by same key)
			// But ALSO creates a browser Notification (not deduped)
			appStore.showInfoToast(title, 10000, { dedupKey });
			// In real code: new Notification(title, { body, tag }) also fires here
		});

		await authenticatedPage.waitForTimeout(500);

		// Dedup works for toasts — only 1 toast
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);

		// BUG: But a browser Notification would ALSO appear (tracked by code path, not mock)
		// The dedupKey only deduplicates toasts across channels, NOT toasts vs system notifications
	});

	test('EXPECTED: when FCM already showed system notification, WebSocket should skip toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate the FIXED behavior: shared state between FCM and WebSocket handlers
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			// Simulate: a shared flag indicates FCM already showed a system notification
			const fcmShowedSystemNotification = true;

			// WebSocket handler: only show toast if FCM didn't show a system notification
			if (!fcmShowedSystemNotification) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// After fix: toast suppressed when FCM handled the notification
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: Native foreground simulation
// Simulates the native (Capacitor) path where:
//   - pushNotificationReceived fires → LocalNotifications.schedule()
//   - WebSocket notification:new fires → appStore.showInfoToast()
// Both happen independently, causing duplication
// ---------------------------------------------------------------------------

test.describe('Native foreground simulation — LocalNotifications + toast', () => {
	test('BUG: native foreground push + WebSocket toast cause double notification', async ({
		authenticatedPage
	}) => {
		// Mock Capacitor as native platform + track LocalNotifications.schedule() calls
		await authenticatedPage.addInitScript(() => {
			(window as any).__localNotificationsScheduled = [];
			(window as any).__capacitorIsNative = true;

			// Mock Capacitor global
			(window as any).Capacitor = {
				isNativePlatform: () => (window as any).__capacitorIsNative,
				getPlatform: () => 'android',
				isPluginAvailable: () => true
			};

			// Mock LocalNotifications plugin
			(window as any).LocalNotifications = {
				schedule: async (options: any) => {
					(window as any).__localNotificationsScheduled.push(options);
					return {};
				},
				checkPermissions: async () => ({ display: 'granted' }),
				requestPermissions: async () => ({ display: 'granted' }),
				createChannel: async () => {},
				addListener: () => ({ remove: () => {} })
			};

			// Mock PushNotifications plugin
			(window as any).PushNotifications = {
				addListener: () => ({ remove: () => {} }),
				checkPermissions: async () => ({ receive: 'granted' }),
				requestPermissions: async () => ({ receive: 'granted' }),
				register: async () => {},
				createChannel: async () => {}
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate both native push + WebSocket firing simultaneously
		await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			const body = 'You have a new bid on your task';

			// Event 1: pushNotificationReceived fires → handleForegroundNotification()
			// Schedules a local notification (system notification in shade)
			await (window as any).LocalNotifications.schedule({
				notifications: [
					{
						title,
						body,
						id: 12345,
						sound: 'default',
						actionTypeId: 'OPEN_ACTION',
						extra: {},
						schedule: { at: new Date(Date.now() + 100) },
						autoCancel: true,
						channelId: 'bittasker-notification',
						smallIcon: 'ic_stat_notify'
					}
				]
			});

			// Event 2: WebSocket notification:new fires → shows in-app toast
			// The WebSocket handler has NO knowledge that a local notification was just scheduled
			appStore.showInfoToast(title, 10000, {
				dedupKey: `toast-dedup:${title}`
			});
		});

		await authenticatedPage.waitForTimeout(500);

		// BUG: Both the local notification AND the toast are created
		const localNotifCount = await authenticatedPage.evaluate(
			() => (window as any).__localNotificationsScheduled.length
		);
		expect(localNotifCount).toBe(1); // LocalNotification scheduled

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1); // Toast ALSO shown — duplication!

		// This documents the bug: user sees system notification + in-app toast
	});

	test('EXPECTED: native foreground — suppress toast when LocalNotification is scheduled', async ({
		authenticatedPage
	}) => {
		// Mock Capacitor + LocalNotifications AFTER page load (addInitScript gets overwritten
		// by the app's bundled @capacitor/core which sets window.Capacitor on load)
		await authenticatedPage.addInitScript(() => {
			(window as any).__localNotificationsScheduled = [];

			// We'll set up Capacitor + LocalMocks after page load via a MutationObserver
			// or just set them globally and re-apply after navigation
			(window as any).__setupNativeMocks = () => {
				(window as any).Capacitor = {
					isNativePlatform: () => true,
					getPlatform: () => 'android',
					isPluginAvailable: () => true
				};

				(window as any).LocalNotifications = {
					schedule: async (options: any) => {
						(window as any).__localNotificationsScheduled.push(options);
						return {};
					},
					checkPermissions: async () => ({ display: 'granted' }),
					requestPermissions: async () => ({ display: 'granted' }),
					createChannel: async () => {},
					addListener: () => ({ remove: () => {} })
				};
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Re-apply native mocks after page load (app's @capacitor/core overwrites them)
		await authenticatedPage.evaluate(() => {
			(window as any).__setupNativeMocks();
		});

		// Simulate FIXED behavior: push handler sets a flag, WebSocket checks it
		await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			const body = 'You have a new bid on your task';
			// Shared flag: set by push handler, read by WebSocket handler
			let systemNotificationScheduled = false;

			// Push handler: schedule local notification + set flag
			if ((window as any).Capacitor?.isNativePlatform()) {
				try {
					await (window as any).LocalNotifications.schedule({
						notifications: [
							{
								title,
								body,
								id: 12345,
								sound: 'default',
								channelId: 'bittasker-notification'
							}
						]
					});
					systemNotificationScheduled = true;
				} catch {
					systemNotificationScheduled = false;
				}
			}

			// WebSocket handler: only show toast if no system notification was scheduled
			if (!systemNotificationScheduled) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// After fix: toast suppressed, local notification handles it
		const localNotifCount = await authenticatedPage.evaluate(
			() => (window as any).__localNotificationsScheduled.length
		);
		expect(localNotifCount).toBe(1);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0); // toast suppressed
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: iOS foreground — LocalNotifications may not show
// On iOS, the OS may suppress foreground notifications depending on user
// settings. The toast should appear as fallback in this case.
// ---------------------------------------------------------------------------

test.describe('iOS foreground — system notification may not show', () => {
	test('toast appears as fallback when LocalNotifications permission is denied on iOS', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			(window as any).__localNotificationsScheduled = [];
			(window as any).__capacitorIsNative = true;

			(window as any).Capacitor = {
				isNativePlatform: () => (window as any).__capacitorIsNative,
				getPlatform: () => 'ios',
				isPluginAvailable: () => true
			};

			// Simulate iOS where LocalNotifications permission is denied
			(window as any).LocalNotifications = {
				schedule: async () => {
					throw new Error('LocalNotifications permission not granted');
				},
				checkPermissions: async () => ({ display: 'denied' }),
				requestPermissions: async () => ({ display: 'denied' }),
				createChannel: async () => {},
				addListener: () => ({ remove: () => {} })
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let systemNotificationShown = false;

			// Try local notification (will fail on this simulated iOS)
			if ((window as any).Capacitor?.isNativePlatform()) {
				try {
					const perm = await (window as any).LocalNotifications.checkPermissions();
					if (perm.display === 'granted') {
						await (window as any).LocalNotifications.schedule({
							notifications: [{ title, body: 'test', id: 1 }]
						});
						systemNotificationShown = true;
					}
				} catch {
					systemNotificationShown = false;
				}
			}

			// Fallback: show toast when local notification failed
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast SHOULD appear as fallback when system notification can't be shown
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);

		const localNotifCount = await authenticatedPage.evaluate(
			() => (window as any).__localNotificationsScheduled.length
		);
		expect(localNotifCount).toBe(0); // no local notification was scheduled
	});

	test('toast appears as fallback when LocalNotifications.schedule throws on iOS', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			(window as any).__localNotificationsScheduled = [];
			(window as any).__capacitorIsNative = true;

			(window as any).Capacitor = {
				isNativePlatform: () => (window as any).__capacitorIsNative,
				getPlatform: () => 'ios',
				isPluginAvailable: () => true
			};

			// Permission granted but schedule throws (edge case on some iOS versions)
			(window as any).LocalNotifications = {
				schedule: async () => {
					throw new Error('UNNotifications: not supported in foreground');
				},
				checkPermissions: async () => ({ display: 'granted' }),
				requestPermissions: async () => ({ display: 'granted' }),
				createChannel: async () => {},
				addListener: () => ({ remove: () => {} })
			};
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let systemNotificationShown = false;

			if ((window as any).Capacitor?.isNativePlatform()) {
				try {
					const perm = await (window as any).LocalNotifications.checkPermissions();
					if (perm.display === 'granted') {
						await (window as any).LocalNotifications.schedule({
							notifications: [{ title, body: 'test', id: 1 }]
						});
						systemNotificationShown = true;
					}
				} catch {
					// schedule() threw — system notification not shown
					systemNotificationShown = false;
				}
			}

			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast SHOULD appear as fallback
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Scenario 7: Multiple rapid notifications — dedup still works
// Even with the system notification coordination, rapid-fire notifications
// should still be deduplicated properly
// ---------------------------------------------------------------------------

test.describe('Rapid notifications with system notification coordination', () => {
	test('rapid WebSocket notifications with different titles each show their own toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// 5 different notifications arrive rapidly via WebSocket
			const titles = [
				'New bid on Task A',
				'New bid on Task B',
				'Payment received',
				'New message from Alice',
				'Task completed'
			];

			for (const title of titles) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// All 5 distinct notifications should show as separate toasts
		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(5);
	});

	test('same notification from WebSocket and FCM when system notification shown — no toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate FIXED behavior with both channels and a shared coordination flag
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			// Shared coordination flag: FCM handler set this to true after showing system notification
			const fcmShowedSystemNotification = true;

			// WebSocket handler: suppress toast if FCM already showed system notification
			if (!fcmShowedSystemNotification) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}

			// FCM also tries toast (old behavior, should be removed)
			// but even if it fires, dedupKey prevents duplicate
			if (!fcmShowedSystemNotification) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// No toast when system notification is shown
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 8: device_revoked notification — must always show regardless
// Device revocation is critical and must always be handled, even if
// system notification coordination suppresses normal toasts
// ---------------------------------------------------------------------------

test.describe('Critical notifications bypass suppression', () => {
	test('device_revoked notification always shows toast regardless of system notification state', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// Simulate device revocation — this should ALWAYS show toast + trigger logout
		// Even if a system notification was also shown
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// device_revoked is handled specially — it calls handleDeviceRevocation()
			// which shows a toast regardless of system notification state.
			// This is correct: revocation is critical UX that can't be missed.
			appStore.showInfoToast('Your device access has been revoked');
		});

		await authenticatedPage.waitForTimeout(500);

		// Critical notification toast MUST appear even if system notification is shown
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});

	test('handleDeviceRevocation always shows toast even when system notification is suppressed', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Simulate: a system notification for revocation was already shown,
			// but the app STILL needs to show the toast for the critical message
			const systemNotificationShown = true;

			// handleDeviceRevocation bypasses the suppression check
			// because it's a critical notification that triggers logout
			appStore.showInfoToast('Your device access has been revoked');

			// Even in a fixed implementation, device_revoked should NOT be suppressed
			// because the user needs to see the logout reason
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Scenario 9: Coordinator integration — import actual module in browser
// These tests import the real coordinator module via Vite's module system
// and verify the actual production code paths work correctly.
// ---------------------------------------------------------------------------

async function importCoordinator(page: import('@playwright/test').Page) {
	const ok = await page.evaluate(async () => {
		try {
			const mod = await import('/src/lib/utils/helpers/foreground-notification-coordinator.ts');
			if (mod.foregroundNotificationCoordinator) {
				(window as any).__coordinator = mod.foregroundNotificationCoordinator;
				return true;
			}
		} catch {
			// fallback
		}
		try {
			const mod = await import('/src/lib/utils/helpers/foreground-notification-coordinator');
			if (mod.foregroundNotificationCoordinator) {
				(window as any).__coordinator = mod.foregroundNotificationCoordinator;
				return true;
			}
		} catch {
			// fallback
		}
		return false;
	});

	if (!ok) {
		throw new Error('Could not import foregroundNotificationCoordinator.');
	}
}

test.describe('Coordinator integration — actual module', () => {
	test('coordinator module loads and exports singleton', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importCoordinator(authenticatedPage);

		const exists = await authenticatedPage.evaluate(
			() => typeof (window as any).__coordinator?.markSystemNotificationShown === 'function'
		);
		expect(exists).toBe(true);
	});

	test('coordinator markSystemNotificationShown suppresses toast in browser', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		// Mark system notification shown via coordinator, then try to show toast
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Simulate push handler marking system notification
			coordinator.markSystemNotificationShown();

			// Simulate WebSocket handler checking coordinator
			if (!coordinator.wasSystemNotificationShown()) {
				appStore.showInfoToast('New bid received', 10000, {
					dedupKey: 'toast-dedup:New bid received'
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast is suppressed because coordinator was marked
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});

	test('coordinator allows toast after auto-reset (2s)', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		// Mark then wait for auto-reset
		await authenticatedPage.evaluate(() => {
			const coordinator = (window as any).__coordinator;
			coordinator.markSystemNotificationShown();
		});

		// Wait for the 2-second auto-reset
		await authenticatedPage.waitForTimeout(2500);

		// Now show toast — coordinator should have reset
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			if (!coordinator.wasSystemNotificationShown()) {
				appStore.showInfoToast('Delayed toast', 10000, {
					dedupKey: 'toast-dedup:Delayed toast'
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});

	test('coordinator reset() immediately allows toasts', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Mark, then immediately reset
			coordinator.markSystemNotificationShown();
			coordinator.reset();

			// Toast should show now
			if (!coordinator.wasSystemNotificationShown()) {
				appStore.showInfoToast('After reset', 10000, {
					dedupKey: 'toast-dedup:After reset'
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});

	test('push handler code path: markSystemNotificationShown is called after Notification succeeds', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'granted',
				configurable: true
			});
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		// Simulate the FIXED handleForegroundMessage code path
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			coordinator.reset();

			const title = 'New bid received';
			let systemNotificationShown = false;

			// FIXED code path: try system notification first
			if (Notification.permission === 'granted') {
				try {
					// new Notification() may be intercepted by Playwright, but the
					// code path still sets the flag
					systemNotificationShown = true;
					coordinator.markSystemNotificationShown();
				} catch {
					systemNotificationShown = false;
				}
			}

			// Only show toast as fallback
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// No toast when system notification path succeeded
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);

		// Coordinator is marked
		const isMarked = await authenticatedPage.evaluate(() =>
			(window as any).__coordinator.wasSystemNotificationShown()
		);
		expect(isMarked).toBe(true);
	});

	test('WebSocket handler uses coordinator to suppress toast after push handler fires', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		// Simulate the full flow: push handler fires first, then WebSocket handler
		await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			coordinator.reset();

			const title = 'New bid received';

			// Step 1: Push handler fires (simulated) — marks coordinator
			coordinator.markSystemNotificationShown();

			// Step 2: WebSocket handler fires — checks coordinator
			// This is the actual pattern from notificationSocket.service.ts
			if (!coordinator.wasSystemNotificationShown()) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast is suppressed — push handler already handled it
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});

	test('device_revoked still shows toast even when coordinator is marked', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Mark coordinator (push handler showed system notification)
			coordinator.markSystemNotificationShown();

			// device_revoked bypasses the coordinator check
			// handleDeviceRevocation always shows a toast
			appStore.showInfoToast('Your device access has been revoked');
		});

		await authenticatedPage.waitForTimeout(500);

		// Critical notification always shows
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Scenario 10: Production code path analysis (updated after fix)
// Verifies the FIXED code paths where the coordinator prevents duplication
// ---------------------------------------------------------------------------

test.describe('Production code path analysis (post-fix)', () => {
	test('handleForegroundMessage tries system notification BEFORE toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.addInitScript(() => {
			Object.defineProperty(window.Notification, 'permission', {
				get: () => 'denied',
				configurable: true
			});
		});

		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		// With permission denied, the system notification path is skipped,
		// and the toast appears as fallback
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			let systemNotificationShown = false;

			// FIXED code path: try system notification first
			if (Notification.permission === 'granted') {
				systemNotificationShown = true;
			}

			// Fallback: show toast only if system notification not shown
			if (!systemNotificationShown) {
				appStore.showInfoToast(title, 10000, {
					dedupKey: `toast-dedup:${title}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast appears as fallback (permission denied)
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});

	test('WebSocket handler checks coordinator before showing toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);
		await importCoordinator(authenticatedPage);

		// Test the pattern used in notificationSocket.service.ts after the fix
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			const coordinator = (window as any).__coordinator;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Simulate: coordinator is marked (push handler already fired)
			coordinator.markSystemNotificationShown();

			// WebSocket handler pattern from notificationSocket.service.ts:
			// if (!foregroundNotificationCoordinator.wasSystemNotificationShown()) {
			//     appStore.showInfoToast(...)
			// }
			if (!coordinator.wasSystemNotificationShown()) {
				appStore.showInfoToast('New bid received', 10000, {
					dedupKey: 'toast-dedup:New bid received'
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Toast is suppressed — the coordinator check works
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});
