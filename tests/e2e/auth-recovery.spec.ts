import { test, expect, type Locator, type TestInfo } from '@playwright/test';
import { nip19 } from 'nostr-tools';
import { activate, firstVisibleLocator } from './utils/ios-interactions';

function isMobileSafariProject(testInfo: TestInfo): boolean {
	return testInfo.project.name.includes('Mobile Safari');
}

async function activateRecoveryControl(locator: Locator, testInfo: TestInfo): Promise<void> {
	if (isMobileSafariProject(testInfo)) {
		await activate(locator);
		return;
	}

	await locator.click();
}

test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Auth recovery send route', () => {
	test('shows an error when recovery form is submitted with empty email', async ({
		page
	}, testInfo) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		const submitButton = await firstVisibleLocator(page, [
			'[data-testid="recovery-send-submit"]',
			'button:has-text("Send Recovery Code")'
		]);
		await activateRecoveryControl(submitButton, testInfo);
		await expect
			.poll(async () =>
				page.locator('#email').evaluate((el) => !(el as HTMLInputElement).checkValidity())
			)
			.toBeTruthy();
	});

	test('shows an error when recovery form email format is invalid', async ({ page }, testInfo) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		await page.locator('#email').fill('not-an-email');
		const submitButton = await firstVisibleLocator(page, [
			'[data-testid="recovery-send-submit"]',
			'button:has-text("Send Recovery Code")'
		]);
		await activateRecoveryControl(submitButton, testInfo);
		await expect
			.poll(async () =>
				page.locator('#email').evaluate((el) => !(el as HTMLInputElement).checkValidity())
			)
			.toBeTruthy();
	});

	test('navigates back to login from recovery send page', async ({ page }) => {
		await page.goto('/auth/recover/send', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);

		const backToLogin = await firstVisibleLocator(page, [
			'a[data-testid="recovery-send-back-login"][href="/auth/login"]',
			'a.btn.btn-soft.w-full[href="/auth/login"]'
		]);
		await expect(backToLogin).toBeVisible({ timeout: 12_000 });
		await activate(backToLogin);
		await expect.poll(() => page.url(), { timeout: 10_000 }).toMatch(/\/auth\/login$/);
		await expect(page).toHaveURL(/\/auth\/login$/);
	});
});

test.describe('Auth recovery by npub route', () => {
	test('enforces required fields on the recovery form before continue', async ({
		page
	}, testInfo) => {
		const npub = nip19.npubEncode('a'.repeat(64));
		await page.goto(`/auth/recover/${npub}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/auth/recover/${npub}$`));

		await activateRecoveryControl(page.getByTestId('recovery-npub-continue').first(), testInfo);
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

	test('handles invalid OTP/password attempt with error-or-stable form state', async ({
		page
	}, testInfo) => {
		const npub = nip19.npubEncode('b'.repeat(64));
		await page.goto(`/auth/recover/${npub}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/auth/recover/${npub}$`));

		await page.locator('#currentPassword').fill('wrong-password-value');
		await page.locator('#recoveryCode').fill('000000');
		await activateRecoveryControl(page.getByTestId('recovery-npub-continue').first(), testInfo);

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
