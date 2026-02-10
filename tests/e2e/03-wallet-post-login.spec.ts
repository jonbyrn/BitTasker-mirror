/**
 * Logs in with signup credentials from the file, navigates to dashboard/wallet,
 * and validates the wallet page loads.
 *
 * Run after 01-signup-onboarding (and optionally 02-credentials-login).
 * Use --workers=1 when running with 01 and 02.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';

test.describe('Wallet post-login (signup user)', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.use({ credentialLabel: 'signup' });

	test('logs in with signup credentials, navigates to wallet, validates page loads', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await expect(page).toHaveURL(/\/dashboard/);

		await page.goto('/dashboard/wallet', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/wallet/);

		// Wallet page shows either connected UI (Receive/Send/Transactions) or no-wallet UI (Try Again)
		const walletContent = page
			.getByRole('button', { name: /Receive|Send|Transactions|Try Again/i })
			.first();
		await expect(walletContent).toBeVisible({ timeout: 15_000 });
	});
});
