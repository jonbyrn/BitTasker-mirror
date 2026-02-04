import { test, expect } from '@playwright/test';

/**
 * Smoke test: verifies the app starts and the homepage loads.
 * Safe to run locally (npm run dev) and in CI (webServer starts the app).
 */
test.describe('Homepage smoke', () => {
	test('loads homepage and shows app shell', async ({ page }) => {
		await page.goto('/');
		await expect(page).toHaveTitle(/BitTasker/i);
	});

	test('homepage has main content', async ({ page }) => {
		await page.goto('/');
		// Logo (img with BitTasker alt) or nav link – app shell loaded
		const logoOrLink = page.getByRole('img', { name: /BitTasker/i }).or(page.getByRole('link', { name: /BitTasker/i }));
		await expect(logoOrLink.first()).toBeVisible({ timeout: 10_000 });
	});
});
