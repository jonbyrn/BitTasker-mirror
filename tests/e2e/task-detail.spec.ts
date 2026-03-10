import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard task detail route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('shows a 404-like missing-task state for a non-existent task id', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const missingTaskId = `missing-e2e-${Date.now()}`;

		await page.goto(`/dashboard/task/${missingTaskId}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/dashboard/task/${missingTaskId}`));

		await expect(
			page
				.getByText(/task.*not.*found|task_not_found|failed_to_load/i)
				.first()
		).toBeVisible({ timeout: 20_000 });
	});

	test('supports browser back navigation after opening a missing-task route', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const missingTaskId = `missing-back-e2e-${Date.now()}`;

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/);

		await page.goto(`/dashboard/task/${missingTaskId}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/dashboard/task/${missingTaskId}`));

		await page.goBack();
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/, { timeout: 10_000 });
	});
});
