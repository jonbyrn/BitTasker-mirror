/**
 * Reviews page E2E: post-login navigation to /dashboard/reviews and page validation.
 *
 * Run after 01-signup-onboarding (and optionally 02-credentials-login).
 * Use --workers=1 when running with 01 and 02.
 *
 * Requires VITE_NOSTR_RELAY_URL for full review data; page loads without it
 * but may show empty states.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-from-file';

test.describe('Reviews page post-login (signup user)', () => {
	test.skip(
		() => !webauthnCredentialsFileExists(),
		CREDENTIALS_MISSING_MESSAGE
	);

	test.use({ credentialLabel: 'signup' });

	test('logs in, navigates to reviews page, validates page loads', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await expect(page).toHaveURL(/\/dashboard/);

		await page.goto('/dashboard/reviews', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/reviews/);

		// Page title (Review Management)
		await expect(
			page.getByRole('heading', { name: /Review Management/i })
		).toBeVisible({ timeout: 15_000 });

		// Wait for loading to complete (Nostr queries may take a few seconds)
		// Tabs appear after data loads
		await expect(page.getByRole('button', { name: /Received/i })).toBeVisible({
			timeout: 15_000
		});
		await expect(page.getByRole('button', { name: /Given/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /Pending/i })).toBeVisible();

		// Main content: tabs container or review list
		await expect(page.locator('.tabs-boxed').first()).toBeVisible();
	});
});
