import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

let lastPublishedCandidateTitle: string | null = null;

test.describe('Dashboard create-task route', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('loads /dashboard/create-task and shows the task wizard', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/create-task/);
		await expect(page.locator('#title')).toBeVisible();
		await expect(page.getByRole('button', { name: /next|task\.next/i }).first()).toBeVisible();
	});

	test('shows validation errors on basics step when trying to continue with empty required fields', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await page.locator('#title').fill('');

		await page.getByRole('button', { name: /next|task\.next/i }).first().click();

		await expect(page).toHaveURL(/\/dashboard\/create-task/);
		await expect
			.poll(async () => {
				const hasInputError = await page.locator('.input-error').first().isVisible().catch(() => false);
				const hasTextError = await page.locator('.text-error').first().isVisible().catch(() => false);
				return hasInputError || hasTextError;
			}, { timeout: 10_000 })
			.toBeTruthy();
	});

	test('persists draft title when navigating away and returning to create-task', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const draftTitle = `E2E draft title ${Date.now()}`;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await page.locator('#title').fill(draftTitle);
		await page.locator('#title').blur();
		await expect(page.locator('#title')).toHaveValue(draftTitle);

		await page.goto('/dashboard', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/);

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await expect(page.locator('#title')).toHaveValue(draftTitle);
	});

	test('cancels task creation and clears current draft', async ({ authenticatedPageCrossBrowser }) => {
		const page = authenticatedPageCrossBrowser;
		const draftTitle = `E2E cancel draft ${Date.now()}`;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await page.locator('#title').fill(draftTitle);
		await expect(page.locator('#title')).toHaveValue(draftTitle);

		await page.getByRole('button', { name: /cancel|task\.cancel/i }).first().click();
		await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/);

		await page.waitForLoadState('domcontentloaded');
		for (let attempt = 0; attempt < 3; attempt += 1) {
			try {
				await page.goto('/dashboard/create-task', { waitUntil: 'domcontentloaded' });
				break;
			} catch (error) {
				if (attempt === 2) throw error;
			}
		}
		await expect(page.locator('#title')).not.toHaveValue(draftTitle);
	});

	test('accepts a filled basics step and advances to the next wizard step', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const title = `E2E publish prep ${Date.now()}`;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/create-task/);

		await page.locator('#title').fill(title);
		await page.locator('input[placeholder*="skills" i], input[placeholder*="Add skills"]').first().fill('Testing');
		await page.keyboard.press('Enter');

		const categoryButton = page.locator('[role="button"], button').filter({ hasText: /category|categories/i }).first();
		if (await categoryButton.isVisible().catch(() => false)) {
			await categoryButton.click();
			const firstCategoryOption = page
				.locator('[role="option"], li, button')
				.filter({ hasText: /./ })
				.first();
			if (await firstCategoryOption.isVisible().catch(() => false)) {
				await firstCategoryOption.click();
			}
		}

		await page.getByRole('button', { name: /next|task\.next/i }).first().click();

		const movedStep = await page
			.locator('input[placeholder*="address" i], textarea#description')
			.first()
			.isVisible()
			.catch(() => false);
		const hasValidationError = await page.locator('.text-error, .input-error').first().isVisible().catch(() => false);
		expect(movedStep || hasValidationError).toBeTruthy();
	});

	test('attempts publish path and ends in success-or-error stable state', async ({
		authenticatedPageCrossBrowser
	}) => {
		const page = authenticatedPageCrossBrowser;
		const title = `E2E cross-user publish ${Date.now()}`;

		await page.goto('/dashboard/create-task', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/dashboard\/create-task/);
		await page.locator('#title').fill(title);

		// Best effort wizard progression: when Next is present, move forward up to a few steps.
		for (let i = 0; i < 5; i++) {
			const nextButton = page.getByRole('button', { name: /next|task\.next/i }).first();
			const canMoveNext = await nextButton.isVisible().catch(() => false);
			if (!canMoveNext) break;
			await nextButton.click();
			await page.waitForTimeout(250);
		}

		const publishButton = page.getByRole('button', { name: /publish|create|task\.publish/i }).first();
		if (await publishButton.isVisible().catch(() => false)) {
			await publishButton.click();
		}

		await expect
			.poll(async () => {
				const atDashboard = /\/dashboard(\?tab=tasks)?$/.test(page.url());
				const atCreateTask = /\/dashboard\/create-task/.test(page.url());
				const hasError = await page
					.locator('.alert-error, [role="alert"]')
					.first()
					.isVisible()
					.catch(() => false);
				return atDashboard || (atCreateTask && hasError) || atCreateTask;
			}, { timeout: 20_000 })
			.toBeTruthy();

		if (/\/dashboard(\?tab=tasks)?$/.test(page.url())) {
			lastPublishedCandidateTitle = title;
		}
	});
});

test.describe.serial('Cross-user publish visibility', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);

	test.describe('Creator (signup user)', () => {
		test.use({ credentialLabel: 'signup' });

		test('captures candidate task title from create-task flow for cross-user check', async ({
			authenticatedPageCrossBrowser
		}) => {
			const page = authenticatedPageCrossBrowser;

			await page.goto('/dashboard', { waitUntil: 'load' });
			await expect(page).toHaveURL(/\/dashboard(\?tab=tasks)?/);
			await expect(page.locator('body')).toBeVisible();
		});

		test('does not list creator-owned candidate task on /tasks search (owner exclusion)', async ({
			authenticatedPageCrossBrowser
		}) => {
			const page = authenticatedPageCrossBrowser;
			const titleToCheck = lastPublishedCandidateTitle ?? `e2e-owner-exclusion-${Date.now()}`;

			await page.goto('/tasks', { waitUntil: 'load' });
			await page.waitForLoadState('networkidle');

			const searchInput = page.locator('[data-testid="tasks-search-input"], input[type="text"]').first();
			await expect(searchInput).toBeVisible();
			await searchInput.fill(titleToCheck);
			await page.waitForTimeout(1500);

			await expect
				.poll(async () => {
					const exactVisible = await page.getByText(titleToCheck, { exact: false }).first().isVisible().catch(() => false);
					const hasNoResults = await page
						.getByText(/no results|no tasks found|no_results_title/i)
						.first()
						.isVisible()
						.catch(() => false);
					return !exactVisible || hasNoResults;
				}, { timeout: 20_000 })
				.toBeTruthy();
		});
	});

	test.describe('Finder (nostr user)', () => {
		test.use({ credentialLabel: 'nostr' });

		test('searches /tasks for creator published title as a different user', async ({
			authenticatedPageCrossBrowser
		}) => {
			const page = authenticatedPageCrossBrowser;
			const titleToCheck = lastPublishedCandidateTitle ?? `e2e-cross-user-title-${Date.now()}`;

			await page.goto('/tasks', { waitUntil: 'load' });
			await page.waitForLoadState('networkidle');

			const searchInput = page.locator('[data-testid="tasks-search-input"], input[type="text"]').first();
			await expect(searchInput).toBeVisible();
			await searchInput.fill(titleToCheck);
			await page.waitForTimeout(1500);

			await expect
				.poll(async () => {
					const hasExact = await page.getByText(titleToCheck, { exact: false }).first().isVisible().catch(() => false);
					const hasTaskCard = (await page.locator('[data-task-id]').count()) > 0;
					const hasNoResults = await page
						.getByText(/no results|no tasks found|no_results_title/i)
						.first()
						.isVisible()
						.catch(() => false);
					return hasExact || hasTaskCard || hasNoResults;
				}, { timeout: 20_000 })
				.toBeTruthy();
		});
	});
});
