import { test, expect } from '@playwright/test';
import {
	IOS_TIMEOUTS,
	activate,
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

function languageDropdown(page: import('@playwright/test').Page) {
	return page.locator('details.language-dropdown, .language-dropdown').first();
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

async function installTapProbe(page: import('@playwright/test').Page): Promise<void> {
	await page.addInitScript(() => {
		type ProbeEvent = { type: string; time: number };
		const win = window as Window & {
			__iosTapProbe?: { events: ProbeEvent[]; clear: () => void };
		};
		if (win.__iosTapProbe) return;
		const state = {
			events: [] as ProbeEvent[],
			clear() {
				state.events.length = 0;
			}
		};
		const record = (event: Event) => {
			state.events.push({ type: event.type, time: Date.now() });
		};
		document.addEventListener('pointerdown', record, true);
		document.addEventListener('touchstart', record, true);
		document.addEventListener('click', record, true);
		win.__iosTapProbe = state;
	});
}

test.describe('iOS WebKit interaction diagnostics', () => {
	test.describe.configure({ retries: 0, timeout: 60_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }, testInfo) => {
		requireMobileSafari(testInfo, 'iOS/WebKit diagnostics only');
		await installTapProbe(page);
		await gotoAndExpect(page, '/faq', /\/faq(?:\?.*)?$/);
		await waitForPublicPageReady(page);
	});

	test('auth tap emits click events and navigates', async ({ page }) => {
		await expect(hasAnyVisible(page, [...DIRECT_AUTH_SELECTORS, ...MENU_TRIGGER_SELECTORS])).resolves.toBeTruthy();

		await page.evaluate(() => {
			const win = window as Window & { __iosTapProbe?: { clear: () => void } };
			win.__iosTapProbe?.clear();
		});
		const authAction = await topbarAuthAction(page);
		await activateAndWaitForURL(page, authAction, /\/auth\/(login|signup)(?:\?.*)?$/);

		const probe = await page.evaluate(() => {
			const win = window as Window & { __iosTapProbe?: { events: Array<{ type: string }> } };
			return win.__iosTapProbe?.events ?? [];
		});
		expect(probe.some((e) => e.type === 'click')).toBeTruthy();
	});

	test('menu close transition does not keep intercepting topbar taps', async ({ page }) => {
		await expect(hasAnyVisible(page, MENU_TRIGGER_SELECTORS)).resolves.toBeTruthy();
		await openBottomMenu(page);
		await closeBottomMenu(page);

		const authAction = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(authAction, 'Topbar auth action after menu close');
		await activateAndWaitForURL(page, authAction, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('language dropdown/menu interaction does not block topbar auth tap', async ({ page }) => {
		await expect(
			hasAnyVisible(page, [
				'details.language-dropdown summary',
				'.language-dropdown summary',
				'details.language-dropdown button',
				'.language-dropdown button'
			])
		).resolves.toBeTruthy();
		await expect(hasAnyVisible(page, MENU_TRIGGER_SELECTORS)).resolves.toBeTruthy();

		const dropdown = languageDropdown(page);
		await expect(dropdown).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
		const trigger = dropdown.locator('summary, button').first();
		await activate(trigger);
		await openBottomMenu(page);
		await closeBottomMenu(page);
		await expect(menuBackdrop(page)).toBeHidden({ timeout: IOS_TIMEOUTS.hidden });

		const authAction = await topbarAuthAction(page);
		await activateAndWaitForURL(page, authAction, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('rapid auth tap cadence remains responsive', async ({ page }) => {
		await expect(hasAnyVisible(page, [...DIRECT_AUTH_SELECTORS, ...MENU_TRIGGER_SELECTORS])).resolves.toBeTruthy();

		if (!/\/faq(?:\?.*)?$/.test(page.url())) {
			await gotoAndExpect(page, '/faq', /\/faq(?:\?.*)?$/);
		}
		const authAction = await topbarAuthAction(page);
		const waitForAuth = page
			.waitForURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: IOS_TIMEOUTS.navigation })
			.then(() => true)
			.catch(() => false);
		await activate(authAction);
		const navigated = await waitForAuth;
		expect(navigated).toBeTruthy();
	});
});
