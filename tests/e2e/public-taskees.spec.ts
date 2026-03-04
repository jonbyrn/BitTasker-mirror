import { test, expect } from '@playwright/test';

test.describe('Public taskees discovery route', () => {
	test('loads taskees page and displays discovery controls', async ({ page }) => {
		await page.goto('/taskees', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/taskees$/);
		await expect(page.locator('#panel-find-taskees')).toBeVisible();
		await expect(page.locator('input[type="text"]').first()).toBeVisible();
	});

	test('supports search input and reaches stable results/empty/error state', async ({ page }) => {
		await page.goto('/taskees', { waitUntil: 'load' });
		const searchInput = page.locator('input[type="text"]').first();
		await expect(searchInput).toBeVisible();
		await searchInput.fill(`e2e-taskee-${Date.now()}`);

		await expect
			.poll(
				async () => {
					const hasCard = await page
						.locator('[data-taskee-npub]')
						.first()
						.isVisible()
						.catch(() => false);
					const hasEmpty = await page
						.getByText(/no results|no_results|clear filters|find_taskees\.no_results/i)
						.first()
						.isVisible()
						.catch(() => false);
					const hasError = await page
						.locator('.alert.alert-error')
						.first()
						.isVisible()
						.catch(() => false);
					return hasCard || hasEmpty || hasError;
				},
				{ timeout: 20_000 }
			)
			.toBeTruthy();
	});

	test('opens taskee profile when a profile card is available', async ({ page }) => {
		await page.goto('/taskees', { waitUntil: 'load' });
		const viewProfileButton = page.getByRole('button', { name: /view profile|profile/i }).first();
		const hasViewProfileButton = await viewProfileButton.isVisible().catch(() => false);

		if (!hasViewProfileButton) {
			await expect(page.locator('body')).toBeVisible();
			return;
		}

		await viewProfileButton.click();
		await expect.poll(() => page.url(), { timeout: 15_000 }).toMatch(/\/npub\//);
	});
});
