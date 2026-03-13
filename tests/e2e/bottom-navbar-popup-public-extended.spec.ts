import { test, type TestInfo } from '@playwright/test';
import { requireMobileSafari } from './utils/ios-interactions';
import {
	PUBLIC_COMPANY_POPUP_ROUTES,
	PUBLIC_TASKERS_POPUP_ROUTES,
	PUBLIC_TASKEES_POPUP_ROUTES,
	navigateBottomNavPopupTo
} from './utils/bottom-nav-popup';

function requireBottomNavPopupSafariScope(testInfo: TestInfo): void {
	requireMobileSafari(testInfo, 'iOS Mobile Safari bottom popup-menu coverage only');
}

test.describe('public bottom navbar popup menu extended navigation', () => {
	test.describe.configure({ retries: 1, timeout: 120_000 });

	for (const route of [
		...PUBLIC_TASKERS_POPUP_ROUTES,
		...PUBLIC_TASKEES_POPUP_ROUTES,
		...PUBLIC_COMPANY_POPUP_ROUTES
	]) {
		test(`${route.name} popup action works on iOS Safari`, async ({ page }, testInfo) => {
			requireBottomNavPopupSafariScope(testInfo);

			await page.goto(route.startPath, { waitUntil: 'load' });
			await navigateBottomNavPopupTo(page, route);
		});
	}
});
