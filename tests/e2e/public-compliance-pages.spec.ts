import { test, expect } from '@playwright/test';

const compliancePages = ['/security', '/secure-payments', '/terms', '/privacy'];

test.describe('Public trust and compliance pages', () => {
	for (const path of compliancePages) {
		test(`loads ${path} and renders primary content`, async ({ page }) => {
			await page.goto(path, { waitUntil: 'load' });
			await expect(page).toHaveURL(new RegExp(`${path.replace('/', '\\/')}$`));
			await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 20_000 });
		});
	}

	test('terms links to privacy and secure-payments', async ({ page }) => {
		await page.goto('/terms', { waitUntil: 'load' });

		const privacyLink = page.locator('a[href="/privacy"]').first();
		const securePaymentsLink = page.locator('a[href="/secure-payments"]').first();

		await expect(privacyLink).toBeVisible();
		await expect(securePaymentsLink).toBeVisible();
	});
});
