import { test, expect } from '@playwright/test';

const infoPages = ['/faq', '/how-it-works', '/about', '/contact'];

test.describe('Public info and support pages', () => {
	for (const path of infoPages) {
		test(`loads ${path} with visible hero/header content`, async ({ page }) => {
			await page.goto(path, { waitUntil: 'load' });
			await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));
			await expect(page.locator('main, section, .hero').first()).toBeVisible();
			await expect(page.locator('h1, h2, h3').first()).toBeVisible();
		});
	}

	test('faq accordion can expand at least one item', async ({ page }) => {
		await page.goto('/faq', { waitUntil: 'load' });

		const firstFaqButton = page.locator('button.collapse-title').first();
		await expect(firstFaqButton).toBeVisible();
		await firstFaqButton.click();
		await expect(page.locator('.collapse.collapse-open').first()).toBeVisible();
	});

	test('contact page exposes support mailto CTA', async ({ page }) => {
		await page.goto('/contact', { waitUntil: 'load' });
		const mailToLink = page.locator('a[href^="mailto:"]').first();
		await expect(mailToLink).toBeVisible();
	});
});
