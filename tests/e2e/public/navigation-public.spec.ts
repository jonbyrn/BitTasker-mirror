import { test, expect } from '@playwright/test';

test.describe('public navigation', () => {
	test('navigates to How It Works page', async ({ page }) => {
		await page.goto('/how-it-works', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(3000);

		const title = await page.title();
		expect(title, 'How It Works page title should contain "How BitTasker"').toContain(
			'How BitTasker'
		);
	});

	test('navigates to About page', async ({ page }) => {
		await page.goto('/about', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(3000);

		const title = await page.title();
		expect(title, 'About page title should contain "About"').toContain('About');
	});

	test('navigates to FAQ page', async ({ page }) => {
		await page.goto('/faq', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(3000);

		const title = await page.title();
		expect(title, 'FAQ page title should contain "FAQ"').toContain('FAQ');
	});

	test('navigates to Tasks page (public)', async ({ page }) => {
		await page.goto('/tasks', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(3000);

		const body = await page.evaluate(() => document.body.innerText);
		expect(body.length, 'Tasks page should have content').toBeGreaterThan(50);
	});

	test('navigates to Services page (public)', async ({ page }) => {
		await page.goto('/services', {
			waitUntil: 'domcontentloaded'
		});

		await page.waitForTimeout(3000);

		const body = await page.evaluate(() => document.body.innerText);
		expect(body.length, 'Services page should have content').toBeGreaterThan(50);
	});
});
