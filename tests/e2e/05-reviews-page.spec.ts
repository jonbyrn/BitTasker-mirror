/**
 * Reviews page E2E: complete signup/onboarding with a virtual passkey, then validate
 * the reviews dashboard for a brand-new user. This is the deterministic full flow for
 * the reviews feature and does not depend on a pre-generated credentials file.
 *
 * Requires VITE_API_URL so onboarding/passkey registration can complete.
 */
import { test, expect } from './fixtures/signup-login-auth';
import {
	completeSignupOnboarding,
	WEBAUTHN_CHROMIUM_ONLY_MESSAGE
} from './utils/onboarding-helpers';

test.describe('Reviews page full flow (new signup user)', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', WEBAUTHN_CHROMIUM_ONLY_MESSAGE);

	test('signs up, completes onboarding with a passkey, and lands on a stable reviews page', async ({
		page
	}) => {
		test.setTimeout(240_000);

		await completeSignupOnboarding(page);

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
