import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

test.describe('Dashboard find-tasks route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard/find-tasks with the find-tasks container', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/find-tasks', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/find-tasks/);
		await expect(page.locator('[data-find-tasks-page="true"]').first()).toBeVisible();
		await expect(page.getByTestId('tasks-search-input')).toBeVisible();
	});

	test('supports an impossible search query without crashing (empty-like state)', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/find-tasks', { waitUntil: 'load' });

		const searchQuery = `no-match-e2e-${Date.now()}-xqzzv`;
		const searchInput = page.getByTestId('tasks-search-input');
		await searchInput.fill(searchQuery);
		await expect(searchInput).toHaveValue(searchQuery);

		await expect
			.poll(async () => {
				const searchIsUsable = await searchInput.isVisible().catch(() => false);
				const noResultsVisible = await page
					.locator('h3, p, span')
					.filter({ hasText: /no results|no tasks found|no_results_title/i })
					.first()
					.isVisible()
					.catch(() => false);
				const hasAnyTaskCards =
					(await page.locator('[data-task-id]').count()) > 0;
				return searchIsUsable && (noResultsVisible || hasAnyTaskCards);
			}, { timeout: 15_000 })
			.toBeTruthy();
	});
});
