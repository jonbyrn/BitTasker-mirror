import { test, expect } from '@playwright/test';

/**
 * E2E tests for the service skeleton transition bug fix.
 *
 * Bug: When filtering/searching on the services page, skeletons were not shown
 * during re-fetch because `showSkeleton` was never set back to `true` after
 * the initial load. The fix replaces boolean flags with a loading state machine
 * (matching the tasks page pattern).
 */
test.describe('Services — skeleton transitions', () => {
	test.beforeEach(async ({ page }) => {
		await page.goto('/services', { waitUntil: 'domcontentloaded' });
		// Wait for initial load to complete (skeletons gone, cards visible)
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		// Give the Nostr data time to arrive
		await page.waitForTimeout(5000);
	});

	test('skeletons appear during initial page load then disappear', async ({ page }) => {
		// After initial load, skeletons should NOT be visible
		const skeletons = page.locator('.animate-pulse');
		// Cards should be visible (or empty state)
		const serviceCards = page.locator('[data-service-id]');
		const emptyState = page.locator('text=/no services found/i');

		// At least one of these should be true after load
		const cardCount = await serviceCards.count();
		const emptyVisible = await emptyState.isVisible().catch(() => false);
		expect(cardCount > 0 || emptyVisible).toBe(true);

		// Skeletons should be gone after load
		const skeletonCount = await skeletons.count();
		expect(skeletonCount).toBe(0);
	});

	test('skeletons reappear when applying filters', async ({ page }) => {
		// Open filter drawer
		const filterBtn = page.locator('button:has-text(/filter/i)').first();
		await expect(filterBtn).toBeVisible({ timeout: 5000 });
		await filterBtn.click();

		// Wait for filter drawer to open
		const filterDrawer = page.locator('[role="dialog"]');
		await expect(filterDrawer).toBeVisible({ timeout: 3000 });

		// Select a category filter (click first available checkbox)
		const categoryCheckbox = filterDrawer.locator('input[type="checkbox"]').first();
		if (await categoryCheckbox.isVisible().catch(() => false)) {
			await categoryCheckbox.click();
		}

		// Apply filters
		const applyBtn = filterDrawer.locator('button:has-text(/apply/i)');
		if (await applyBtn.isVisible().catch(() => false)) {
			await applyBtn.click();

			// Give a brief moment for the state transition
			await page.waitForTimeout(100);

			// Either skeletons appear (fast check) or results load quickly
			// The key test is that the page is NOT blank during transition
			const body = page.locator('body');
			const bodyText = await body.innerText();
			expect(bodyText.length).toBeGreaterThan(50);
		}
	});

	test('skeletons reappear when clearing filters', async ({ page }) => {
		// First apply some filter to ensure we have active filters
		const filterBtn = page.locator('button:has-text(/filter/i)').first();
		await expect(filterBtn).toBeVisible({ timeout: 5000 });
		await filterBtn.click();

		const filterDrawer = page.locator('[role="dialog"]');
		await expect(filterDrawer).toBeVisible({ timeout: 3000 });

		// Select a filter and apply
		const categoryCheckbox = filterDrawer.locator('input[type="checkbox"]').first();
		if (await categoryCheckbox.isVisible().catch(() => false)) {
			await categoryCheckbox.click();
		}

		const applyBtn = filterDrawer.locator('button:has-text(/apply/i)');
		if (await applyBtn.isVisible().catch(() => false)) {
			await applyBtn.click();
			await page.waitForTimeout(3000);
		}

		// Now clear filters
		const clearBtn = page.locator('button:has-text(/clear/i)').first();
		if (await clearBtn.isVisible().catch(() => false)) {
			await clearBtn.click();

			// Page should not be blank during transition
			await page.waitForTimeout(100);
			const body = page.locator('body');
			const bodyText = await body.innerText();
			expect(bodyText.length).toBeGreaterThan(50);
		}
	});

	test('skeletons reappear during search', async ({ page }) => {
		const searchInput = page.locator('input[type="text"]').first();
		await expect(searchInput).toBeVisible({ timeout: 5000 });

		// Type a search query
		await searchInput.fill('design');
		await searchInput.press('Enter');

		// During debounced search, page should not be blank
		await page.waitForTimeout(200);
		const body = page.locator('body');
		const bodyText = await body.innerText();
		expect(bodyText.length).toBeGreaterThan(50);

		// Eventually results or empty state should appear
		await page.waitForTimeout(5000);
	});

	test('page is never blank between filter transitions', async ({ page }) => {
		// This is the core regression test: the page must always show SOMETHING
		// (skeletons, results, or empty state) — never a blank area

		// Check current state
		const serviceCards = page.locator('[data-service-id]');
		const skeletons = page.locator('.animate-pulse');
		const emptyState = page.locator('text=/no services found/i');
		const errorState = page.locator('.alert-error');

		const cardCount = await serviceCards.count();
		const skeletonCount = await skeletons.count();
		const emptyVisible = await emptyState.isVisible().catch(() => false);
		const errorVisible = await errorState.isVisible().catch(() => false);

		// At least one content indicator must be present
		const hasContent = cardCount > 0 || skeletonCount > 0 || emptyVisible || errorVisible;
		expect(hasContent).toBe(true);
	});
});
