import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';
import type { TestInfo } from '@playwright/test';
import { requireMobileSafari } from './utils/ios-interactions';

test.use({ credentialLabel: 'signup' });

test.describe('iOS passkey proof', () => {
	test.beforeEach(() => {
		expect(webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE).toBeTruthy();
	});

	test('authenticates and reaches dashboard tasks panel', async (
		{ authenticatedPageCrossBrowser },
		testInfo: TestInfo
	) => {
		requireMobileSafari(testInfo, 'iOS Mobile Safari only');
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?$/);
		await expect(page.getByTestId('login-link')).toHaveCount(0);
		await expect(page.locator('#panel-tasks')).toBeVisible({ timeout: 15_000 });
	});
});
