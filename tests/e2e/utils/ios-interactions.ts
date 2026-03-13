import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export const IOS_TIMEOUTS = {
	interaction: 8_000,
	navigation: 20_000,
	visible: 12_000,
	hidden: 8_000,
	find: 18_000,
	ready: 25_000
} as const;

const POLL_INTERVALS = [80, 140, 220, 320] as const;
const MENU_STATE_TIMEOUT = 3_500;
const MENU_INTERACTION_TIMEOUT = 2_500;

const PUBLIC_AUTH_OR_MENU_SELECTORS = [
	'a[data-testid="login-link"][href="/auth/login"]',
	'a[href="/auth/login"]',
	'a[href="/auth/signup"]',
	'button[data-menu-button]',
	'.dock button[data-menu-button]',
	'footer button[data-menu-button]'
];

export function requireMobileSafari(
	testInfo: TestInfo,
	reason = 'iOS Mobile Safari diagnostics only'
): void {
	testInfo.skip(!testInfo.project.name.includes('Mobile Safari'), reason);
}

export async function gotoAndExpect(page: Page, path: string, pattern: RegExp): Promise<void> {
	await page.goto(path, { waitUntil: 'domcontentloaded' });
	await expect(page).toHaveURL(pattern, { timeout: IOS_TIMEOUTS.navigation });
}

export async function firstVisibleLocator(
	page: Page,
	selectors: string[],
	timeoutMs = IOS_TIMEOUTS.find
): Promise<Locator> {
	let pollResult = '';
	await expect
		.poll(
			async () => {
				if (page.isClosed()) {
					pollResult = 'page-closed';
					return 'ready';
				}
				for (const selector of selectors) {
					const candidate = page.locator(selector).first();
					if (await candidate.isVisible().catch(() => false)) {
						pollResult = selector;
						return 'ready';
					}
				}
				pollResult = '';
				return 'pending';
			},
			{ timeout: timeoutMs, intervals: [...POLL_INTERVALS] }
		)
		.toBe('ready');

	if (pollResult === 'page-closed') {
		throw new Error(`Page closed while searching selectors: ${selectors.join(', ')}`);
	}

	if (!pollResult) {
		throw new Error(`No visible element found for selectors: ${selectors.join(', ')}`);
	}

	return page.locator(pollResult).first();
}

export async function waitForTappable(
	page: Page,
	selectors: string[],
	timeoutMs = IOS_TIMEOUTS.ready
): Promise<Locator> {
	const locator = await firstVisibleLocator(page, selectors, timeoutMs);
	await expect(locator).toBeVisible({ timeout: timeoutMs });
	await expect(locator).toBeEnabled({ timeout: timeoutMs });
	await assertCenterPointTargetsElement(locator, `Tappable target (${selectors.join(' | ')})`);
	return locator;
}

export async function waitForPublicPageReady(
	page: Page,
	timeoutMs = IOS_TIMEOUTS.ready
): Promise<Locator> {
	return waitForTappable(page, PUBLIC_AUTH_OR_MENU_SELECTORS, timeoutMs);
}

export async function failFastPrerequisites(
	page: Page,
	prerequisites: Array<{ name: string; selectors: string[] }>
): Promise<void> {
	for (const prerequisite of prerequisites) {
		const locator = page.locator(prerequisite.selectors.join(', ')).first();
		await expect(locator, `Missing prerequisite: ${prerequisite.name}`).toBeVisible({
			timeout: IOS_TIMEOUTS.find
		});
	}
}

export async function hasAnyVisible(page: Page, selectors: string[]): Promise<boolean> {
	return hasAnyVisibleWithin(page, selectors, IOS_TIMEOUTS.find);
}

export async function hasAnyVisibleWithin(
	page: Page,
	selectors: string[],
	timeoutMs: number
): Promise<boolean> {
	try {
		await firstVisibleLocator(page, selectors, timeoutMs);
		return true;
	} catch {
		return false;
	}
}

type TapPoint = { x: number; y: number };

