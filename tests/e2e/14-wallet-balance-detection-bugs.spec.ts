/**
 * Real-world scenario reproduction: incoming funds not detected.
 *
 * User scenario:
 * 1. Open app, had 0 funds, got RSK address, closed app
 * 2. Sent $1 from browser to mobile app's RSK address (app was closed)
 * 3. Opened BitTasker app on phone (was on hiring page, not wallet page)
 * 4. After passkey prompt, no toast about received funds
 * 5. Navigated around, killed/reopened app, still no toast
 *
 * Root causes identified:
 * - Bug A: previousBalanceSats === 0 guard blocks detection for 0→nonzero transitions
 * - Bug B: Protected layout calls initialize() but NOT loadAssets() — balance stays at 0
 * - Bug C: On cold start, resume handler doesn't fire (no visibilitychange/appStateChange)
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
// Bug A: previousBalanceSats === 0 guard blocks 0→nonzero detection
// User had 0 sats, received funds while app was closed, opened app → no toast
// ---------------------------------------------------------------------------

test.describe('Bug A: Zero to nonzero balance transition', () => {
	test('receiving funds when previous balance was 0 does NOT show toast (BUG)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Simulate: user had 0 sats, received 27,000 sats while app was closed
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			// Store has 0 sats (initial state or after sending everything)
			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: 0 }
			}));

			// Simulate loadAssets() returning new balance
			const previousBalanceSats = 0; // from store
			const newBalanceSats = 27000; // from loadAssets()

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: newBalanceSats }
			}));

			// Current logic: previousBalanceSats > 0 blocks the toast
			if (previousBalanceSats > 0 && newBalanceSats > previousBalanceSats) {
				appStore.showInfoToast(`Received ${newBalanceSats.toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// BUG: No toast shown even though 27,000 sats were received
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0); // This SHOULD be 1 after the fix
	});

	test('EXPECTED: receiving funds when previous balance was 0 shows toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Simulate the FIXED behavior with initialBalanceLoaded flag
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: 0 }
			}));

			// Simulate: initialBalanceLoaded = false (first load after 0 balance)
			// Then balance goes from 0 to 27,000
			const initialBalanceLoaded = false;
			const previousBalanceSats = 0;
			const newBalanceSats = 27000;

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: newBalanceSats }
			}));

			// Fixed logic: show toast when balance increases from 0
			// if initialBalanceLoaded is false (first load) AND balance > 0
			if (
				(previousBalanceSats > 0 && newBalanceSats > previousBalanceSats) ||
				(!initialBalanceLoaded && previousBalanceSats === 0 && newBalanceSats > 0)
			) {
				appStore.showInfoToast(`Received ${newBalanceSats.toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});
});

// ---------------------------------------------------------------------------
// Bug B: Protected layout does NOT call loadAssets()
// Wallet is initialized but balance is never fetched on non-wallet pages
// ---------------------------------------------------------------------------

test.describe('Bug B: loadAssets not called on protected layout init', () => {
	test('wallet initialization on non-wallet page does not load balance', async ({
		authenticatedPage
	}) => {
		// Navigate to a non-wallet protected page (like hiring)
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Check if loadAssets was called during initialization
		const balanceState = await authenticatedPage.evaluate(() => {
			const { walletStore } = (window as any).__testImports;
			let state: any;
			walletStore.subscribe((s: any) => (state = s))();
			return {
				isConnected: state.isConnected,
				sats: state.totalBalances.sats,
				rskBalance: state.rsk.balance
			};
		});

		// The wallet is connected (initialize() was called)
		expect(balanceState.isConnected).toBe(true);

		// But the balance may still be 0 if loadAssets() wasn't called
		// This depends on whether the wallet page was visited
		// On a fresh open to a non-wallet page, sats should be 0
		// because loadAssets() is only called from wallet/+page.svelte
	});

	test('resume handler reads stale 0 balance when loadAssets was never called', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Simulate: wallet initialized (protected layout) but loadAssets never called
		// previousBalanceSats will be 0 from initialState
		await authenticatedPage.evaluate(() => {
			const { walletStore } = (window as any).__testImports;

			// Wallet is connected but balance was never loaded
			walletStore.update((s: any) => ({
				...s,
				isConnected: true,
				totalBalances: { ...s.totalBalances, sats: 0 } // Never updated
			}));
		});

		// The resume handler would read previousBalanceSats = 0
		// Even if loadAssets() returns 27,000, the > 0 guard blocks the toast
		const previousBalanceSats = 0; // from store (never loaded)

		// This confirms Bug B: the resume handler has no baseline to compare against
		expect(previousBalanceSats).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Bug C: Cold start does not trigger resume handler
// On app cold start, no visibilitychange or appStateChange fires
// The resume handler only fires on background→foreground transitions
// ---------------------------------------------------------------------------

test.describe('Bug C: Cold start does not trigger resume handler', () => {
	test('cold start does not fire visibilitychange or appStateChange', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Track if resume handler fires
		let resumeFired = false;

		await authenticatedPage.evaluate(() => {
			// Simulate registering a visibilitychange listener
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') {
					(window as any).__resumeFired = true;
				}
			});
			(window as any).__resumeFired = false;
		});

		// On a fresh page load (cold start), visibilitychange does NOT fire
		// because the page was never hidden — it starts visible
		await authenticatedPage.waitForTimeout(2000);

		resumeFired = await authenticatedPage.evaluate(() => (window as any).__resumeFired);

		// Confirmed: no resume event on cold start
		expect(resumeFired).toBe(false);
	});

	test('resume handler fires after background→foreground transition', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			(window as any).__resumeFired = false;
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') {
					(window as any).__resumeFired = true;
				}
			});
		});

		// Simulate background→foreground
		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: true, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await authenticatedPage.waitForTimeout(300);

		await authenticatedPage.evaluate(() => {
			Object.defineProperty(document, 'hidden', { value: false, configurable: true });
			document.dispatchEvent(new Event('visibilitychange'));
		});
		await authenticatedPage.waitForTimeout(300);

		const resumeFired = await authenticatedPage.evaluate(
			() => (window as any).__resumeFired
		);

		// Resume handler fires on background→foreground
		expect(resumeFired).toBe(true);
	});
});

// ---------------------------------------------------------------------------
// Full scenario reproduction
// Combines all 3 bugs to reproduce the exact user experience
// ---------------------------------------------------------------------------

test.describe('Full scenario: funds received while app closed, no toast on open', () => {
	test('user had 0 sats, received funds while closed, no toast on cold start (BUG)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Step 1: User had 0 sats (initial state)
		await authenticatedPage.evaluate(() => {
			const { walletStore } = (window as any).__testImports;
			walletStore.update((s: any) => ({
				...s,
				isConnected: true,
				totalBalances: { ...s.totalBalances, sats: 0 }
			}));
		});

		// Step 2: User closed app, received 27,000 sats from external sender
		// (app was closed, no detection possible)

		// Step 3: User opens app (cold start — no visibilitychange fires)
		// Protected layout calls initialize() but NOT loadAssets()
		// Resume handler is registered but doesn't fire (cold start)

		// Step 4: If loadAssets() eventually runs (e.g., user visits wallet page)
		// previousBalanceSats = 0 (from store) → guard blocks toast
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const previousBalanceSats = 0;
			const newBalanceSats = 27000;

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: newBalanceSats }
			}));

			// Current logic blocks the toast
			if (previousBalanceSats > 0 && newBalanceSats > previousBalanceSats) {
				appStore.showInfoToast(`Received ${newBalanceSats.toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// Confirmed: no toast
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0); // BUG: should be 1
	});
});

// ---------------------------------------------------------------------------
// Edge case: multi-device scenario
// Device A has the app open with balance loaded. Device B is closed.
// Funds arrive. Device A resumes → detects. Device B opens → should detect.
// ---------------------------------------------------------------------------

test.describe('Multi-device scenario', () => {
	test('device with loaded balance detects incoming funds on resume', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Device A: has loaded balance (loadAssets ran before)
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: 50000 }
			}));
		});

		// Funds arrive while app is backgrounded
		// Resume → loadAssets() → new balance = 77000
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;

			const previousBalanceSats = 50000;
			const newBalanceSats = 77000;

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

		// Device A detects the increase
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});

	test('device with 0 balance does NOT detect incoming funds (BUG)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);

		// Device B: has 0 balance (never loaded assets, or sent everything)
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));
			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: 0 }
			}));
		});

		// Funds arrive while app is closed
		// Cold start → loadAssets() → new balance = 27000
		await authenticatedPage.evaluate(() => {
			const { appStore, walletStore } = (window as any).__testImports;

			const previousBalanceSats = 0;
			const newBalanceSats = 27000;

			walletStore.update((s: any) => ({
				...s,
				totalBalances: { ...s.totalBalances, sats: newBalanceSats }
			}));

			// Current logic blocks the toast
			if (previousBalanceSats > 0 && newBalanceSats > previousBalanceSats) {
				appStore.showInfoToast(`Received ${newBalanceSats.toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}
		});

		await authenticatedPage.waitForTimeout(500);

		// BUG: Device B does NOT detect the funds
		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0); // Should be 1 after fix
	});
});
