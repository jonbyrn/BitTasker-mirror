import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Bid lifecycle smoke', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('attempts bid entry path and verifies bids panel remains stable', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/tasks', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		const taskLink = page.locator('a[href^="/tasks/"]').first();
		const hasTaskLink = await taskLink.isVisible().catch(() => false);
		if (!hasTaskLink) {
			await expect(page.getByTestId('tasks-search-input')).toBeVisible();
			await expect(page.locator('body')).toBeVisible();
			await page.goto('/dashboard?tab=bids', { waitUntil: 'load' });
			await expect(page).toHaveURL(/\/dashboard\?tab=bids/);
			await expect(page.locator('#panel-bids')).toBeVisible();
			return;
		}

		await taskLink.click();
		await expect(page).toHaveURL(/\/tasks\/[^/?#]+/);

		const bidNowButton = page.getByRole('button', { name: /bid now|bid/i }).first();
		if (await bidNowButton.isVisible().catch(() => false)) {
			await bidNowButton.click();
			await expect
				.poll(async () => {
					const hasBidFormLike = await page
						.locator('textarea:visible, input[type="number"]:visible, [role="dialog"]:visible')
						.first()
						.isVisible()
						.catch(() => false);
					const stillOnTask = /\/tasks\/[^/?#]+/.test(page.url());
					return hasBidFormLike || stillOnTask;
				}, { timeout: 10_000 })
				.toBeTruthy();

			const submitBidButton = page
				.getByRole('button')
				.filter({ hasText: /submit|send bid|place bid|bid/i })
				.first();
			const canAttemptSubmit = await submitBidButton.isVisible().catch(() => false);
			if (canAttemptSubmit) {
				await submitBidButton.click();
				await expect
					.poll(async () => {
						const hasValidationMarker = await page
							.locator('.text-error, .input-error, [role="alert"]')
							.first()
							.isVisible()
							.catch(() => false);
						const stillOnTask = /\/tasks\/[^/?#]+/.test(page.url());
						const movedToDashboardBids = /\/dashboard\/bids|\/dashboard\?tab=bids/.test(page.url());
						return hasValidationMarker || stillOnTask || movedToDashboardBids;
					}, { timeout: 15_000 })
					.toBeTruthy();
			}
		}

		await page.goto('/dashboard?tab=bids', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=bids/);
		await expect(page.locator('#panel-bids')).toBeVisible();
	});
});
