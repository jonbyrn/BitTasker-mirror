import { test, expect, type Locator, type Page } from '@playwright/test';
import {
	IOS_TIMEOUTS,
	activate,
	activateAndWaitForURL,
	gotoAndExpect,
	hasAnyVisible,
	requireMobileSafari,
	topbarAuthAction,
	waitForPublicPageReady
} from './utils/ios-interactions';

function accordionItems(page: Page) {
	return page.locator('details summary, .collapse summary, .collapse-title, button.collapse-title');
}

function isLikelyTapBlockedError(error: unknown) {
	const message =
		error instanceof Error ? error.message : typeof error === 'string' ? error : String(error ?? '');
	const normalized = message.toLowerCase();
	return /pointer|tap|blocked|intercept|not receiving|timeout|timed out/.test(normalized);
}

async function activateWithTapRetry(target: Locator) {
	try {
		await activate(target);
	} catch (error) {
		if (!isLikelyTapBlockedError(error)) {
			throw error;
		}
		await target.scrollIntoViewIfNeeded().catch(() => {});
		await activate(target);
	}
}

test.describe('iOS accordion diagnostics', () => {
	test.describe.configure({ retries: 0, timeout: 35_000 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }, testInfo) => {
		requireMobileSafari(testInfo, 'iOS/WebKit diagnostics only');
		await gotoAndExpect(page, '/faq', /\/faq(?:\?.*)?$/);
		await waitForPublicPageReady(page);
	});

	test('FAQ accordion responds to repeated toggle of same item', async ({ page }) => {
		await expect(
			hasAnyVisible(page, ['details summary', '.collapse summary', '.collapse-title', 'button.collapse-title'])
		).resolves.toBeTruthy();
		const first = accordionItems(page).first();
		await expect(first).toBeVisible({ timeout: IOS_TIMEOUTS.visible });

		for (let i = 0; i < 6; i += 1) {
			await first.scrollIntoViewIfNeeded().catch(() => {});
			await activateWithTapRetry(first);
		}

		await expect(first).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
	});

	test('switching between accordion items remains responsive', async ({ page }) => {
		await expect(
			hasAnyVisible(page, ['details summary', '.collapse summary', '.collapse-title', 'button.collapse-title'])
		).resolves.toBeTruthy();
		const items = accordionItems(page);
		const count = await items.count();
		expect(count).toBeGreaterThan(1);

		const max = Math.min(4, count - 1);
		for (let i = 0; i < max; i += 1) {
			const current = items.nth(i);
			const next = items.nth(i + 1);
			await current.scrollIntoViewIfNeeded().catch(() => {});
			await activate(current);
			await next.scrollIntoViewIfNeeded().catch(() => {});
			await activate(next);
		}

		await expect(items.first()).toBeVisible({ timeout: IOS_TIMEOUTS.visible });
	});

	test('after accordion interactions, topbar auth button still navigates', async ({ page }) => {
		await expect(
			hasAnyVisible(page, ['details summary', '.collapse summary', '.collapse-title', 'button.collapse-title'])
		).resolves.toBeTruthy();
		const items = accordionItems(page);
		const max = Math.min(4, await items.count());
		for (let i = 0; i < max; i += 1) {
			const item = items.nth(i);
			await item.scrollIntoViewIfNeeded().catch(() => {});
			await activate(item);
		}

		const auth = await topbarAuthAction(page);
		await activateAndWaitForURL(page, auth, /\/auth\/(login|signup)(?:\?.*)?$/, IOS_TIMEOUTS.navigation);
	});
});