async function resolveTappablePoint(locator: Locator): Promise<TapPoint | null> {
	return locator
		.evaluate((el) => {
			const rect = el.getBoundingClientRect();
			if (rect.width <= 0 || rect.height <= 0) return null;
			const clampX = (x: number) => Math.max(0, Math.min(window.innerWidth - 1, x));
			const clampY = (y: number) => Math.max(0, Math.min(window.innerHeight - 1, y));
			const candidates = [
				{ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
				{ x: rect.left + 6, y: rect.top + 6 },
				{ x: rect.right - 6, y: rect.top + 6 },
				{ x: rect.left + 6, y: rect.bottom - 6 },
				{ x: rect.right - 6, y: rect.bottom - 6 }
			].map((point) => ({ x: clampX(point.x), y: clampY(point.y) }));

			for (const point of candidates) {
				const hit = document.elementFromPoint(point.x, point.y);
				if (hit && (hit === el || el.contains(hit))) {
					return point;
				}
			}
			return null;
		})
		.catch(() => null);
}

async function waitForTappablePoint(
	locator: Locator,
	timeoutMs = IOS_TIMEOUTS.interaction
): Promise<TapPoint | null> {
	const page = locator.page();
	let point: TapPoint | null = null;
	await expect
		.poll(
			async () => {
				if (page.isClosed()) return 'page-closed';
				point = await resolveTappablePoint(locator);
				return point ? 'ready' : 'pending';
			},
			{ timeout: timeoutMs, intervals: [...POLL_INTERVALS] }
		)
		.toBe('ready');
	return point;
}

export async function activate(locator: Locator): Promise<void> {
	await expect(locator).toBeVisible({ timeout: IOS_TIMEOUTS.interaction });
	await expect(locator).toBeEnabled({ timeout: IOS_TIMEOUTS.interaction });
	await locator.scrollIntoViewIfNeeded().catch(() => {});
	const point = await waitForTappablePoint(locator, IOS_TIMEOUTS.interaction);
	expect(
		point,
		'Activation target has no tappable point (blocked by another element)'
	).not.toBeNull();
	if (!point) return;

	const page = locator.page();
	const performTapLikeActivation = async () => {
		await locator.tap({ timeout: IOS_TIMEOUTS.interaction });
	};

	const performAbsoluteTap = async () => {
		const currentPoint = await waitForTappablePoint(locator, IOS_TIMEOUTS.interaction);
		expect(
			currentPoint,
			'Activation target should have bounding box at activation time'
		).not.toBeNull();
		if (!currentPoint) return;
		await page.touchscreen.tap(currentPoint.x, currentPoint.y);
	};

	try {
		await performTapLikeActivation();
		return;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (!/Timeout|intercept|pointer|tap|touch|not support tap|target closed/i.test(message)) {
			throw error;
		}
	}

	try {
		await performAbsoluteTap();
		return;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/hasTouch|touch-enabled|does not support tap|not support tap/i.test(message)) {
			await page.mouse.click(point.x, point.y);
			return;
		}
	}

	try {
		await locator.click({ timeout: IOS_TIMEOUTS.interaction });
		return;
	} catch {
		// fall through
	}

	await activateWithForceFallback(locator);
}

export async function activateWithForceFallback(locator: Locator): Promise<void> {
	const page = locator.page();

	try {
		await locator.tap({ timeout: IOS_TIMEOUTS.interaction });
		return;
	} catch {
		// fall through to legacy fallbacks for non-strict diagnostics.
	}

	try {
		await locator.click({ force: true, timeout: IOS_TIMEOUTS.interaction });
		return;
	} catch {
		// fall through
	}

	try {
		await locator.click({ timeout: IOS_TIMEOUTS.interaction });
		return;
	} catch {
		// fall through
	}

	const point = await waitForTappablePoint(locator, IOS_TIMEOUTS.interaction);
	expect(point, 'Force fallback could not resolve a tappable point').not.toBeNull();
	if (!point) return;

	await page.mouse.click(point.x, point.y);
}

async function quickActivate(locator: Locator, timeout = MENU_INTERACTION_TIMEOUT): Promise<void> {
	await locator.scrollIntoViewIfNeeded().catch(() => {});

	try {
		await locator.tap({ timeout });
		return;
	} catch {
		// fall through
	}

	try {
		await locator.click({ timeout });
		return;
	} catch {
		// fall through
	}

	await locator.click({ force: true, timeout });
}

export async function clickOutsideTarget(page: Page, target: Locator): Promise<void> {
	const point = await target
		.evaluate((el) => {
			const rect = el.getBoundingClientRect();
			const vw = window.innerWidth;
			const vh = window.innerHeight;
			const candidates = [
				{ x: 16, y: 80 },
				{ x: vw - 16, y: 80 },
				{ x: 16, y: vh - 120 },
				{ x: vw - 16, y: vh - 120 },
				{ x: Math.floor(vw / 2), y: 80 }
			];
			return (
				candidates.find(
					(candidate) =>
						candidate.x >= 0 &&
						candidate.x <= vw &&
						candidate.y >= 0 &&
						candidate.y <= vh &&
						(candidate.x < rect.left ||
							candidate.x > rect.right ||
							candidate.y < rect.top ||
							candidate.y > rect.bottom)
				) ?? null
			);
		})
		.catch(() => null);

	expect(point, 'Could not find an outside click point').toBeDefined();
	if (!point) return;

	try {
		await page.touchscreen.tap(point.x, point.y);
		return;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		if (/hasTouch|touch-enabled|does not support tap|not support tap/i.test(message)) {
			await page.mouse.click(point.x, point.y);
			return;
		}
		throw error;
	}
}

