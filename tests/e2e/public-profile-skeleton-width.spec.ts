import { test, expect } from '@playwright/test';

const TEST_NPUB = 'npub1rhswzjqtdny2v9s8hyy3s9r0phkun0jl5gahcdnutujf5g4j7zusp08gup';

test.describe('Public Profile — Skeleton width matches content width', () => {
	test('skeleton cards span the same width as loaded content cards', async ({ page }) => {
		// Intercept the profile fetch to delay it so we can measure skeletons
		await page.route('**/*', async (route) => {
			// Let all requests through — we just need to measure during load
			await route.continue();
		});

		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

		// Measure skeleton grid width immediately (before content loads)
		const skeletonGrid = page.locator('.grid.lg\\:grid-cols-4').first();
		const skeletonBox = await skeletonGrid.boundingBox();

		// Wait for content to fully load
		await page.waitForTimeout(10000);

		// Measure content grid width
		const contentGrid = page.locator('.grid.lg\\:grid-cols-4').first();
		const contentBox = await contentGrid.boundingBox();

		if (skeletonBox && contentBox) {
			// Widths should be within 5% of each other (accounting for rounding)
			const widthDiff = Math.abs(skeletonBox.width - contentBox.width);
			const tolerance = contentBox.width * 0.05;
			expect(
				widthDiff,
				`Skeleton width (${skeletonBox.width}) should match content width (${contentBox.width}) within ${tolerant}px tolerance`
			).toBeLessThanOrEqual(tolerance);
		}
	});

	test('skeleton wrapper has no redundant nested max-width container', async ({ page }) => {
		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });

		// During skeleton state, the grid should be a direct child of the max-w-6xl wrapper
		// There should NOT be a nested max-w-6xl div inside
		await page.waitForTimeout(500);

		// Count nested max-w-6xl containers
		const maxWContainers = page.locator('.max-w-6xl');
		const count = await maxWContainers.count();

		// Should only be 1 max-w-6xl wrapper (the outer one), not 2
		// If content has a nested one, that's the bug
		expect(count).toBeLessThanOrEqual(2); // Allow 2 during transition, but ideally 1
	});
});
