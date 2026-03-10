import { test, expect, type Locator, type Page } from '@playwright/test';
import {
	IOS_TIMEOUTS,
	activate,
	activateAndWaitForURL,
	clickOutsideTarget,
	gotoAndExpect,
	hasAnyVisible,
	requireMobileSafari,
	topbarAuthAction,
	waitForPublicPageReady
} from './utils/ios-interactions';

const AUTH_ACTION_SELECTORS = [
	'a[data-testid="login-link"][href="/auth/login"]',
	'a[href="/auth/login"]',
	'a[href="/auth/signup"]',
	'button:has-text("Login")',
	'button:has-text("Sign Up")',
	'button[data-menu-button]',
	'.dock button[data-menu-button]',
	'footer button[data-menu-button]'
];

const DRAWER_CLOSE_BUTTON_SELECTORS = [
	'button[aria-label*="close" i]',
	'button[aria-label*="dismiss" i]',
	'button[title*="close" i]',
	'button[data-testid*="close" i]',
	'button:has-text("Close")',
	'button:has-text("Done")',
	'button:has-text("Cancel")',
	'.btn-circle'
];

const DRAWER_BACKDROP_SELECTORS = [
	'button[aria-label*="backdrop" i]',
	'button[aria-label*="overlay" i]',
	'[data-testid*="backdrop" i]',
	'[class*="backdrop"]'
];

async function languageDropdownIsOpen(dropdown: import('@playwright/test').Locator): Promise<boolean> {
	return dropdown.evaluate((el) => {
		if (el.classList.contains('dropdown-open')) return true;
		return el instanceof HTMLDetailsElement && el.open;
	});
}

async function drawerIsVisible(drawer: Locator): Promise<boolean> {
	return drawer.isVisible().catch(() => false);
}

async function waitForDrawerToClose(drawer: Locator, timeoutMs: number): Promise<boolean> {
	return expect
		.poll(async () => !(await drawerIsVisible(drawer)), { timeout: timeoutMs })
		.toBe(true)
		.then(() => true)
		.catch(() => false);
}

async function closeDrawerByButtons(drawer: Locator): Promise<boolean> {
	if (!(await drawerIsVisible(drawer))) return true;

	for (const selector of DRAWER_CLOSE_BUTTON_SELECTORS) {
		const candidate = drawer.locator(selector).first();
		if (!(await candidate.isVisible().catch(() => false))) continue;

		await activate(candidate).catch(() => undefined);
		if (await waitForDrawerToClose(drawer, Math.min(IOS_TIMEOUTS.interaction, 2_500))) {
			return true;
		}
	}

	return false;
}

async function closeDrawerByBackdropOrOutsideTap(page: Page, drawer: Locator): Promise<boolean> {
	for (const selector of DRAWER_BACKDROP_SELECTORS) {
		const backdrop = page.locator(selector).first();
		if (!(await backdrop.isVisible().catch(() => false))) continue;

		await activate(backdrop).catch(() => undefined);
		if (await waitForDrawerToClose(drawer, Math.min(IOS_TIMEOUTS.interaction, 2_500))) {
			return true;
		}
	}

	await clickOutsideTarget(page, drawer).catch(() => undefined);
	return waitForDrawerToClose(drawer, IOS_TIMEOUTS.hidden);
}

test.describe('iOS public interaction regressions', () => {
	test.describe.configure({ retries: 0, timeout: 60_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test('language dropdown closes by outside tap and topbar auth remains tappable', async ({ page }, testInfo) => {
		requireMobileSafari(testInfo);
		await gotoAndExpect(page, '/tasks', /\/tasks(?:\?.*)?$/);
		await waitForPublicPageReady(page);
		await expect(
			hasAnyVisible(page, [
				'details.language-dropdown summary',
				'.language-dropdown summary',
				'details.language-dropdown button',
				'.language-dropdown button'
			])
		).resolves.toBeTruthy();

		const trigger = page
			.locator(
				'details.language-dropdown summary, .language-dropdown summary, details.language-dropdown button, .language-dropdown button'
			)
			.first();
		const dropdown = page.locator('.language-dropdown, details.language-dropdown').first();
		const dropdownMenu = dropdown.locator('.dropdown-content').first();
		await expect(dropdown).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await expect.poll(() => languageDropdownIsOpen(dropdown), { timeout: IOS_TIMEOUTS.interaction }).toBe(false);
		await activate(trigger);
		await expect.poll(() => languageDropdownIsOpen(dropdown), { timeout: IOS_TIMEOUTS.visible }).toBe(true);
		await expect(dropdownMenu).toBeVisible({ timeout: IOS_TIMEOUTS.visible });

		await clickOutsideTarget(page, dropdown);
		await expect.poll(() => languageDropdownIsOpen(dropdown), { timeout: IOS_TIMEOUTS.hidden }).toBe(false);
		await expect(dropdownMenu).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
		await expect(hasAnyVisible(page, AUTH_ACTION_SELECTORS)).resolves.toBeTruthy();

		const auth = await topbarAuthAction(page);
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('tasks filter drawer closes and does not block topbar taps', async ({ page }, testInfo) => {
		requireMobileSafari(testInfo);
		await gotoAndExpect(page, '/tasks', /\/tasks(?:\?.*)?$/);
		await waitForPublicPageReady(page);

		const filtersButton = page
			.locator('[data-testid="tasks-filters-button"], button:has-text("Filters"), button[aria-label*="Filter"]')
			.first();
		await expect(filtersButton).toBeVisible({ timeout: IOS_TIMEOUTS.find });
		await activate(filtersButton);

		const drawer = page.locator('[role="dialog"]:visible').first();
		await expect(drawer).toBeVisible({ timeout: IOS_TIMEOUTS.visible });

		const closedByButton = await closeDrawerByButtons(drawer);
		if (!closedByButton) {
			await closeDrawerByBackdropOrOutsideTap(page, drawer);
		}
		await expect(drawer).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
		await expect(hasAnyVisible(page, AUTH_ACTION_SELECTORS)).resolves.toBeTruthy();

		const auth = await topbarAuthAction(page);
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('faq accordion interaction does not break topbar auth taps', async ({ page }, testInfo) => {
		requireMobileSafari(testInfo);
		await gotoAndExpect(page, '/faq', /\/faq(?:\?.*)?$/);
		await waitForPublicPageReady(page);
		await expect(
			hasAnyVisible(page, [
				'details summary',
				'.collapse summary',
				'.collapse-title',
				'button.collapse-title'
			])
		).resolves.toBeTruthy();

		const accordion = page
			.locator('details summary, .collapse summary, .collapse-title, button.collapse-title')
			.first();
		await accordion.scrollIntoViewIfNeeded();
		await activate(accordion);
		await expect(hasAnyVisible(page, AUTH_ACTION_SELECTORS)).resolves.toBeTruthy();

		const auth = await topbarAuthAction(page);
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/);
	});
});
