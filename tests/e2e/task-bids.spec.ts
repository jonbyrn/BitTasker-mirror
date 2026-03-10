import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard task bids route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('shows an error or empty-like state for a non-existent task bids page', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const missingTaskId = `missing-bids-e2e-${Date.now()}`;

		await page.goto(`/dashboard/task/${missingTaskId}/bids`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/dashboard/task/${missingTaskId}/bids`));

		await expect
			.poll(async () => {
				const hasErrorCard = await page
					.getByText(/error|failed|no bids|not found|unable/i)
					.first()
					.isVisible()
					.catch(() => false);
				const hasRetryButton = await page
					.getByRole('button')
					.filter({ hasText: /retry|bids\.retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasErrorCard || hasRetryButton;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('opens a concrete dashboard task bids route when available and reaches stable action state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard?tab=tasks', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\?tab=tasks|\/dashboard$/);

		const taskBidsLink = page.locator('a[href*="/dashboard/task/"][href$="/bids"]').first();
		const hasTaskBidsLink = await taskBidsLink.isVisible().catch(() => false);
		if (!hasTaskBidsLink) {
			await expect(
				page.getByText(/no tasks|no_results|empty|retry|error/i).first()
			).toBeVisible();
			return;
		}

		await taskBidsLink.click();
		await expect(page).toHaveURL(/\/dashboard\/task\/.+\/bids/);

		await expect
			.poll(async () => {
				const hasBidActionButton = await page
					.getByRole('button')
					.filter({ hasText: /accept|decline|rejected|accepted|message|show details/i })
					.first()
					.isVisible()
					.catch(() => false);
				const hasEmptyState = await page
					.getByText(/no bids|no proposals|no entries|task\.drawer\.no_bids/i)
					.first()
					.isVisible()
					.catch(() => false);
				const hasErrorRetry = await page
					.getByRole('button')
					.filter({ hasText: /retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasBidActionButton || hasEmptyState || hasErrorRetry;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});
});
