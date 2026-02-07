/**
 * Wallet balance management E2E using shared passkey credentials.
 *
 * Requires signup-onboarding.spec.ts to be run first in the same run so that
 * tests/e2e/.auth/webauthn-credentials.json exists. If the file is missing,
 * tests are skipped.
 *
 * Run with credentials:
 *   npx playwright test tests/e2e/signup-onboarding.spec.ts tests/e2e/wallet/balance-management.spec.ts --project=chromium
 *
 * Or after a previous signup run left the credential file:
 *   npx playwright test tests/e2e/wallet/balance-management.spec.ts --project=chromium
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from '../../src/lib/tests/e2e/fixtures/passkey-auth-from-file';

test.describe('Wallet balance management (passkey from file)', () => {
	test.skip(
		!webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.beforeEach(async ({ authenticatedPageFromPasskeyFile }) => {
		await authenticatedPageFromPasskeyFile.goto('/wallet');
		await authenticatedPageFromPasskeyFile.waitForLoadState('networkidle');
		const currentUrl = authenticatedPageFromPasskeyFile.url();
		if (!currentUrl.includes('/wallet')) {
			await authenticatedPageFromPasskeyFile.goto('/dashboard/wallet');
			await authenticatedPageFromPasskeyFile.waitForLoadState('networkidle');
		}
	});

	test('should display wallet balance', async ({ authenticatedPageFromPasskeyFile }) => {
		const walletContent = authenticatedPageFromPasskeyFile.locator(
			'.card, button:has-text("Send"), button:has-text("Receive"), text=/total.*balance|balance/i'
		).first();
		await expect(walletContent).toBeVisible({ timeout: 15_000 });
	});

	test('should reach wallet page when authenticated', async ({ authenticatedPageFromPasskeyFile }) => {
		await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/(dashboard\/)?wallet/);
	});
});
