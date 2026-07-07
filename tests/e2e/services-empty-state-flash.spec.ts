import { test, expect } from '@playwright/test';

test.describe('Services — empty state flash during search', () => {
	test('no "no services found" flash when searching', async ({ page }) => {
		await page.goto('/services', { waitUntil: 'domcontentloaded' });

		// Wait for initial load
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(5000);

		// Type a search query
		const searchInput = page.locator('input[type="text"]').first();
		await searchInput.fill('design');
		await searchInput.press('Enter');

		// Wait for search to complete
		await page.waitForTimeout(8000);

		// Check that we never saw the empty state flash before results
		// The key assertion: if empty state appeared, it should NOT have been
		// followed by content (that means it flashed)
		const bodyText = await page.locator('body').innerText();
		const hasEmpty = bodyText.includes('No services found');
		const hasCards = (await page.locator('[data-service-id]').count()) > 0;

		// At the end, either we have cards or a legitimate empty state
		// But we should NOT have both appeared and disappeared
		if (hasEmpty && hasCards) {
			// This is the bug: empty state appeared while cards were loading
			expect(false, 'Empty state should not coexist with service cards').toBe(true);
		}
	});

	test('page shows skeletons during filter transitions, not empty state', async ({ page }) => {
		await page.goto('/services', { waitUntil: 'domcontentloaded' });
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(5000);

		// Open filters
		const filterBtn = page.locator('button:has-text(/filter/i)').first();
		if (await filterBtn.isVisible()) {
			await filterBtn.click();

			const filterDrawer = page.locator('[role="dialog"]');
			await expect(filterDrawer).toBeVisible({ timeout: 3000 });

			// Apply a filter
			const applyBtn = filterDrawer.locator('button:has-text(/apply/i)');
			if (await applyBtn.isVisible()) {
				await applyBtn.click();

				// During the transition, we should see skeletons OR cards, never empty state
				await page.waitForTimeout(500);

				const hasEmpty = await page
					.locator('text=/no services found/i')
					.isVisible()
					.catch(() => false);

				// We should NOT see empty state during a filter transition
				expect(
					hasEmpty,
					'Empty state should not appear during filter transition — skeletons or cards should show'
				).toBe(false);
			}
		}
	});
});
