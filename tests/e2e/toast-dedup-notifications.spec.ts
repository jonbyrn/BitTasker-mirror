/**
 * Toast deduplication e2e tests.
 *
 * Dynamically imports appStore via Vite's module system in the browser
 * context, then exercises the dedupKey system through the store's public API.
 *
 * This is the same call pattern used by notificationSocket.service.ts and
 * push-notification.service.ts when showing notification toasts.
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

/**
 * Import appStore in the browser via Vite's module graph and expose it
 * on window.__testImports for subsequent evaluate() calls.
 */
async function importStore(page: import('@playwright/test').Page) {
	// Wait for the app to fully mount (Toast component subscribes to appStore)
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
			// Vite transform may use a different path — try without extension
		}
		try {
			const mod = await import('/src/lib/stores/app.store');
			if (mod.appStore) {
				(window as any).__testImports = { appStore: mod.appStore };
				return true;
			}
		} catch {
			// Last resort: search loaded modules
		}
		return false;
	});

	if (!ok) {
		throw new Error(
			'Could not import appStore. Ensure the dev server is running (Vite must resolve /src/lib/stores/app.store.ts).'
		);
	}
}

test.describe('Toast deduplication — dedupKey system', () => {
	test('showInfoToast with same dedupKey shows only one toast', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('Test dedup message', 10000, { dedupKey: 'test-key-1' });
			appStore.showInfoToast('Test dedup message', 10000, { dedupKey: 'test-key-1' });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toBe('Test dedup message');
	});

	test('showInfoToast with different dedupKeys shows two toasts', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('First notification', 10000, { dedupKey: 'key-a' });
			appStore.showInfoToast('Second notification', 10000, { dedupKey: 'key-b' });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(2);
	});

	test('showInfoToast without dedupKey allows duplicates', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('Repeated message', 10000);
			appStore.showInfoToast('Repeated message', 10000);
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(2);
	});

	test('showSuccessToast respects dedupKey', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showSuccessToast('Success!', 10000, { dedupKey: 'success-key' });
			appStore.showSuccessToast('Success!', 10000, { dedupKey: 'success-key' });
			appStore.showSuccessToast('Success!', 10000, { dedupKey: 'success-key' });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
	});

	test('showErrorToast respects dedupKey', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showErrorToast('Error!', 10000, { dedupKey: 'error-key' });
			appStore.showErrorToast('Error!', 10000, { dedupKey: 'error-key' });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
	});

	test('dedupKey allows new toast after previous one expires', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('First', 500, { dedupKey: 'expire-key' });
		});

		// Wait for toast auto-dismiss (500ms) + dedup min retention (3000ms)
		await authenticatedPage.waitForTimeout(4000);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.showInfoToast('Second', 10000, { dedupKey: 'expire-key' });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toBe('Second');
	});
});

test.describe('Toast deduplication — notification channel simulation', () => {
	test('simulated WebSocket + FCM with same title shows one toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const title = 'New bid received';
			const dedupKey = `toast-dedup:${title}`;

			// Channel 1: WebSocket (notificationSocket.service.ts)
			appStore.showInfoToast(title, 10000, { dedupKey });
			// Channel 2: FCM (push-notification.service.ts) — same dedupKey
			appStore.showInfoToast(title, 10000, { dedupKey });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
	});

	test('different notifications each show their own toast', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			appStore.showInfoToast('New bid on Task A', 10000, {
				dedupKey: 'toast-dedup:New bid on Task A'
			});
			appStore.showInfoToast('New bid on Task B', 10000, {
				dedupKey: 'toast-dedup:New bid on Task B'
			});
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(2);
	});

	test('three rapid duplicate calls produce one toast', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring');
		await dismissOverlays(authenticatedPage);
		await importStore(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			const key = 'toast-dedup:Rapid fire';
			appStore.showInfoToast('Rapid fire', 10000, { dedupKey: key });
			appStore.showInfoToast('Rapid fire', 10000, { dedupKey: key });
			appStore.showInfoToast('Rapid fire', 10000, { dedupKey: key });
		});

		await authenticatedPage.waitForTimeout(500);

		expect(await authenticatedPage.locator(TOAST_SELECTOR).count()).toBe(1);
	});
});
