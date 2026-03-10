import { test, expect } from '@playwright/test';
import {
	IOS_TIMEOUTS,
	activateAndWaitForURL,
	assertCenterPointTargetsElement,
	closeBottomMenu,
	gotoAndExpect,
	hasAnyVisible,
	menuBackdrop,
	openBottomMenu,
	requireMobileSafari,
	topbarAuthAction,
	waitForPublicPageReady
} from './utils/ios-interactions';

function menuOverlay(page: import('@playwright/test').Page) {
	return page.locator('.bottom-nav-overlay').first();
}
const MENU_TRIGGER_SELECTORS = [
	'button[data-menu-button]',
	'.dock button[data-menu-button]',
	'footer button[data-menu-button]'
];
const DIRECT_AUTH_SELECTORS = [
	'a[data-testid="login-link"][href="/auth/login"]',
	'a[href="/auth/login"]',
	'a[href="/auth/signup"]',
	'button:has-text("Login")',
	'button:has-text("Sign Up")'
];

async function dockNavAction(page: import('@playwright/test').Page) {
	const locator = page
		.locator('.dock a[href="/about"], .dock a[href="/how-it-works"], .dock a[href="/help"]')
		.first();
	await expect(locator).toBeVisible({ timeout: IOS_TIMEOUTS.find });
	return locator;
}

test.describe('iOS tap overlay diagnostics (unauthenticated)', () => {
	test.describe.configure({ retries: 0, timeout: 60_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }, testInfo) => {
		requireMobileSafari(testInfo, 'This diagnostics spec only runs in mobile viewport projects.');
		await gotoAndExpect(page, '/tasks', /\/tasks(?:\?.*)?$/);
		await waitForPublicPageReady(page);
	});

	test('topbar auth action is tappable and navigates', async ({ page }) => {
		await expect(
			hasAnyVisible(page, [...DIRECT_AUTH_SELECTORS, ...MENU_TRIGGER_SELECTORS])
		).resolves.toBeTruthy();
		const auth = await topbarAuthAction(page);
		await expect(auth).toBeEnabled();
		await assertCenterPointTargetsElement(auth, 'Topbar auth action');
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('after menu open/close, topbar auth remains tappable', async ({ page }) => {
		await expect(hasAnyVisible(page, MENU_TRIGGER_SELECTORS)).resolves.toBeTruthy();
		await openBottomMenu(page);
		await closeBottomMenu(page);

		const auth = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(auth, 'Topbar auth action after menu close');
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('menu open/close sequence does not block dock navigation', async ({ page }) => {
		await expect(hasAnyVisible(page, MENU_TRIGGER_SELECTORS)).resolves.toBeTruthy();
		await openBottomMenu(page);
		await closeBottomMenu(page);

		const dockLink = await dockNavAction(page);
		const href = (await dockLink.getAttribute('href')) || '';

		await expect(href).not.toBe('/tasks');
		const expectedDockPattern = new RegExp(
			`${href.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:\\?.*)?$`
		);
		await Promise.all([
			page.waitForURL(expectedDockPattern, { timeout: IOS_TIMEOUTS.navigation }),
			dockLink.click({ timeout: IOS_TIMEOUTS.interaction })
		]);
	});

	test('overlay is not hit-testable after menu closes', async ({ page }) => {
		await expect(hasAnyVisible(page, MENU_TRIGGER_SELECTORS)).resolves.toBeTruthy();
		await openBottomMenu(page);
		await closeBottomMenu(page);
		await expect(menuBackdrop(page)).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });

		const overlay = menuOverlay(page);
		if (await overlay.isVisible().catch(() => false)) {
			const pointerEvents = await overlay.evaluate((el) => getComputedStyle(el).pointerEvents);
			expect(pointerEvents).toBe('none');
		}
	});
});
