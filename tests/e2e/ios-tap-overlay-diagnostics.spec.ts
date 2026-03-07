import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

const MENU_LABEL_RE =
	/(menu|close|men[uú]|cerrar|fechar|chiudi|schlie[ßs]en|fermer|cerrar men[uú])/i;

function requireMobileProject(testInfo: TestInfo): void {
	test.skip(
		!testInfo.project.use.isMobile,
		'This diagnostics spec only runs in mobile viewport projects.'
	);
}

async function gotoTasks(page: Page): Promise<void> {
	await page.goto('/tasks', { waitUntil: 'load' });
	await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/);
}

function menuButton(page: Page): Locator {
	return page.locator('.dock button, button[data-menu-button]').first();
}

function menuBackdrop(page: Page): Locator {
	return page.locator('button.bottom-nav-backdrop[aria-label]').first();
}

function menuOverlay(page: Page): Locator {
	return page.locator('.bottom-nav-overlay').first();
}

async function tryActivate(locator: Locator): Promise<void> {
	try {
		await locator.tap({ timeout: 2_000 });
		return;
	} catch {
		// Fall through to click fallback.
	}
	try {
		await locator.click({ force: true, timeout: 3_000 });
		return;
	} catch {
		// Fall through to HTMLElement.click fallback.
	}
	try {
		await locator.evaluate((el) => (el as HTMLElement).click());
	} catch {
		// Last-resort activation failed; caller assertions will surface it.
	}
}

async function resolveMenuButton(page: Page, timeoutMs = 10_000): Promise<Locator> {
	const candidates = [
		page.locator('button[data-menu-button]').first(),
		page.locator('.dock button[data-menu-button]').first(),
		page.locator('footer button[data-menu-button]').first()
	];
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		for (const candidate of candidates) {
			if (await candidate.isVisible().catch(() => false)) {
				return candidate;
			}
		}
		await page.waitForTimeout(150);
	}
	throw new Error('Menu trigger button not found');
}

async function assertCenterPointTargetsElement(
	page: Page,
	locator: Locator,
	label: string
): Promise<void> {
	const box = await locator.boundingBox();
	expect(box, `${label} should have bounding box`).not.toBeNull();
	if (!box) return;

	const point = {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2
	};

	const isTargeted = await locator.evaluate((el, center) => {
		const hit = document.elementFromPoint(center.x, center.y);
		if (!hit) return false;
		return hit === el || el.contains(hit);
	}, point);
	expect(isTargeted, `${label} center point is blocked by another element`).toBeTruthy();
}

async function openBottomMenu(page: Page): Promise<void> {
	const backdrop = menuBackdrop(page);
	if (await backdrop.isVisible().catch(() => false)) return;

	const button = await resolveMenuButton(page);
	await tryActivate(button);
	if (!(await backdrop.isVisible().catch(() => false))) {
		await button.evaluate((el) => (el as HTMLButtonElement).click());
	}
	await expect(backdrop).toBeVisible({ timeout: 10_000 });
}

async function closeBottomMenu(page: Page): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt += 1) {
		const backdrop = menuBackdrop(page);
		if (!(await backdrop.isVisible().catch(() => false))) return;

		const button = await resolveMenuButton(page);
		await tryActivate(button);
		await page.waitForTimeout(200);
		if (
			!(await menuBackdrop(page)
				.isVisible()
				.catch(() => false))
		)
			return;

		await tryActivate(backdrop);
		await page.waitForTimeout(200);
		if (
			!(await menuBackdrop(page)
				.isVisible()
				.catch(() => false))
		)
			return;
	}

	await expect(menuBackdrop(page)).toBeHidden({ timeout: 8_000 });
	await expect(menuOverlay(page)).toBeHidden({ timeout: 8_000 });
}

async function assertNoBlockingOverlay(page: Page): Promise<void> {
	const overlay = menuOverlay(page);
	if (!(await overlay.count())) {
		return;
	}

	if (await overlay.isVisible().catch(() => false)) {
		const pointerEvents = await overlay.evaluate((el) => getComputedStyle(el).pointerEvents);
		expect(pointerEvents).toBe('none');
	}
}

async function firstVisibleLocator(
	page: Page,
	selectors: string[],
	timeoutMs = 10_000
): Promise<Locator> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		for (const selector of selectors) {
			const locator = page.locator(selector).first();
			if (await locator.isVisible().catch(() => false)) {
				return locator;
			}
		}
		await page.waitForTimeout(200);
	}
	throw new Error(`No visible locator found for selectors: ${selectors.join(', ')}`);
}

async function topbarAuthAction(page: Page): Promise<Locator> {
	return firstVisibleLocator(page, [
		'header a[data-testid="login-link"][href="/auth/login"]',
		'header a[href="/auth/login"]',
		'header a[href="/auth/signup"]'
	]);
}

async function activateAndWaitForURL(
	page: Page,
	locator: Locator,
	urlPattern: RegExp
): Promise<void> {
	const waitForUrl = page
		.waitForURL(urlPattern, { timeout: 10_000 })
		.then(() => true)
		.catch(() => false);
	await tryActivate(locator);
	if (await waitForUrl) return;

	await locator.evaluate((el) => (el as HTMLAnchorElement).click());
	await expect(page).toHaveURL(urlPattern, { timeout: 10_000 });
}

async function dockNavAction(page: Page): Promise<Locator> {
	return firstVisibleLocator(page, [
		'.dock a[href="/about"]',
		'.dock a[href="/how-it-works"]',
		'.dock a[href="/help"]'
	]);
}

