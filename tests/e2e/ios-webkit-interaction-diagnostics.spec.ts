import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';

function requireIOSWebkit(testInfo: TestInfo): void {
	test.skip(!testInfo.project.name.includes('Mobile Safari'), 'iOS/WebKit diagnostics only');
}

async function gotoTasks(page: Page): Promise<void> {
	await page.goto('/tasks', { waitUntil: 'load' });
	await expect(page).toHaveURL(/\/tasks(?:\?.*)?$/);
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
		await page.waitForTimeout(150);
	}
	throw new Error(`No visible locator found for selectors: ${selectors.join(', ')}`);
}

async function topbarAuthAction(page: Page): Promise<Locator> {
	return firstVisibleLocator(page, [
		'a[data-testid="login-link"][href="/auth/login"]',
		'a[href="/auth/login"]',
		'a[href="/auth/signup"]'
	]);
}

function menuBackdrop(page: Page): Locator {
	return page.locator('button.bottom-nav-backdrop[aria-label]').first();
}

function languageDropdown(page: Page): Locator {
	return page.locator('details.language-dropdown').first();
}

async function tapLocator(locator: Locator): Promise<void> {
	let lastError: unknown;
	try {
		await locator.tap({ timeout: 2_000 });
		return;
	} catch (error) {
		lastError = error;
	}
	try {
		await locator.click({ force: true, timeout: 3_000 });
		return;
	} catch (error) {
		lastError = error;
	}
	throw lastError instanceof Error ? lastError : new Error('Failed to activate locator');
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

async function openBottomMenu(page: Page): Promise<void> {
	const backdrop = menuBackdrop(page);
	if (await backdrop.isVisible().catch(() => false)) return;

	const button = await resolveMenuButton(page);
	await tapLocator(button);
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
		await tapLocator(button);
		await page.waitForTimeout(200);
		if (!(await backdrop.isVisible().catch(() => false))) return;

		await tapLocator(backdrop);
		await page.waitForTimeout(200);
		if (!(await backdrop.isVisible().catch(() => false))) return;
	}
	await expect(menuBackdrop(page)).toBeHidden({ timeout: 8_000 });
}

async function installTapProbe(page: Page): Promise<void> {
	await page.addInitScript(() => {
		type ProbeEvent = {
			type: string;
			time: number;
			defaultPrevented: boolean;
			targetTag: string;
			targetClass: string;
			hitTag: string;
			hitClass: string;
			x: number;
			y: number;
		};
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
			const pointer = event as MouseEvent;
			const target = event.target as HTMLElement | null;
			const x = Number.isFinite(pointer.clientX) ? pointer.clientX : 0;
			const y = Number.isFinite(pointer.clientY) ? pointer.clientY : 0;
			const hit = document.elementFromPoint(x, y) as HTMLElement | null;
			state.events.push({
				type: event.type,
				time: Date.now(),
				defaultPrevented: event.defaultPrevented,
				targetTag: target?.tagName || '',
				targetClass: target?.className || '',
				hitTag: hit?.tagName || '',
				hitClass: hit?.className || '',
				x,
				y
			});
		};

		document.addEventListener('pointerdown', record, true);
		document.addEventListener('touchstart', record, true);
		document.addEventListener('click', record, true);
		win.__iosTapProbe = state;
	});
}

test.describe('iOS WebKit interaction diagnostics', () => {
	test.describe.configure({ retries: 0 });
	test.use({ storageState: { cookies: [], origins: [] } });

	test.beforeEach(async ({ page }, testInfo) => {
		requireIOSWebkit(testInfo);
		await installTapProbe(page);
		await gotoTasks(page);
	});

	test('auth tap emits click events and navigates', async ({ page }) => {
		await page.evaluate(() => {
			const win = window as Window & { __iosTapProbe?: { clear: () => void } };
			win.__iosTapProbe?.clear();
		});
		const authAction = await topbarAuthAction(page);
		await tapLocator(authAction);
		await expect(page).toHaveURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: 10_000 });

		const probe = await page.evaluate(() => {
			const win = window as Window & {
				__iosTapProbe?: { events: Array<{ type: string; defaultPrevented: boolean }> };
			};
			return win.__iosTapProbe?.events ?? [];
		});
		expect(probe.some((e) => e.type === 'click')).toBeTruthy();
	});

	test('menu close transition does not keep intercepting topbar taps', async ({ page }) => {
		await openBottomMenu(page);
		await closeBottomMenu(page);

		const authAction = await topbarAuthAction(page);
		const box = await authAction.boundingBox();
		expect(box).not.toBeNull();
		if (!box) return;
		const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

		const hitSummary = await page.evaluate((point) => {
			const hit = document.elementFromPoint(point.x, point.y) as HTMLElement | null;
			return {
				tag: hit?.tagName || '',
				className: hit?.className || ''
			};
		}, center);

		expect(String(hitSummary.className)).not.toContain('bottom-nav-backdrop');
		await tapLocator(authAction);
		await expect(page).toHaveURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: 10_000 });
	});

	test('language dropdown/menu interaction does not block topbar auth tap', async ({ page }) => {
		const dropdown = languageDropdown(page);
		await expect(dropdown).toBeVisible();
		const summary = dropdown.locator('summary').first();
		await tapLocator(summary);
		await expect(dropdown).toHaveAttribute('open', '', { timeout: 5_000 });

		await openBottomMenu(page);
		await closeBottomMenu(page);

		const authAction = await topbarAuthAction(page);
		await tapLocator(authAction);
		await expect(page).toHaveURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: 10_000 });
	});

	test('rapid auth tap cadence remains responsive (5 attempts max)', async ({ page }) => {
		let navigated = false;
		for (let i = 0; i < 5; i += 1) {
			if (!/\/tasks(?:\?.*)?$/.test(page.url())) {
				await gotoTasks(page);
			}

			const authAction = await topbarAuthAction(page, 3_000);
			await authAction.click({ force: true, timeout: 3_000 });
			const reachedAuth = await page
				.waitForURL(/\/auth\/(login|signup)(?:\?.*)?$/, { timeout: 2_500 })
				.then(() => true)
				.catch(() => false);
			if (reachedAuth) {
				navigated = true;
				break;
			}
			await page.waitForTimeout(250);
		}
		expect(
			navigated,
			'Expected at least one successful auth navigation in 5 rapid attempts'
		).toBeTruthy();
	});
});
