import { test, expect } from '@playwright/test';

test.describe('Verify email route', () => {
	test('tokenized verify-email route reaches loading-or-terminal state without crashing', async ({ page }) => {
		await page.goto('/verify-email?token=e2e-invalid-token', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/verify-email\?token=e2e-invalid-token$/);

		await expect
			.poll(async () => {
				const atLogin = /\/auth\/login$/.test(page.url());
				const hasSpinner = await page
					.locator('.animate-spin.rounded-full.border-4.border-t-transparent')
					.first()
					.isVisible()
					.catch(() => false);
				const hasFailureState = await page
					.locator('div.bg-base-100.w-full.max-w-md.rounded-lg.p-8.shadow-lg')
					.first()
					.isVisible()
					.catch(() => false);
				return atLogin || hasSpinner || hasFailureState;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('shows invalid-link failure state when token is missing', async ({ page }) => {
		await page.goto('/verify-email', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/verify-email$/);

		const verifyCard = page.locator('div.bg-base-100.w-full.max-w-md.rounded-lg.p-8.shadow-lg');
		await expect(verifyCard.locator('a[href="/auth/login"]')).toBeVisible();
		await expect(verifyCard).toContainText(/verification failed|verify|invalid|token/i);
	});

	test('handles explicit but invalid token with failure-or-login stable state', async ({ page }) => {
		await page.goto('/verify-email?token=e2e-clearly-invalid-token', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/verify-email\?token=e2e-clearly-invalid-token$/);

		await expect
			.poll(async () => {
				const atLogin = /\/auth\/login$/.test(page.url());
				const hasFailureState = await page
					.locator('div.bg-base-100.w-full.max-w-md.rounded-lg.p-8.shadow-lg')
					.first()
					.isVisible()
					.catch(() => false);
				return atLogin || hasFailureState;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});
});
