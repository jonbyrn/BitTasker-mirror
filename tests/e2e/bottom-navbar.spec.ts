import { test, expect } from '@playwright/test';

test.describe('bottom navbar', () => {
	test.describe('mobile dock', () => {
		test('dock is visible on mobile viewport', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const dock = page.locator('.dock');
			await expect(dock).toBeVisible();
		});

		test('dock contains 5 items on mobile', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const dockLinks = page.locator('.dock .dock-link, .dock .dock-menu-btn');
			const count = await dockLinks.count();
			expect(count).toBe(5);
		});
	});

	test.describe('menu drawer', () => {
		test.beforeEach(async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);
		});

		test('menu button opens drawer', async ({ page }) => {
			const menuBtn = page.locator('.dock-menu-btn');
			await expect(menuBtn).toBeVisible();
			await menuBtn.click();

			const drawer = page.locator('.drawer-panel');
			await expect(drawer).toBeVisible({ timeout: 3000 });
		});

		test('drawer contains grid items', async ({ page }) => {
			const menuBtn = page.locator('.dock-menu-btn');
			await menuBtn.click();
			await page.waitForTimeout(600);

			const gridItems = page.locator('.nav-grid-item');
			const count = await gridItems.count();
			expect(count).toBeGreaterThan(0);
		});

		test('backdrop click closes drawer', async ({ page }) => {
			const menuBtn = page.locator('.dock-menu-btn');
			await menuBtn.click();
			await page.waitForTimeout(600);

			const backdrop = page.locator('.drawer-backdrop');
			await expect(backdrop).toBeVisible();
			await backdrop.click({ position: { x: 10, y: 10 } });

			await page.waitForTimeout(600);
			const drawer = page.locator('.drawer-panel');
			await expect(drawer).not.toBeVisible({ timeout: 3000 });
		});

		test('group item click shows sub-grid with back button', async ({ page }) => {
			const menuBtn = page.locator('.dock-menu-btn');
			await menuBtn.click();
			await page.waitForTimeout(600);

			// Third item is a group ('for-taskers') in logged-out grid
			const groupItem = page.locator('.nav-grid-item').nth(2);
			await groupItem.click();
			await page.waitForTimeout(500);

			const backBtn = page.locator('.nav-grid-back');
			await expect(backBtn).toBeVisible({ timeout: 3000 });
		});
	});

	test.describe('animation performance', () => {
		test('drawer open completes within 1 second', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const menuBtn = page.locator('.dock-menu-btn');

			const startTime = Date.now();
			await menuBtn.click();

			const drawer = page.locator('.drawer-panel');
			await expect(drawer).toBeVisible({ timeout: 2000 });
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(1000);
		});

		test('drawer close completes within 1 second', async ({ page }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
			await page.waitForTimeout(2000);

			const menuBtn = page.locator('.dock-menu-btn');
			await menuBtn.click();
			await page.waitForTimeout(600);

			const backdrop = page.locator('.drawer-backdrop');
			const startTime = Date.now();
			await backdrop.click({ position: { x: 10, y: 10 } });

			const drawer = page.locator('.drawer-panel');
			await expect(drawer).not.toBeVisible({ timeout: 3000 });
			const elapsed = Date.now() - startTime;

			expect(elapsed).toBeLessThan(1000);
		});
	});
});