export async function activateAndWaitForURL(
	page: Page,
	locator: Locator,
	urlPattern: RegExp,
	timeoutMs = IOS_TIMEOUTS.navigation
): Promise<void> {
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (page.isClosed()) {
			throw new Error(`Page closed before activation attempt ${attempt + 1} for ${urlPattern}`);
		}

		const waitForUrl = page
			.waitForURL(urlPattern, { timeout: timeoutMs })
			.then(() => true)
			.catch(() => false);
		if (attempt < 2) {
			await activate(locator);
		} else {
			await activateWithForceFallback(locator);
		}
		if (await waitForUrl) return;
		await page.waitForLoadState('load', { timeout: 1_500 }).catch(() => {});
	}

	throw new Error(
		`Activation did not navigate to ${urlPattern.toString()} within ${timeoutMs}ms after 3 attempts`
	);
}

export function menuBackdrop(page: Page): Locator {
	return page.locator('button.bottom-nav-backdrop[aria-label]').first();
}

function bottomMenuOverlay(page: Page): Locator {
	return page.locator('.bottom-nav-overlay').first();
}

function expandedBottomMenuPanel(page: Page): Locator {
	return page.locator('.bottom-nav-overlay .bottom-nav-menu.menu-expand').first();
}

async function isBottomMenuOpen(page: Page): Promise<boolean> {
	const overlay = bottomMenuOverlay(page);
	if (!(await overlay.isVisible().catch(() => false))) {
		return false;
	}
	return expandedBottomMenuPanel(page)
		.isVisible()
		.catch(() => false);
}

export async function resolveMenuButton(
	page: Page,
	timeoutMs = IOS_TIMEOUTS.ready
): Promise<Locator> {
	return firstVisibleLocator(
		page,
		[
			'button[data-menu-button]',
			'.dock button[data-menu-button]',
			'footer button[data-menu-button]'
		],
		timeoutMs
	);
}

export async function openBottomMenu(page: Page): Promise<void> {
	if (await isBottomMenuOpen(page)) return;

	for (let attempt = 0; attempt < 5; attempt += 1) {
		const button = await resolveMenuButton(page, IOS_TIMEOUTS.navigation);
		await button.scrollIntoViewIfNeeded().catch(() => {});
		if (attempt === 0) {
			await button
				.evaluate((element) => {
					if (element instanceof HTMLElement) {
						element.click();
					}
				})
				.catch(() => {});
		} else if (attempt === 1) {
			await button.dispatchEvent('click').catch(() => {});
		} else if (attempt === 2) {
			await quickActivate(button).catch(() => activate(button));
		} else if (attempt === 3) {
			await quickActivate(button).catch(() => activateWithForceFallback(button));
		} else {
			await button.click({ force: true, timeout: IOS_TIMEOUTS.interaction }).catch(() => {});
		}
		const opened = await expect
			.poll(async () => isBottomMenuOpen(page), {
				timeout: MENU_STATE_TIMEOUT,
				intervals: [...POLL_INTERVALS]
			})
			.toBe(true)
			.then(() => true)
			.catch(() => false);
		if (opened) return;
	}

	throw new Error('Bottom menu did not open after 5 attempts');
}

export async function closeBottomMenu(page: Page): Promise<void> {
	if (!(await isBottomMenuOpen(page))) return;

	for (let attempt = 0; attempt < 3; attempt += 1) {
		const backdrop = menuBackdrop(page);
		if (await backdrop.isVisible().catch(() => false)) {
			await quickActivate(backdrop).catch(() => {});
		} else {
			const button = await resolveMenuButton(page, IOS_TIMEOUTS.navigation);
			await quickActivate(button).catch(() => {});
		}

		const closed = await expect
			.poll(async () => isBottomMenuOpen(page), {
				timeout: MENU_STATE_TIMEOUT,
				intervals: [...POLL_INTERVALS]
			})
			.toBe(false)
			.then(() => true)
			.catch(() => false);
		if (closed) return;
	}

	throw new Error('Bottom menu did not close after 3 attempts');
}

export async function topbarAuthAction(page: Page): Promise<Locator> {
	const directSelectors = [
		'a[data-testid="login-link"][href="/auth/login"]',
		'a[href="/auth/login"]',
		'a[href="/auth/signup"]',
		'button:has-text("Login")',
		'button:has-text("Sign Up")'
	];

	if (await hasAnyVisibleWithin(page, directSelectors, IOS_TIMEOUTS.find)) {
		return firstVisibleLocator(page, directSelectors);
	}

	await openBottomMenu(page);
	if (await hasAnyVisibleWithin(page, directSelectors, IOS_TIMEOUTS.interaction)) {
		return firstVisibleLocator(page, directSelectors);
	}
	const menuSelectors = [
		'.bottom-nav-overlay a[href="/auth/login"]',
		'.bottom-nav-overlay a[href="/auth/signup"]',
		'.bottom-nav-overlay button:has-text("Login")',
		'.bottom-nav-overlay button:has-text("Sign Up")'
	];
	return firstVisibleLocator(page, menuSelectors);
}

export async function assertCenterPointTargetsElement(
	locator: Locator,
	label: string
): Promise<void> {
	const point = await waitForTappablePoint(locator, IOS_TIMEOUTS.interaction);
	expect(point, `${label} has no tappable point (blocked by another element)`).not.toBeNull();
}
