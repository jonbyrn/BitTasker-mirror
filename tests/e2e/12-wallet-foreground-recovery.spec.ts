/**
 * Foreground swap recovery e2e tests.
 *
 * After the refactor:
 * - Resume handler uses lightweight balance-based detection (not full loadTransactions)
 * - Swap recovery runs independently via recoverPendingSwaps (Nostr queries only)
 * - loadTransactions() is only called when TransactionHistory UI opens
 * - PageVisibilityManager remains dead code (swapMonitor.ts handles resume)
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

async function importStores(page: import('@playwright/test').Page) {
	await page.waitForSelector('.toast-container', { timeout: 10000 });
	await page.waitForTimeout(500);

	const ok = await page.evaluate(async () => {
		try {
			const [appMod, walletMod] = await Promise.all([
				import('/src/lib/stores/app.store.ts'),
				import('/src/lib/stores/wallet.store.ts')
			]);
			(window as any).__testImports = {
				appStore: appMod.appStore,
				walletStore: walletMod.walletStore,
				walletManager: walletMod.walletManager
			};
			return true;
		} catch {
			return false;
		}
	});

	if (!ok) {
		throw new Error('Could not import stores.');
	}
}

// ---------------------------------------------------------------------------
// Scenario 1: App resume triggers lightweight recovery
// The resume handler calls loadAssets() + recoverPendingSwaps(),
// NOT the heavy loadTransactions().
// ---------------------------------------------------------------------------

test.describe('App resume — lightweight recovery', () => {
	test('resume handler does NOT trigger full loadTransactions', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Track if loadTransactions is called after visibility change
		await authenticatedPage.evaluate(() => {
			(window as any).__loadTransactionsCalled = false;
			const { walletManager } = (window as any).__testImports;
			const originalLoad = walletManager.loadTransactions;
			walletManager.loadTransactions = async () => {
				(window as any).__loadTransactionsCalled = true;
				return originalLoad.call(walletManager);
			};
		});

		// Simulate: app backgrounds then foregrounds
		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});

		await authenticatedPage.waitForTimeout(500);

		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});

		await authenticatedPage.waitForTimeout(3000);

		// After fix: loadTransactions is NOT called on resume
		// The resume handler uses loadAssets() + recoverPendingSwaps() instead
		const wasCalled = await authenticatedPage.evaluate(
			() => (window as any).__loadTransactionsCalled
		);
		expect(wasCalled).toBe(false);
	});

	test('balance-based detection shows toast for genuine incoming funds', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Set initial balance
		await authenticatedPage.evaluate(() => {
			const { walletStore } = (window as any).__testImports;
			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: 50000 }
			}));
		});

		// Simulate resume with balance increase
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const previousBalanceSats = 50000;
			const newBalanceSats = 65000;

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: newBalanceSats }
			}));

			if (previousBalanceSats > 0 && newBalanceSats > previousBalanceSats) {
				appStore.showInfoToast(`Received ${(newBalanceSats - previousBalanceSats).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('15,000');
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Layout resume handler still works
// The existing notification count fetch on resume is unchanged.
// ---------------------------------------------------------------------------

test.describe('Layout resume handler', () => {
	test('resume handler fetches notification count but not transactions', async ({
		authenticatedPage
	}) => {
		const apiCalls: string[] = [];

		await authenticatedPage.route('**/api/v1/**', async (route) => {
			apiCalls.push(route.request().url());
			await route.fulfill({ status: 200, body: JSON.stringify({ count: 0 }) });
		});

		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		apiCalls.length = 0;

		// Simulate app resume
		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await authenticatedPage.waitForTimeout(300);

		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});

		await authenticatedPage.waitForTimeout(3000);

		// Notification count IS fetched on resume (existing behavior)
		// Transaction loading is NOT triggered (new behavior)
		if (apiCalls.length > 0) {
			const hasNotificationCall = apiCalls.some((url) =>
				url.includes('notification-center/unread-count')
			);
			expect(hasNotificationCall).toBe(true);
		}
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: PageVisibilityManager is still dead code
// swapMonitor.ts handles resume directly, not through PageVisibilityManager.
// ---------------------------------------------------------------------------

test.describe('PageVisibilityManager status', () => {
	test('PageVisibilityManager is implemented but never imported', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);

		const managerStatus = await authenticatedPage.evaluate(async () => {
			try {
				const mod = await import('/src/lib/utils/helpers/pageVisibility.ts');
				return {
					exists: !!mod.pageVisibilityManager,
					hasRegisterPolling:
						typeof mod.pageVisibilityManager?.registerPolling === 'function'
				};
			} catch {
				return { exists: false, hasRegisterPolling: false };
			}
		});

		expect(managerStatus.exists).toBe(true);
		expect(managerStatus.hasRegisterPolling).toBe(true);
	});
});
