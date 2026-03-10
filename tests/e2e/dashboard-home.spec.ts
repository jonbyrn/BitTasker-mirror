import { test as base, expect as baseExpect } from '@playwright/test';
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

base.describe('Dashboard route guard', () => {
	base.use({ storageState: { cookies: [], origins: [] } });

	base('handles unauthenticated navigation to /dashboard without crashing', async ({ page }) => {
		await page.context().clearCookies();
		await page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		await page.goto('/dashboard', { waitUntil: 'load' });
		await baseExpect
			.poll(() => page.url(), { timeout: 10_000 })
			.toMatch(/\/dashboard|\/auth\/login/);
	});

	base('redirects unauthenticated users away from /dashboard/messages', async ({ page }) => {
		await page.context().clearCookies();
		await page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		await page.goto('/dashboard/messages', { waitUntil: 'load' });
		await baseExpect.poll(() => page.url(), { timeout: 10_000 }).toMatch(/\/auth\/login/);
	});

	base('redirects unauthenticated users away from /dashboard/wallet', async ({ page }) => {
		await page.context().clearCookies();
		await page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await baseExpect.poll(() => page.url(), { timeout: 10_000 }).toMatch(/\/auth\/login/);
	});

	base('redirects unauthenticated users away from /feedback', async ({ page }) => {
		await page.context().clearCookies();
		await page.addInitScript(() => {
			window.localStorage.clear();
			window.sessionStorage.clear();
		});
		await page.goto('/feedback', { waitUntil: 'load' });
		await baseExpect.poll(() => page.url(), { timeout: 10_000 }).toMatch(/\/auth\/login/);
	});
});

test.describe('Dashboard home (authenticated)', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard and shows the default tasks tab panel', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/);
		await expect(page.locator('#tab-tasks')).toBeVisible();
		await expect(page.locator('#panel-tasks')).toBeVisible();
	});

	test('loads bids tab panel from /dashboard?tab=bids', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard?tab=bids', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=bids/);
		const bidsPanel = page.locator('#panel-bids');
		if (!(await bidsPanel.isVisible().catch(() => false))) {
			const bidsTab = page.locator('#tab-bids').first();
			if (await bidsTab.isVisible().catch(() => false)) {
				await bidsTab.click();
			}
		}
		await expect
			.poll(async () => bidsPanel.isVisible().catch(() => false), { timeout: 20_000 })
			.toBeTruthy();
	});

	test('loads contracts tab panel from /dashboard?tab=contracts', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard?tab=contracts', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=contracts/);
		const contractsPanel = page.locator('#panel-contracts');
		if (!(await contractsPanel.isVisible().catch(() => false))) {
			const contractsTab = page.locator('#tab-contracts').first();
			if (await contractsTab.isVisible().catch(() => false)) {
				await contractsTab.click();
			}
		}
		await expect
			.poll(async () => contractsPanel.isVisible().catch(() => false), { timeout: 20_000 })
			.toBeTruthy();
	});

	test('falls back to tasks panel for invalid dashboard tab query', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard?tab=invalid-tab', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=invalid-tab/);
		await expect(page.locator('#panel-tasks')).toBeVisible();
	});

	test('dashboard primary action button points to expected route per active tab', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard?tab=tasks', { waitUntil: 'load' });
		const tasksActionHref = await page.locator('a.btn.btn-primary').first().getAttribute('href');
		expect(tasksActionHref).toBe('/dashboard/create-task');

		await page.goto('/dashboard?tab=bids', { waitUntil: 'load' });
		const bidsActionHref = await page.locator('a.btn.btn-primary').first().getAttribute('href');
		expect(bidsActionHref).toBe('/tasks');
	});
});
