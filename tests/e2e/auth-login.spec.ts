import { test, expect } from '@playwright/test';

test.describe('Auth login route', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('opens account recovery send flow from login page', async ({ page }) => {
		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login$/);

		const recoverLink = page.getByRole('link', { name: /recover|forgot/i }).first();
		await expect(recoverLink).toBeVisible();
		await Promise.all([
			page.waitForURL(/\/auth\/recover\/send$/, { timeout: 8_000 }),
			recoverLink.click()
		]);
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);
		await expect(page.locator('#email')).toBeVisible();
	});

	test('shows error state for invalid nsec key on submit', async ({ page }) => {
		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login$/);

		await page.getByTestId('login-with-nsec').click();
		const nsecInput = page.getByTestId('login-nsec-input');
		await nsecInput.fill('invalid-key');
		await page.getByTestId('login-submit').click();

		await expect(nsecInput).toHaveClass(/input-error/, { timeout: 10_000 });
	});
});
