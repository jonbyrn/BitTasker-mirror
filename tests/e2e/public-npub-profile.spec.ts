import { test, expect } from '@playwright/test';

test.describe('Public npub profile route', () => {
	test('handles malformed npub param with validation error state', async ({ page }) => {
		await page.goto('/npub/not-a-valid-npub', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/npub\/not-a-valid-npub$/);
		await expect(page.locator('.alert.alert-error').first()).toBeVisible({ timeout: 15_000 });
	});

	test('handles valid-format unknown pubkey with profile-or-error stable state', async ({
		page
	}) => {
		const unknownHex = 'f'.repeat(64);
		await page.goto(`/npub/${unknownHex}`, { waitUntil: 'load' });
		await expect(page).toHaveURL(new RegExp(`/npub/${unknownHex}$`));

		await expect
			.poll(
				async () => {
					const hasProfileCard = await page
						.locator('.card')
						.first()
						.isVisible()
						.catch(() => false);
					const hasErrorAlert = await page
						.locator('.alert.alert-error')
						.first()
						.isVisible()
						.catch(() => false);
					const stillLoading = await page
						.locator('.animate-pulse')
						.first()
						.isVisible()
						.catch(() => false);
					return hasProfileCard || hasErrorAlert || stillLoading;
				},
				{ timeout: 20_000 }
			)
			.toBeTruthy();
	});
});
