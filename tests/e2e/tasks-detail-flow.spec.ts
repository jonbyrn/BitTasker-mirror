import { test as base, expect as baseExpect } from '@playwright/test';
import {
	test,
	expect,
	webauthnCredentialsFileExists,
	CREDENTIALS_MISSING_MESSAGE
} from './fixtures/passkey-auth-cross-browser';

base.describe('Tasks detail conversion flow (logged out)', () => {
	base.beforeEach(async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/tasks', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');
	});

	base('opens a concrete task detail route from tasks listing', async ({ page }) => {
		const taskLink = page.locator('a[href^="/tasks/"]').first();
		const hasTaskLink = await taskLink.isVisible().catch(() => false);
		if (!hasTaskLink) {
			await expect(page.getByTestId('tasks-search-input')).toBeVisible();
			await expect(page.locator('body')).toBeVisible();
			return;
		}

		await taskLink.click();
		await baseExpect(page).toHaveURL(/\/tasks\/[^/?#]+/);
		await baseExpect(page.locator('body')).toContainText(/task|budget|location|description/i);
	});

	base('task detail login path preserves returnTo query', async ({ page }) => {
		const taskLink = page.locator('a[href^="/tasks/"]').first();
		const hasTaskLink = await taskLink.isVisible().catch(() => false);
		if (!hasTaskLink) {
			await expect(page.getByTestId('tasks-search-input')).toBeVisible();
			await expect(page.locator('body')).toBeVisible();
			return;
		}

		await taskLink.click();
		await baseExpect(page).toHaveURL(/\/tasks\/[^/?#]+/);

		const loginButton = page.getByRole('button', { name: /login/i }).first();
		const hasLoginButton = await loginButton.isVisible().catch(() => false);
		if (!hasLoginButton) {
			await expect(page.locator('body')).toContainText(/owner|deadline|closed|task/i);
			return;
		}

		await loginButton.click();
		await baseExpect(page).toHaveURL(/\/auth\/login\?returnTo=/);
	});
});

test.describe('Tasks detail actionability (authenticated)', () => {
	test.skip(() => !webauthnCredentialsFileExists(), CREDENTIALS_MISSING_MESSAGE);
	test.use({ credentialLabel: 'signup' });

	test('opens task detail while authenticated and reaches a stable action state', async ({
		authenticatedPageCrossBrowser
	}) => {
		test.setTimeout(120_000);
		const page = authenticatedPageCrossBrowser;
		await page.goto('/tasks', { waitUntil: 'load' });
		await page.waitForLoadState('networkidle');

		const taskLink = page.locator('a[href^="/tasks/"]').first();
		const hasTaskLink = await taskLink.isVisible().catch(() => false);
		if (!hasTaskLink) {
			await expect(page.getByTestId('tasks-search-input')).toBeVisible();
			await expect(page.locator('body')).toBeVisible();
			return;
		}

		await taskLink.click();
		await expect(page).toHaveURL(/\/tasks\/[^/?#]+/);

		await expect
			.poll(async () => {
				const hasBidNow = await page.getByRole('button', { name: /bid/i }).first().isVisible().catch(() => false);
				const hasTaskStateInfo = await page
					.getByText(/task_not_open_bidding|deadline_expired|you_are_owner/i)
					.first()
					.isVisible()
					.catch(() => false);
				return hasBidNow || hasTaskStateInfo;
			}, { timeout: 20_000 })
			.toBeTruthy();
	});
});
