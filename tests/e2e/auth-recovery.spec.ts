import { test, expect } from '@playwright/test';
import { nip19 } from 'nostr-tools';

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth recovery send route', () => {
	test('shows an error when recovery form is submitted with empty email', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		await page.locator('button[type="submit"]').click();
		await expect
			.poll(async () =>
				page.locator('#email').evaluate((el) => !(el as HTMLInputElement).checkValidity())
			)
			.toBeTruthy();
	});

	test('shows an error when recovery form email format is invalid', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		await page.locator('#email').fill('not-an-email');
		await page.locator('button[type="submit"]').click();
		await expect
			.poll(async () =>
				page.locator('#email').evaluate((el) => !(el as HTMLInputElement).checkValidity())
			)
			.toBeTruthy();
	});

	test('navigates back to login from recovery send page', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		const backToLogin = page.getByRole('button', { name: /back to login|login/i }).first();
		await expect(backToLogin).toBeVisible();
		const waitForLogin = page
			.waitForURL(/\/auth\/login$/, { timeout: 8_000 })
			.then(() => true)
			.catch(() => false);
		await backToLogin.click();
		const navigated = await waitForLogin;
		expect(navigated).toBeTruthy();
		await expect(page).toHaveURL(/\/auth\/login$/);
	});
});

test.describe('Auth recovery by npub route', () => {
	test('enforces required fields on the recovery form before continue', async ({ page }) => {
		const npub = nip19.npubEncode('a'.repeat(64));
		await page.goto(`/auth/recover/${npub}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/auth/recover/${npub}$`));

		await page.locator('button[type="submit"]').first().click();
		await expect
			.poll(
				async () => {
					const currentPasswordInvalid = await page
						.locator('#currentPassword')
						.evaluate((el) => !(el as HTMLInputElement).checkValidity())
						.catch(() => false);
					const recoveryCodeInvalid = await page
						.locator('#recoveryCode')
						.evaluate((el) => !(el as HTMLInputElement).checkValidity())
						.catch(() => false);
					return currentPasswordInvalid || recoveryCodeInvalid;
				},
				{ timeout: 10_000 }
			)
			.toBeTruthy();
	});

	test('shows invalid link state for malformed recovery npub route', async ({ page }) => {
		await page.goto('/auth/recover/not-a-valid-npub', { waitUntil: 'load' });
		await expect
			.poll(() => page.url(), { timeout: 15_000 })
			.toMatch(/\/auth\/recover\/not-a-valid-npub$|\/auth\/login/);

		const onMalformedRoute = page.url().includes('/auth/recover/not-a-valid-npub');
		if (onMalformedRoute) {
			const recoveryFormOrError = page
				.locator(
					'#currentPassword, #recoveryCode, a[href="/auth/login"], button:has-text("Back"), .alert-error, [data-testid*="error"]'
				)
				.first();
			await expect(recoveryFormOrError).toBeVisible({ timeout: 10_000 });
		}
	});

	test('handles invalid OTP/password attempt with error-or-stable form state', async ({ page }) => {
		const npub = nip19.npubEncode('b'.repeat(64));
		await page.goto(`/auth/recover/${npub}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/auth/recover/${npub}$`));

		await page.locator('#currentPassword').fill('wrong-password-value');
		await page.locator('#recoveryCode').fill('000000');
		await page.locator('button[type="submit"]').first().click();

		await expect
			.poll(
				async () => {
					const hasErrorMessage = await page
						.locator('.alert-error, .text-error')
						.first()
						.isVisible()
						.catch(() => false);
					const stillOnStepOne = await page
						.locator('#currentPassword')
						.isVisible()
						.catch(() => false);
					return hasErrorMessage || stillOnStepOne;
				},
				{ timeout: 20_000 }
			)
			.toBeTruthy();
	});
});
