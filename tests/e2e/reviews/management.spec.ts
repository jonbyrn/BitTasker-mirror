/**
 * Review Management E2E smoke test.
 *
 * Reuses the passkey credentials created by 01-signup-onboarding and validates the
 * deterministic empty-state management experience for the fresh signup user.
 *
 * Run after 01-signup-onboarding. WebAuthn login via CDP is Chromium-only.
 */
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from '../fixtures/passkey-auth-from-file';
import { WEBAUTHN_CHROMIUM_ONLY_MESSAGE } from '../utils/onboarding-helpers';

test.describe('Review Management (signup user via passkey)', () => {
	test.describe.configure({ timeout: 90_000 });
	test.skip(({ browserName }) => browserName !== 'chromium', WEBAUTHN_CHROMIUM_ONLY_MESSAGE);
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test.use({ credentialLabel: 'signup' });

	test('shows the expected empty states for a newly onboarded user', async ({
		authenticatedPageFromPasskeyFile
	}) => {
		const page = authenticatedPageFromPasskeyFile;

		await page.goto('/dashboard/reviews', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		await expect(page).toHaveURL(/\/dashboard\/reviews/);
		await expect(page.getByRole('heading', { name: 'Review Management' })).toBeVisible({
			timeout: 15_000
		});
		await expect(
			page.getByText(
				"Manage your reviews, view pending reviews, and see reviews you've given and received"
			)
		).toBeVisible();

		const receivedTab = page.getByRole('tab', { name: /^Received$/ });
		const givenTab = page.getByRole('tab', { name: /^Given$/ });
		const pendingTab = page.getByRole('tab', { name: /^Pending$/ });

		await expect(receivedTab).toHaveClass(/tab-active/);
		await expect(givenTab).toBeVisible();
		await expect(pendingTab).toBeVisible();

		await expect(page.getByText('Review Summary')).toBeVisible();
		await expect(page.getByText('No reviews yet').first()).toBeVisible();
		await expect(
			page.getByText('Published reviews will appear here once this account has feedback.')
		).toBeVisible();

		await givenTab.click();
		await expect(givenTab).toHaveClass(/tab-active/);
		await expect(page.getByText('No reviews yet').last()).toBeVisible();

		await pendingTab.click();
		await expect(pendingTab).toHaveClass(/tab-active/);
		await expect(page.getByText('No pending reviews')).toBeVisible();
		await expect(
			page.getByText("You're all caught up! All completed tasks have been reviewed.")
		).toBeVisible();
	});
});
