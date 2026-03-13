import { test, type TestInfo } from '@playwright/test';
import { PUBLIC_BOTTOM_NAV_ROUTES, navigateBottomNavTo } from './utils/bottom-nav';
import { requireMobileSafari } from './utils/ios-interactions';

function requireBottomNavSafariScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari bottom navbar coverage only');
}

test.describe('public bottom navbar navigation', () => {
	test.describe.configure({ retries: 0, timeout: 60_000 });

	test('tasks button reaches the public tasks route on iOS Safari', async ({ page }, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		await page.goto('/about', { waitUntil: 'load' });
		await navigateBottomNavTo(page, PUBLIC_BOTTOM_NAV_ROUTES.tasks);
	});

	test('about button reaches the about route on iOS Safari', async ({ page }, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		await page.goto('/tasks', { waitUntil: 'load' });
		await navigateBottomNavTo(page, PUBLIC_BOTTOM_NAV_ROUTES.about);
	});

	test('how it works button reaches the how-it-works route on iOS Safari', async ({
		page
	}, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		await page.goto('/about', { waitUntil: 'load' });
		await navigateBottomNavTo(page, PUBLIC_BOTTOM_NAV_ROUTES.howItWorks);
	});

	test('sign up button reaches the sign-up route on iOS Safari', async ({ page }, testInfo) => {
		requireBottomNavSafariScope(testInfo);

		await page.goto('/tasks', { waitUntil: 'load' });
		await navigateBottomNavTo(page, PUBLIC_BOTTOM_NAV_ROUTES.signup);
	});
});
