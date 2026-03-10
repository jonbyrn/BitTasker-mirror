import { test, expect } from '@playwright/test';
import { requireMobileSafari } from './utils/ios-interactions';

test.describe('iOS login surface regressions', () => {
	test.describe.configure({ timeout: 60_000, retries: 0 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test('qr scanner modal closes and account recovery link remains tappable', async ({ page }, testInfo) => {
		requireMobileSafari(testInfo);

		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);

		const qrButton = page
			.locator('button')
			.filter({ hasText: /qr/i })
			.first();
		await expect(qrButton).toBeVisible({ timeout: 12_000 });
		await qrButton.click();

		const scannerModal = page.locator('.barcode-scanning-modal').first();
		await expect
			.poll(
				async () =>
					(await scannerModal.isVisible().catch(() => false)) ||
					(await page.getByTestId('login-error-alert').isVisible().catch(() => false)),
				{ timeout: 15_000 }
			)
			.toBe(true);

		if (await scannerModal.isVisible().catch(() => false)) {
			await scannerModal.locator('header button').first().click({ timeout: 2_000 }).catch(() => {});
			await expect(scannerModal).toBeHidden({ timeout: 12_000 });
		}

		await page.locator('a[href="/auth/recover/send"]').first().click();
		await expect(page).toHaveURL(/\/auth\/recover\/send(?:\?.*)?$/);
		await expect(page.locator('#email')).toBeVisible({ timeout: 8_000 });
	});

	test('passkey error exposes help modal and it can be closed', async ({
		page
	}, testInfo) => {
		requireMobileSafari(testInfo);

		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);

		await page.getByTestId('login-continue-passkey').click();
		const errorAlert = page.getByTestId('login-error-alert');
		await expect(errorAlert).toBeVisible({ timeout: 15_000 });

		const troubleshootingModal = page.locator('.modal.modal-open').first();
		const helpButton = errorAlert.getByRole('button').first();
		await expect(helpButton).toBeVisible({ timeout: 10_000 });
		await helpButton.click();
		await expect(troubleshootingModal).toBeVisible({ timeout: 15_000 });

		await troubleshootingModal.locator('.btn.btn-ghost').first().click();
		await expect(troubleshootingModal).toBeHidden({ timeout: 8_000 });
		await expect(errorAlert).toBeVisible({ timeout: 8_000 });
	});
});
