import { test, expect, type Page } from '@playwright/test';
import {
	activate,
	activateAndWaitForURL,
	IOS_TIMEOUTS,
	clickOutsideTarget,
	hasAnyVisible,
	topbarAuthAction,
	waitForPublicPageReady
} from './utils/ios-interactions';

const FAQ_PATH = /\/faq(?:\?.*)?$/;

function escapeForRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function languageDropdownIsOpen(dropdown: import('@playwright/test').Locator): Promise<boolean> {
	return dropdown.evaluate((el) => {
		if (el.classList.contains('dropdown-open')) return true;
		return el instanceof HTMLDetailsElement && el.open;
	});
}

async function openLanguageDropdown(page: Page) {
	const trigger = page.locator('.language-dropdown > button, details.language-dropdown > summary, [data-tip]').first();
	const dropdownRoot = page.locator('.language-dropdown, details.language-dropdown').first();
	const dropdownMenu = dropdownRoot.locator('.dropdown-content').first();
	const spanishOptionImage = dropdownMenu.locator('img[alt="Español flag"]').first();

	await expect(trigger).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
	await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.interaction }).toBe(false);
	await activate(trigger);
	await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.visible }).toBe(true);
	await expect(dropdownMenu).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
	await expect(spanishOptionImage).toBeVisible({ timeout: IOS_TIMEOUTS.visible });

	return { dropdownRoot, trigger, dropdownMenu, spanishOptionImage };
}

test.describe('WebKit dropdown diagnostics (logged out)', () => {
	test.describe.configure({ retries: 0, timeout: 40_000 });
	test.skip(({ browserName }) => browserName !== 'webkit', 'WebKit diagnostics only');

	test.beforeEach(async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/faq', { waitUntil: 'domcontentloaded' });
		await expect(page).toHaveURL(FAQ_PATH, { timeout: IOS_TIMEOUTS.navigation });
		await waitForPublicPageReady(page);
	});

	test('language dropdown opens and closes on outside tap', async ({ page }) => {
		expect(
			await hasAnyVisible(page, [
				'.language-dropdown > button',
				'details.language-dropdown > summary',
				'.language-dropdown summary',
				'[data-tip]'
			]),
			'Language dropdown trigger not rendered'
		).toBeTruthy();
		const { dropdownRoot, dropdownMenu, spanishOptionImage } = await openLanguageDropdown(page);

		await clickOutsideTarget(page, dropdownRoot);
		await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.hidden }).toBe(false);
		await expect(dropdownMenu).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
		await expect(spanishOptionImage).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
		await expect(dropdownRoot).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
	});

	test('topbar auth action navigates to auth route', async ({ page }) => {
		expect(
			await hasAnyVisible(page, [
				'[data-testid="login-link"]',
				'a[href="/auth/login"]',
				'a[href="/auth/signup"]',
				'.bottom-nav-overlay a[href="/auth/login"]',
				'.bottom-nav-overlay a[href="/auth/signup"]'
			]),
			'Topbar or menu auth action is not rendered in this layout'
		).toBeTruthy();
		const authAction = await topbarAuthAction(page);

		const href = await authAction.getAttribute('href');
		const hrefPattern = href
			? new RegExp(`${escapeForRegex(href)}(?:[/?#].*)?$`)
			: /\/auth\/(login|signup)(?:[/?#].*)?$/;
		await activateAndWaitForURL(page, authAction, hrefPattern);
	});

	test('language dropdown stress: 3 open-close cycles leave no stuck-open state', async ({ page }) => {
		const trigger = page.locator('.language-dropdown > button, details.language-dropdown > summary, [data-tip]').first();
		expect(
			await hasAnyVisible(page, [
				'.language-dropdown > button',
				'details.language-dropdown > summary',
				'.language-dropdown summary',
				'[data-tip]'
			]),
			'Language dropdown trigger not rendered'
		).toBeTruthy();
		const dropdownRoot = page.locator('.language-dropdown, details.language-dropdown').first();
		const dropdownMenu = dropdownRoot.locator('.dropdown-content').first();
		const spanishOptionImage = dropdownMenu.locator('img[alt="Español flag"]').first();
		await expect(trigger).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.interaction }).toBe(false);

		for (let i = 0; i < 3; i += 1) {
			await activate(trigger);
			await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.visible }).toBe(true);
			await expect(dropdownMenu).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
			await expect(spanishOptionImage).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
			await clickOutsideTarget(page, dropdownRoot);
			await expect.poll(() => languageDropdownIsOpen(dropdownRoot), { timeout: IOS_TIMEOUTS.hidden }).toBe(false);
			await expect(dropdownMenu).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
			await expect(spanishOptionImage).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });
		}
	});
});
