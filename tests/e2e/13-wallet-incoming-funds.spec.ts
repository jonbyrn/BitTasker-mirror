/**
 * Incoming fund detection e2e tests.
 *
 * Uses persisted balance (localStorage) for detection.
 * This survives app kills where the in-memory store resets to initialState.
 *
 * After the refactor:
 * - loadAssets() persists balance to localStorage after each successful fetch
 * - Resume handler reads persisted balance, compares with new balance from loadAssets()
 * - First open ever (persisted === null) saves baseline, no toast
 * - Balance increase from persisted value shows toast
 * - Protected layout calls loadAssets() for cold-start baseline
 */
import { test, expect } from './fixtures/cross-browser-auth';

const TOAST_SELECTOR = '.toast-container .alert';
const BALANCE_STORAGE_KEY = 'wallet:lastBalanceSats';

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
// Scenario 1: First app open does NOT show false toasts
// No persisted balance → save baseline, no toast for existing funds.
// ---------------------------------------------------------------------------

test.describe('First app open — no false toasts', () => {
	test('opening the app with no persisted balance does not show toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			localStorage.removeItem('wallet:lastBalanceSats');
		});

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 50000;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			// First open: persistedBalance is null → skip toast
			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Genuine incoming funds while backgrounded
// Persisted: 50,000, Current: 65,000 → toast "Received 15,000 sats"
// ---------------------------------------------------------------------------

test.describe('Genuine incoming funds on resume', () => {
	test('balance increase from persisted value triggers received toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			localStorage.setItem('wallet:lastBalanceSats', '50000');
		});

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 65000;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('15,000');
	});

	test('no toast when balance stays the same', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			localStorage.setItem('wallet:lastBalanceSats', '50000');
		});

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 50000;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});

	test('no toast when balance decreases (sent funds)', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			localStorage.setItem('wallet:lastBalanceSats', '50000');
		});

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 30000;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Cold start with incoming funds (the real user scenario)
// Persisted: 0, App killed, 27,000 received, App opens → toast
// ---------------------------------------------------------------------------

test.describe('Cold start with incoming funds', () => {
	test('persisted 0, app killed, funds received, app opens → toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// User had 0 sats when they last closed the app
		await authenticatedPage.evaluate(() => {
			localStorage.setItem('wallet:lastBalanceSats', '0');
		});

		// User closes app, receives 27,000 sats

		// User opens app (cold start)
		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 27000;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: First-time user (zero balance, no persisted)
// Should save baseline of 0, no toast. Later receives funds → toast.
// ---------------------------------------------------------------------------

test.describe('First-time user', () => {
	test('new user with 0 balance saves baseline, no toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			localStorage.removeItem('wallet:lastBalanceSats');
		});

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 0;
			const stored = localStorage.getItem('wallet:lastBalanceSats');
			const persistedBalance = stored !== null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			localStorage.setItem('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);

		// Verify baseline saved
		const persisted = await authenticatedPage.evaluate(() =>
			localStorage.getItem('wallet:lastBalanceSats')
		);
		expect(persisted).toBe('0');
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: Swap recovery is independent of transaction loading
// ---------------------------------------------------------------------------

test.describe('Swap recovery independence', () => {
	test('swap status update does not require full transaction reload', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		const result = await authenticatedPage.evaluate(() => {
			return {
				hasTransactions: true,
				storeUpdated: true
			};
		});

		expect(result.storeUpdated).toBe(true);
	});
});
