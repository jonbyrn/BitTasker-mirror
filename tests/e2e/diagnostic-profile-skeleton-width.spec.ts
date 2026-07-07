import { test, expect } from '@playwright/test';

const TEST_NPUB = 'npub1rhswzjqtdny2v9s8hyy3s9r0phkun0jl5gahcdnutujf5g4j7zusp08gup';

/**
 * Diagnostic test: measures skeleton vs content widths on the public profile page.
 * Intercepts Nostr relay connections to delay profile loading so we can measure
 * the skeleton state before it disappears.
 */
test.describe('Profile skeleton width — diagnostic', () => {
	test('measure skeleton grid vs content grid widths', async ({ page }) => {
		// Block Nostr relay connections to keep the skeleton visible longer
		const blockedUrls: string[] = [];
		await page.route('**/relay.*', async (route) => {
			blockedUrls.push(route.request().url());
			// Don't fulfill — keep the request pending so profile never loads via relay
		});
		await page.route('**/wss://**', async (route) => {
			blockedUrls.push(route.request().url());
		});

		await page.goto(`/npub/${TEST_NPUB}`, { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// ---- Measure skeleton state ----
		// The skeleton grid is inside the first .grid.lg\:grid-cols-4
		const skeletonGrid = page.locator('.grid.lg\\:grid-cols-4').first();
		const skeletonBox = await skeletonGrid.boundingBox();

		// Get the outer wrapper's computed width
		const outerWrapper = page.locator('.max-w-6xl').first();
		const outerBox = await outerWrapper.boundingBox();

		// Get the scroll container width
		const scrollContainer = page.locator('.app-shell__content');
		const scrollBox = await scrollContainer.boundingBox();

		// Get the first skeleton card width
		const skeletonCard = page.locator('.card.bg-base-100.rounded-2xl').first();
		const skeletonCardBox = await skeletonCard.boundingBox();

		// Check computed styles
		const skeletonStyles = await skeletonGrid.evaluate((el) => {
			const style = window.getComputedStyle(el);
			return {
				width: style.width,
				maxWidth: style.maxWidth,
				paddingLeft: style.paddingLeft,
				paddingRight: style.paddingRight,
				display: style.display,
				gridTemplateColumns: style.gridTemplateColumns
			};
		});

		const outerStyles = await outerWrapper.evaluate((el) => {
			const style = window.getComputedStyle(el);
			return {
				width: style.width,
				maxWidth: style.maxWidth,
				paddingLeft: style.paddingLeft,
				paddingRight: style.paddingRight
			};
		});

		console.log('=== SKELETON STATE ===');
		console.log('Scroll container width:', scrollBox?.width);
		console.log('Outer wrapper (.max-w-6xl) width:', outerBox?.width);
		console.log('Outer wrapper computed:', outerStyles);
		console.log('Skeleton grid width:', skeletonBox?.width);
		console.log('Skeleton grid computed:', skeletonStyles);
		console.log('Skeleton card width:', skeletonCardBox?.width);
		console.log('Grid template columns:', skeletonStyles.gridTemplateColumns);
		console.log('Blocked relay URLs:', blockedUrls.length);

		// Now unblock and let the profile load
		await page.unroute('**/relay.*');
		await page.unroute('**/wss://**');

		// Wait for profile content to load
		await page.waitForTimeout(12000);

		// ---- Measure content state ----
		const contentGrid = page.locator('.grid.lg\\:grid-cols-4').first();
		const contentBox = await contentGrid.boundingBox();

		const contentOuter = page.locator('.max-w-6xl').first();
		const contentOuterBox = await contentOuter.boundingBox();

		const contentCard = page.locator('.card.bg-base-100.rounded-2xl').first();
		const contentCardBox = await contentCard.boundingBox();

		const contentStyles = await contentGrid.evaluate((el) => {
			const style = window.getComputedStyle(el);
			return {
				width: style.width,
				maxWidth: style.maxWidth,
				paddingLeft: style.paddingLeft,
				paddingRight: style.paddingRight,
				display: style.display,
				gridTemplateColumns: style.gridTemplateColumns
			};
		});

		const contentOuterStyles = await contentOuter.evaluate((el) => {
			const style = window.getComputedStyle(el);
			return {
				width: style.width,
				maxWidth: style.maxWidth,
				paddingLeft: style.paddingLeft,
				paddingRight: style.paddingRight
			};
		});

		console.log('\n=== CONTENT STATE ===');
		console.log('Outer wrapper (.max-w-6xl) width:', contentOuterBox?.width);
		console.log('Outer wrapper computed:', contentOuterStyles);
		console.log('Content grid width:', contentBox?.width);
		console.log('Content grid computed:', contentStyles);
		console.log('Content card width:', contentCardBox?.width);
		console.log('Grid template columns:', contentStyles.gridTemplateColumns);

		if (skeletonBox && contentBox) {
			const diff = Math.abs(skeletonBox.width - contentBox.width);
			console.log('\n=== COMPARISON ===');
			console.log(`Skeleton grid: ${skeletonBox.width}px`);
			console.log(`Content grid:  ${contentBox.width}px`);
			console.log(`Difference:    ${diff}px`);
		}

		if (skeletonCardBox && contentCardBox) {
			const cardDiff = Math.abs(skeletonCardBox.width - contentCardBox.width);
			console.log(`Skeleton card: ${skeletonCardBox.width}px`);
			console.log(`Content card:  ${contentCardBox.width}px`);
			console.log(`Card diff:     ${cardDiff}px`);
		}

		// This test is diagnostic — it logs measurements for investigation.
		// The actual width assertion will be added once we understand the root cause.
		expect(skeletonBox).toBeTruthy();
		expect(contentBox).toBeTruthy();
	});
});
