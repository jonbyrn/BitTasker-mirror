/**
 * Wallet balance management E2E (optional; currently skipped).
 *
 * Run 01-signup-onboarding and 02-credentials-login first. This spec is put aside
 * for now; unskip the describe when re-enabling wallet E2E.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from '../fixtures/passkey-auth-from-file';

test.describe.skip('Wallet balance management (passkey from file)', () => {
	test.skip(
		!webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.beforeEach(async ({ authenticatedPageFromPasskeyFile }) => {
		await authenticatedPageFromPasskeyFile.goto('/dashboard/wallet');
		await authenticatedPageFromPasskeyFile.waitForLoadState('networkidle');
	});

	test('should display wallet balance', async ({ authenticatedPageFromPasskeyFile }) => {
		// Use Playwright locators (not a single CSS string): .card or Send/Receive buttons
		const walletContent = authenticatedPageFromPasskeyFile
			.locator('.card')
			.or(authenticatedPageFromPasskeyFile.getByRole('button', { name: /Send|Receive/i }))
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15_000 });
	});

	test('should reach wallet page when authenticated', async ({ authenticatedPageFromPasskeyFile }) => {
		await expect(authenticatedPageFromPasskeyFile).toHaveURL(/\/(dashboard\/)?wallet/);
	});
});