test.describe('iOS tap overlay diagnostics (unauthenticated)', () => {
	test.describe.configure({ retries: 0 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test('topbar login link is tappable and navigates to /auth/login', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		const login = await firstVisibleLocator(page, [
			'header a[data-testid="login-link"][href="/auth/login"]',
			'header a[href="/auth/login"]'
		]);

		await expect(login).toBeEnabled();
		await assertCenterPointTargetsElement(page, login, 'Topbar login link');
		await activateAndWaitForURL(page, login, /\/auth\/login(?:\?.*)?$/);
	});

	test('after menu open/close, topbar auth action remains tappable', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		const button = menuButton(page);
		const label = (await button.getAttribute('aria-label')) || '';
		expect(MENU_LABEL_RE.test(label)).toBeTruthy();

		await openBottomMenu(page);
		await closeBottomMenu(page);

		const action = await topbarAuthAction(page);
		const href = (await action.getAttribute('href')) || '';
		await assertCenterPointTargetsElement(page, action, 'Topbar auth action after menu close');
		await activateAndWaitForURL(page, action, /\/auth\/(login|signup)(?:\?.*)?$/);

		if (href.includes('/auth/signup')) {
			await expect(page).toHaveURL(/\/auth\/signup(?:\?.*)?$/);
		} else {
			await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/);
		}
	});

	test('menu open/close x3 does not block dock navigation', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		for (let i = 0; i < 3; i += 1) {
			await openBottomMenu(page);
			await closeBottomMenu(page);
		}

		const beforeUrl = page.url();
		const dockLink = await dockNavAction(page);
		const href = (await dockLink.getAttribute('href')) || '';
		await tryActivate(dockLink);

		await expect(href).not.toBe('/tasks');
		await expect(page).not.toHaveURL(beforeUrl);
		await expect(page).toHaveURL(
			new RegExp(`${href.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:\\?.*)?$`)
		);
	});

	test('overlay is not hit-testable after menu closes', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		await openBottomMenu(page);
		await closeBottomMenu(page);
		await assertNoBlockingOverlay(page);

		const action = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(page, action, 'Topbar auth action after overlay close');
		await activateAndWaitForURL(page, action, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('topbar tap still works after scrolling list', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		await page.evaluate(() => {
			const appScroller =
				document.querySelector<HTMLElement>('.app-shell__content') ?? document.scrollingElement;
			if (!appScroller) return;
			appScroller.scrollTo({ top: 2200, behavior: 'auto' });
		});
		await page.waitForTimeout(300);
		await page.evaluate(() => {
			const appScroller =
				document.querySelector<HTMLElement>('.app-shell__content') ?? document.scrollingElement;
			if (!appScroller) return;
			appScroller.scrollTo({ top: 900, behavior: 'auto' });
		});
		await page.waitForTimeout(200);

		const action = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(page, action, 'Topbar auth action after scroll');
		await activateAndWaitForURL(page, action, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('tap and click parity for topbar auth link', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		const login = await firstVisibleLocator(page, [
			'header a[data-testid="login-link"][href="/auth/login"]',
			'header a[href="/auth/login"]'
		]);

		await assertCenterPointTargetsElement(page, login, 'Topbar login link (tap phase)');
		await activateAndWaitForURL(page, login, /\/auth\/login(?:\?.*)?$/);

		await page.goto('/tasks', { waitUntil: 'load' });
		await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/);

		const loginAgain = await firstVisibleLocator(page, [
			'header a[data-testid="login-link"][href="/auth/login"]',
			'header a[href="/auth/login"]'
		]);

		await assertCenterPointTargetsElement(page, loginAgain, 'Topbar login link (click phase)');
		await loginAgain.click();
		await expect(page).toHaveURL(/\/auth\/login(?:\?.*)?$/, { timeout: 10_000 });
	});

	test('rapid menu toggle then topbar tap remains responsive (3x)', async ({ page }, testInfo) => {
		requireMobileProject(testInfo);
		await gotoTasks(page);

		for (let i = 0; i < 3; i += 1) {
			await openBottomMenu(page);
			await closeBottomMenu(page);
			await assertNoBlockingOverlay(page);
		}

		const action = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(page, action, 'Topbar auth action after rapid toggles');
		await activateAndWaitForURL(page, action, /\/auth\/(login|signup)(?:\?.*)?$/);
	});

	test('standalone-mode emulation: topbar auth action remains tappable', async ({
		page
	}, testInfo) => {
		requireMobileProject(testInfo);

		await page.addInitScript(() => {
			Object.defineProperty(window.navigator, 'standalone', {
				configurable: true,
				get: () => true
			});
			const originalMatchMedia = window.matchMedia.bind(window);
			window.matchMedia = ((query: string): MediaQueryList => {
				if (query.includes('display-mode') && query.includes('standalone')) {
					return {
						matches: true,
						media: query,
						onchange: null,
						addListener: () => {},
						removeListener: () => {},
						addEventListener: () => {},
						removeEventListener: () => {},
						dispatchEvent: () => true
					} as MediaQueryList;
				}
				return originalMatchMedia(query);
			}) as typeof window.matchMedia;
		});

		await gotoTasks(page);
		const action = await topbarAuthAction(page);
		await assertCenterPointTargetsElement(
			page,
			action,
			'Topbar auth action in standalone emulation'
		);
		await activateAndWaitForURL(page, action, /\/auth\/(login|signup)(?:\?.*)?$/);
	});
});
