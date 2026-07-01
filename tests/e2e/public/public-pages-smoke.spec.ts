import { test, expect } from '@playwright/test';

const publicRoutes = [
	'/',
	'/about',
	'/faq',
	'/terms',
	'/how-it-works',
	'/privacy',
	'/security',
	'/careers',
	'/press',
	'/contact',
	'/delete-account',
	'/community-guidelines',
	'/taskee-fees',
	'/tasker-fees',
	'/tasker-principles',
	'/secure-payments',
	'/auth/login',
	'/tasks',
	'/services'
];

test.describe('public pages smoke tests', () => {
	for (const route of publicRoutes) {
		test(`${route} loads without JS errors`, async ({ page }) => {
			const jsErrors: string[] = [];

			page.on('pageerror', (error) => {
				const message = error.message;
				if (
					message.includes('WebSocket') ||
					message.includes('ws://') ||
					message.includes('wss://')
				) {
					return;
				}
				jsErrors.push(message);
			});

			await page.goto(route, {
				waitUntil: 'domcontentloaded',
				timeout: 15000
			});

			await page.waitForTimeout(3000);

			const title = await page.title();
			expect(title.length, `Page title should not be empty for ${route}`).toBeGreaterThan(0);

			expect(jsErrors, `JS errors on ${route}: ${jsErrors.join('; ')}`).toHaveLength(0);

			const bodyText = await page.locator('body').innerText();
			expect(
				bodyText.length,
				`Body content should have length > 50 for ${route}`
			).toBeGreaterThan(50);
		});
	}
});
