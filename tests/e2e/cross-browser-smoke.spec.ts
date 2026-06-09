import { test, expect } from './fixtures/cross-browser-auth';

/**
 * Cross-browser smoke tests.
 *
 * These tests run on ALL configured browser engines (Chromium, Firefox, WebKit,
 * Mobile Chrome, Mobile Safari) using nsec-based auth instead of passkeys.
 *
 * Run all browsers:   npx playwright test cross-browser-smoke
 * Run one browser:    npx playwright test cross-browser-smoke --project=firefox
 * Run mobile only:    npx playwright test cross-browser-smoke --project="Mobile Chrome"
 */

test.describe('Cross-browser smoke tests', () => {
	test('dashboard loads after nsec auth', async ({ authenticatedPage: page }) => {
		await page.goto('/dashboard');
		await expect(page).toHaveURL(/\/dashboard/);
		// Verify the page has loaded with content
		await expect(page.locator('body')).not.toBeEmpty();
	});

	test('homepage is accessible', async ({ authenticatedPage: page }) => {
		await page.goto('/');
		await expect(page.locator('body')).not.toBeEmpty();
	});

	test('services page loads', async ({ authenticatedPage: page }) => {
		await page.goto('/services');
		await expect(page).toHaveURL(/\/services/);
	});

	test('wallet page loads', async ({ authenticatedPage: page }) => {
		await page.goto('/dashboard?tab=wallet');
		await expect(page).toHaveURL(/\/dashboard/);
	});

	test('navigation preserves auth state across pages', async ({ authenticatedPage: page }) => {
		await page.goto('/dashboard');
		await expect(page).toHaveURL(/\/dashboard/);

		await page.goto('/services');
		await expect(page).toHaveURL(/\/services/);

		await page.goto('/dashboard');
		await expect(page).toHaveURL(/\/dashboard/);
	});
});
