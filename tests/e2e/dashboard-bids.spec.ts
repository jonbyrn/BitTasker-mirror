import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard bids route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard/bids and reaches a stable list/empty/error state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/bids', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/bids$/);

		await expect
			.poll(async () => {
				const hasBidCard =
					(await page.getByRole('button', { name: /view task/i }).count()) > 0;
				const hasEmptyState =
					(await page.getByText(/no bids/i).first().isVisible().catch(() => false)) ||
					(await page
						.locator('span')
						.filter({ hasText: /no_bids_yet/i })
						.first()
						.isVisible()
						.catch(() => false));
				const hasErrorRetry = await page
					.getByRole('button')
					.filter({ hasText: /retry|bids\.retry/i })
					.first()
					.isVisible()
					.catch(() => false);
				return hasBidCard || hasEmptyState || hasErrorRetry;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});

	test('opens bid task details from bids panel when a bid card exists', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/bids', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/bids$/);

		const viewTaskButton = page.getByRole('button', { name: /view task/i }).first();
		const hasViewTask = await viewTaskButton.isVisible().catch(() => false);
		if (!hasViewTask) {
			await expect(
				page.getByText(/no bids|no_bids_yet|retry|bids\.retry/i).first()
			).toBeVisible();
			return;
		}

		await viewTaskButton.click();
		await expect
			.poll(() => page.url(), { timeout: 10_000 })
			.toMatch(/\/tasks\/|\/dashboard\/task\//);
	});

	test('supports bid withdrawal modal controls when a withdrawable bid exists', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		await page.goto('/dashboard/bids', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/bids$/);

		const withdrawButton = page.getByRole('button', { name: /withdraw bid|withdraw/i }).first();
		const hasWithdrawButton = await withdrawButton.isVisible().catch(() => false);
		if (!hasWithdrawButton) {
			await expect(
				page.getByText(/no bids|no_bids_yet|retry|bids\.retry/i).first()
			).toBeVisible();
			return;
		}

		await withdrawButton.click();
		await expect(page.locator('.modal.modal-open')).toBeVisible({ timeout: 10_000 });

		await page.getByRole('button', { name: /cancel/i }).first().click();
		await expect(page.locator('.modal.modal-open')).toHaveCount(0);

		await withdrawButton.click();
		await expect(page.locator('.modal.modal-open')).toBeVisible({ timeout: 10_000 });
		await page.getByRole('button', { name: /submit|withdraw/i }).last().click();

		await expect
			.poll(async () => {
				const modalClosed = (await page.locator('.modal.modal-open').count()) === 0;
				const stillOnBids = /\/dashboard\/bids$/.test(page.url());
				const hasToastOrStableUI = await page.locator('body').isVisible();
				return modalClosed && stillOnBids && hasToastOrStableUI;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});
});
