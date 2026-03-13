import { test, expect, type Locator, type TestInfo } from '@playwright/test';
import { activate, firstVisibleLocator, waitForPublicPageReady } from './utils/ios-interactions';

function isMobileSafariProject(testInfo: TestInfo): boolean {
	return testInfo.project.name.includes('Mobile Safari');
}

async function activateAuthControl(
	page: import('@playwright/test').Page,
	locator: Locator,
	testInfo: TestInfo
): Promise<void> {
	if (isMobileSafariProject(testInfo)) {
		await waitForPublicPageReady(page);
		await activate(locator);
		return;
	}

	await locator.click();
}

test.describe('Auth login route', () => {
	test.use({ storageState: { cookies: [], origins: [] } });

	test('opens account recovery send flow from login page', async ({ page }, testInfo) => {
		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login$/);

		const recoverLink = await firstVisibleLocator(page, [
			'a[href="/auth/recover/send"]',
			'[data-testid="login-recover-link"]'
		]);
		await expect(recoverLink).toBeVisible();
		await Promise.all([
			page.waitForURL(/\/auth\/recover\/send$/, { timeout: 8_000 }),
			activateAuthControl(page, recoverLink, testInfo)
		]);
		await expect(page).toHaveURL(/\/auth\/recover\/send$/);
		await expect(page.locator('#email')).toBeVisible();
	});

	test('shows error state for invalid nsec key on submit', async ({ page }, testInfo) => {
		await page.goto('/auth/login', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/auth\/login$/);
		await waitForPublicPageReady(page);

		const nsecButton = await firstVisibleLocator(page, [
			'[data-testid="login-with-nsec"]',
			'button:has-text("Login with Nostr nsec")'
		]);
		await expect(nsecButton).toBeVisible({ timeout: 12_000 });
		await activateAuthControl(page, nsecButton, testInfo);
		const nsecInput = page.getByTestId('login-nsec-input');
		await expect(nsecInput).toBeVisible({ timeout: 10_000 });
		await nsecInput.fill('invalid-key');
		const loginSubmit = await firstVisibleLocator(page, [
			'[data-testid="login-submit"]',
			'button:has-text("Login")'
		]);
		await activateAuthControl(page, loginSubmit, testInfo);

		await expect(nsecInput).toHaveClass(/input-error/, { timeout: 10_000 });
	});
});
