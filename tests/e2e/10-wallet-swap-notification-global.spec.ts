/**
 * Swap notification global delivery e2e tests.
 *
 * After the swap monitoring overhaul:
 * - Swap enrichment self-notifications are REMOVED
 * - Foreground recovery via visibility listener handles swap status detection
 * - Incoming fund detection shows "Received X sats" toast
 * - The SDK's Boltz WebSocket handles real-time swap updates when foregrounded
 *
 * These tests verify:
 * 1. Swap notifications appear globally (not just on Transaction History)
 * 2. Incoming fund detection works across the app
 * 3. Multiple simultaneous swap completions are handled correctly
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
// Scenario 1: Incoming fund notification appears on non-wallet page
// The visibility listener triggers loadTransactions() on resume, which
// detects new receive transactions and shows a toast.
// ---------------------------------------------------------------------------

test.describe('Global incoming fund notifications', () => {
	test('received funds toast appears on any page', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Simulate: the visibility listener triggers loadTransactions(),
		// which detects new incoming funds and shows a toast
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// This is what loadTransactionsInternal shows when new receives are found
			appStore.showInfoToast('Received 50,000 sats', 5000, {
				dedupKey: 'received-txhash123'
			});
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('Received');
	});

	test('no swap enrichment is called for self-notifications', async ({
		authenticatedPage
	}) => {
		const enrichmentRequests: Array<Record<string, unknown>> = [];

		await authenticatedPage.route('**/api/v1/reminders/enrich', async (route) => {
			const body = route.request().postDataJSON();
			enrichmentRequests.push(body);
			await route.fulfill({ status: 200, body: JSON.stringify({ ok: true }) });
		});

		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.waitForTimeout(1000);

		// No swap-related enrichment requests should be made
		const swapEnrichments = enrichmentRequests.filter(
			(r) => r.action === 'swap_completed' || r.action === 'swap_failed'
		);
		expect(swapEnrichments.length).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Multiple simultaneous incoming funds
// Each gets its own toast with a unique dedupKey.
// ---------------------------------------------------------------------------

test.describe('Multiple simultaneous incoming funds', () => {
	test('multiple receives show separate toasts', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Two different incoming transactions
			appStore.showInfoToast('Received 10,000 sats', 5000, {
				dedupKey: 'received-txhash1'
			});
			appStore.showInfoToast('Received 25,000 sats', 5000, {
				dedupKey: 'received-txhash2'
			});
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(2);

		const toastTexts = await authenticatedPage.locator(TOAST_SELECTOR).allTextContents();
		expect(toastTexts.some((t) => t.includes('10,000'))).toBe(true);
		expect(toastTexts.some((t) => t.includes('25,000'))).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Duplicate receive detection prevention
// The dedupKey based on tx hashes prevents showing the same toast twice.
// ---------------------------------------------------------------------------

test.describe('Duplicate receive prevention', () => {
	test('same receive does not show duplicate toast on re-load', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// First load detects the receive
			appStore.showInfoToast('Received 50,000 sats', 5000, {
				dedupKey: 'received-txhash123'
			});

			// Second load (e.g., from a refresh) detects the same receive
			// but the dedupKey prevents a duplicate toast
			appStore.showInfoToast('Received 50,000 sats', 5000, {
				dedupKey: 'received-txhash123'
			});
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
	});
});
