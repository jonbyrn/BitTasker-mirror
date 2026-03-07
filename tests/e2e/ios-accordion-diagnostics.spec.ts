import { test, expect, type Page, type TestInfo } from '@playwright/test';

function requireIOSWebkit(testInfo: TestInfo): void {
	test.skip(
		!testInfo.project.name.includes('Mobile Safari'),
		'iOS/WebKit diagnostics only'
	);
}

async function gotoFaq(page: Page): Promise<void> {
	await page.goto('/faq', { waitUntil: 'load' });
	await expect(page).toHaveURL(/\/faq(?:\?.*)?$/);
}

function accordionButtons(page: Page) {
	return page.getByRole('button').filter({ hasText: /\?$/ });
}

async function topbarAuthAction(page: Page) {
	const selectors = [
		'a[data-testid="login-link"][href="/auth/login"]',
		'a[href="/auth/login"]',
		'a[href="/auth/signup"]'
	];
	for (const selector of selectors) {
		const locator = page.locator(selector).first();
		if ((await locator.count()) > 0) return locator;
	}
	throw new Error('Topbar auth action not found on FAQ page');
}

async function tap(locator: ReturnType<Page['locator']>) {
	await locator.tap({ timeout: 2_000 }).catch(async () => {
		await locator.click({ force: true, timeout: 2_000 });
	});
}

test.describe('iOS accordion diagnostics', () => {
	test.describe.configure({ retries: 0 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }, testInfo) => {
		requireIOSWebkit(testInfo);
		await gotoFaq(page);
	});

	test('FAQ accordion responds to repeated toggle of same item (10x)', async ({ page }) => {
		const first = accordionButtons(page).first();
		await expect(first).toBeVisible();
		const parent = first.locator('xpath=ancestor::div[contains(@class, "collapse")][1]');
		await expect(parent).toBeVisible();

		let isOpen = (((await parent.getAttribute('class')) || '').includes('collapse-open'));
		for (let i = 0; i < 10; i += 1) {
			await tap(first);
			isOpen = !isOpen;
			await expect
				.poll(async () => (((await parent.getAttribute('class')) || '').includes('collapse-open')), {
					timeout: 3_000
				})
				.toBe(isOpen);
		}
	});

	test('switching between accordion items remains responsive', async ({ page }) => {
		const buttons = accordionButtons(page);
		const count = await buttons.count();
		expect(count).toBeGreaterThan(2);

		for (let i = 0; i < 6; i += 1) {
			const a = buttons.nth(i % count);
			const b = buttons.nth((i + 1) % count);
			await tap(a);
			await page.waitForTimeout(120);
			await tap(b);
			await page.waitForTimeout(120);
		}

		const active = page.locator('.collapse.collapse-open').first();
		await expect(active).toBeVisible();
	});

	test('after accordion interactions, topbar auth button still navigates', async ({ page }) => {
		const buttons = accordionButtons(page);
		const max = Math.min(6, await buttons.count());
		for (let i = 0; i < max; i += 1) {
			await tap(buttons.nth(i));
			await page.waitForTimeout(100);
		}

		const auth = await topbarAuthAction(page);
		await tap(auth);
		await expect(page).toHaveURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: 10_000 });
	});
});
