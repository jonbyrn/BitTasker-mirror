import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Visible once the app shell has loaded (SvelteKit sets title after this). */
function appShell(page: Page) {
	return page.getByRole('img', { name: /BitTasker/i }).or(page.getByRole('link', { name: /BitTasker/i }));
}

/**
 * Smoke test: verifies the app starts and the homepage loads.
 * Safe to run locally (npm run dev) and in CI (webServer starts the app).
 * We wait for the app shell first because SvelteKit sets the title after hydration; in CI this can be slow.
 */
test.describe('Homepage smoke', () => {
	test('loads homepage and shows app shell', async ({ page }) => {
		await page.goto('/');
		// Wait for app shell so title has been set (hydration can be slow in CI)
		await expect(appShell(page).first()).toBeVisible({ timeout: 20_000 });
		await expect(page).toHaveTitle(/BitTasker/i, { timeout: 5_000 });
	});

	test('homepage has main content', async ({ page }) => {
		await page.goto('/');
		await expect(appShell(page).first()).toBeVisible({ timeout: 20_000 });
	});
});
