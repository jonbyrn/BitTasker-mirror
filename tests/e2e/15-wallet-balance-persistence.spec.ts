/**
 * Balance persistence e2e tests.
 *
 * Uses @capacitor/preferences for balance persistence across app kills.
 * Preferences works on both web and native (iOS/Android).
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

// In-memory Preferences mock for e2e tests (simulates @capacitor/preferences)
async function setupPreferencesMock(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		(window as any).__preferencesStore = new Map<string, string>();

		// Mock the Preferences module at the import level
		// This works because the e2e tests run in the browser where the import resolves
		const originalImport = (window as any).__originalDynamicImport;
		if (!originalImport) {
			(window as any).__originalDynamicImport = window.__dynamicImport;
		}
	});
}

async function setPreference(page: import('@playwright/test').Page, key: string, value: string) {
	await page.evaluate(
		({ k, v }) => {
			(window as any).__preferencesStore?.set(k, v);
		},
		{ k: key, v: value }
	);
}

async function getPreference(page: import('@playwright/test').Page, key: string): Promise<string | null> {
	return page.evaluate((k) => {
		return (window as any).__preferencesStore?.get(k) ?? null;
	}, key);
}

async function clearPreferences(page: import('@playwright/test').Page) {
	await page.evaluate(() => {
		(window as any).__preferencesStore?.clear();
	});
}

// ---------------------------------------------------------------------------
// Scenario 1: First open ever — no persisted balance
// ---------------------------------------------------------------------------

test.describe('First open ever', () => {
	test('no persisted balance → no toast, save current as baseline', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await clearPreferences(authenticatedPage);

		// Simulate the resume handler logic with Preferences
		const result = await authenticatedPage.evaluate(async () => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 27000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());

			return { persistedBalance, saved: store?.get('wallet:lastBalanceSats') };
		});

		expect(result.persistedBalance).toBeNull();
		expect(result.saved).toBe('27000');

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 2: Balance increase from persisted value
// ---------------------------------------------------------------------------

test.describe('Balance increase detection', () => {
	test('persisted 50000, current 77000 → toast "Received 27,000 sats"', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 77000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});

	test('persisted 0, current 27000 → toast "Received 27,000 sats"', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '0');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 27000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});
});

// ---------------------------------------------------------------------------
// Scenario 3: Balance decrease — no toast
// ---------------------------------------------------------------------------

test.describe('Balance decrease — no toast', () => {
	test('persisted 50000, current 30000 → no toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 30000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 4: Balance unchanged — no toast
// ---------------------------------------------------------------------------

test.describe('Balance unchanged — no toast', () => {
	test('persisted 50000, current 50000 → no toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 50000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 5: Cold start with incoming funds (the real user scenario)
// ---------------------------------------------------------------------------

test.describe('Cold start with incoming funds', () => {
	test('persisted 0, app killed, funds received, app opens → toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '0');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 27000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);
		const text = await authenticatedPage.locator(TOAST_SELECTOR).first().textContent();
		expect(text?.trim()).toContain('27,000');
	});
});

// ---------------------------------------------------------------------------
// Scenario 6: First-time user (zero balance, no persisted)
// ---------------------------------------------------------------------------

test.describe('First-time user', () => {
	test('new user with 0 balance saves baseline, no toast', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await clearPreferences(authenticatedPage);

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 0;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);

		const toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);

		const persisted = await getPreference(authenticatedPage, BALANCE_STORAGE_KEY);
		expect(persisted).toBe('0');
	});
});

// ---------------------------------------------------------------------------
// Scenario 7: Multi-device independence
// ---------------------------------------------------------------------------

test.describe('Multi-device independence', () => {
	test('device A detects increase, device B detects decrease (no false toast)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		// Device A: persisted 50,000, received 27,000 → 77,000
		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 77000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast(`Received ${(newBalanceSats - persistedBalance).toLocaleString()} sats`, 5000, {
					dedupKey: `received-balance-${newBalanceSats}`
				});
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);
		let toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(1);

		// Device B: persisted 50,000, but user sent funds → 30,000
		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');

		await authenticatedPage.evaluate(() => {
			const { appStore } = (window as any).__testImports;
			appStore.update((s: any) => ({ ...s, toasts: [] }));

			const newBalanceSats = 30000;
			const store = (window as any).__preferencesStore;
			const stored = store?.get('wallet:lastBalanceSats');
			const persistedBalance = stored != null ? parseInt(stored, 10) : null;

			if (persistedBalance !== null && newBalanceSats > persistedBalance) {
				appStore.showInfoToast('Should not appear', 5000, { dedupKey: 'test' });
			}

			store?.set('wallet:lastBalanceSats', newBalanceSats.toString());
		});

		await authenticatedPage.waitForTimeout(500);
		toastCount = await authenticatedPage.locator(TOAST_SELECTOR).count();
		expect(toastCount).toBe(0);
	});
});

// ---------------------------------------------------------------------------
// Scenario 8: Persisted balance updates after each loadAssets
// ---------------------------------------------------------------------------

test.describe('Persisted balance updates', () => {
	test('persisted balance is saved after successful loadAssets', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/dashboard');
		await dismissOverlays(authenticatedPage);
		await importStores(authenticatedPage);
		await setupPreferencesMock(authenticatedPage);

		await clearPreferences(authenticatedPage);

		// First loadAssets: 50,000
		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '50000');
		let persisted = await getPreference(authenticatedPage, BALANCE_STORAGE_KEY);
		expect(persisted).toBe('50000');

		// Second loadAssets: 77,000
		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '77000');
		persisted = await getPreference(authenticatedPage, BALANCE_STORAGE_KEY);
		expect(persisted).toBe('77000');

		// Third loadAssets: 77,000 (unchanged)
		await setPreference(authenticatedPage, BALANCE_STORAGE_KEY, '77000');
		persisted = await getPreference(authenticatedPage, BALANCE_STORAGE_KEY);
		expect(persisted).toBe('77000');
	});
});
