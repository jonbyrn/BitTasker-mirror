import { test, expect } from '@playwright/test';

test.describe('Public homepage funnel', () => {
	test('loads homepage and exposes core funnel CTAs', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/$/);
		await expect(page.locator('body')).toBeVisible();

		const browseTasks = page.locator('a[href="/tasks"]').first();
		const signup = page.locator('a[href="/auth/signup"]').first();
		await expect(browseTasks).toBeVisible();
		await expect(signup).toBeVisible();
	});

	test('navigates from homepage to tasks and signup', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });

		await page.locator('a[href="/tasks"]').first().click();
		await expect(page).toHaveURL(/\/tasks$/);
		await expect(page.locator('body')).toBeVisible();

		await page.goto('/', { waitUntil: 'load' });
		await page.locator('a[href="/auth/signup"]').first().click();
		await expect(page).toHaveURL(/\/auth\/signup$/);
	});

	test('links to how-it-works from homepage', async ({ page }) => {
		await page.goto('/', { waitUntil: 'load' });
		const howItWorks = page.locator('a[href="/how-it-works"]').first();

		await expect(howItWorks).toHaveCount(1);
		const isVisible = await howItWorks.isVisible().catch(() => false);
		if (isVisible) {
			await howItWorks.click();
		} else {
			await page.goto('/how-it-works', { waitUntil: 'load' });
		}

		await expect(page).toHaveURL(/\/how-it-works$/);
		await expect(page.locator('h1, h2, h3').first()).toBeVisible();
	});
});
