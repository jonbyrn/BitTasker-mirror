import { expect, test } from '@playwright/test';

const routes = ['/', '/how-it-works', '/faq', '/auth/login'];

test.describe('public pages at 360px', () => {
	test.beforeEach(async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'a11y', 'Runs in the a11y project at 360px');
		await page.setViewportSize({ width: 360, height: 800 });
	});

	for (const route of routes) {
		test(`${route} has a skip link, a main landmark, and named controls`, async ({ page }) => {
			await page.goto(route);
			const skip = page.getByRole('link', { name: 'Skip to content' });
			await expect(skip).toBeAttached();
			await page.keyboard.press('Tab');
			await expect(skip).toBeFocused();
			await expect(page.locator('main#main')).toBeVisible();

			const unnamed = await page.locator('button, a.btn, [role="button"]').evaluateAll((elements) =>
				elements
					.filter((element) => {
						const name = (element.getAttribute('aria-label') || element.textContent || '').trim();
						return name.length === 0;
					})
					.map((element) => element.outerHTML.slice(0, 180))
			);
			expect(unnamed, `unnamed controls on ${route}`).toEqual([]);
		});
	}

	test('login fields expose labels', async ({ page }) => {
		await page.goto('/auth/login');
		const fields = page.locator('input:not([type="hidden"])');
		const count = await fields.count();
		for (let index = 0; index < count; index += 1) {
			const field = fields.nth(index);
			const id = await field.getAttribute('id');
			const aria = await field.getAttribute('aria-label');
			const labelledBy = await field.getAttribute('aria-labelledby');
			const wrapped = id
				? await page.locator(`label[for="${id}"]`).count()
				: await field.evaluate((element) => element.closest('label') !== null);
			expect(Boolean(aria || labelledBy || wrapped)).toBe(true);
		}
	});

	test('primary actions meet the 44px touch target', async ({ page }) => {
		await page.goto('/');
		const button = page.locator('a.btn, button.btn').first();
		await expect(button).toBeVisible();
		const box = await button.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
	});
});
