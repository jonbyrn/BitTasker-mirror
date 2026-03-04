import { test, expect } from '@playwright/test';

test.describe('Public error and not-found handling', () => {
	test('dedicated /404 page renders and go home works', async ({ page }) => {
		await page.goto('/404', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/404$/);
		await expect(page.getByRole('heading', { name: /page not found/i })).toBeVisible();

		await page.getByRole('button', { name: /go home/i }).click();
		await expect(page).toHaveURL(/\/$/);
	});

	test('unknown route renders error page with support link', async ({ page }) => {
		await page.goto('/e2e-unknown-path-404-check', { waitUntil: 'load' });
		await expect(page.locator('h1')).toContainText(/page not found|server error/i);
		await expect(page.locator('a[href="/contact"]').first()).toBeVisible();
	});
});
