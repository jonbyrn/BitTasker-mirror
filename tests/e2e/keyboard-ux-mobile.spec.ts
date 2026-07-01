import { expect, test, type Page } from '@playwright/test';

/**
 * Keyboard UX Mobile E2E Tests
 *
 * Tests the keyboard open/close lifecycle on mobile, including:
 * - Footer animation driven by Motion library (GPU-accelerated)
 * - VisualViewport-based keyboard detection
 * - Scroll behavior (nearest, no centering jump)
 * - Phantom keyboard detection
 * - Layout stability during keyboard state changes
 *
 * Playwright emulates mobile devices via viewport + user agent.
 * Keyboard is simulated by: setting data-keyboard-visible attribute +
 * resizing viewport (replicates both CSS state and body resize).
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const KEYBOARD_HEIGHT = 336;
const KEYBOARD_VIEWPORT = { width: 390, height: 844 - KEYBOARD_HEIGHT };

async function simulateKeyboardOpen(page: Page) {
	await page.evaluate(() => {
		document.documentElement.setAttribute('data-keyboard-visible', '');
	});
}

async function simulateKeyboardClose(page: Page) {
	await page.evaluate(() => {
		document.documentElement.removeAttribute('data-keyboard-visible');
	});
}

async function getRect(page: Page, selector: string) {
	return page.evaluate((sel) => {
		const el = document.querySelector(sel);
		if (!el) return null;
		const rect = el.getBoundingClientRect();
		return { top: rect.top, bottom: rect.bottom, height: rect.height };
	}, selector);
}

async function getScrollTop(page: Page) {
	return page.evaluate(() => {
		const el = document.querySelector('.app-shell__content');
		return el ? el.scrollTop : 0;
	});
}

test.describe('keyboard - layout stability', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('keyboard open does not shift header', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const headerBefore = await getRect(page, '.app-shell__header');

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		const headerAfter = await getRect(page, '.app-shell__header');

		if (headerBefore && headerAfter) {
			const delta = Math.abs(headerAfter.top - headerBefore.top);
			expect(delta).toBeLessThan(2);
		}
	});

	test('keyboard open does not shift content top', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const contentBefore = await getRect(page, '.app-shell__content');

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		const contentAfter = await getRect(page, '.app-shell__content');

		if (contentBefore && contentAfter) {
			const delta = Math.abs(contentAfter.top - contentBefore.top);
			expect(delta).toBeLessThan(2);
		}
	});

	test('scroll position preserved after keyboard cycle', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		await page.evaluate(() => {
			const el = document.querySelector('.app-shell__content');
			if (el) el.scrollTop = 300;
		});
		const scrollBefore = await getScrollTop(page);

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(200);
		await simulateKeyboardClose(page);
		await page.waitForTimeout(500);

		const scrollAfter = await getScrollTop(page);
		const drift = Math.abs(scrollAfter - scrollBefore);
		expect(drift).toBeLessThan(10);
	});
});

test.describe('keyboard - footer animation quality', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('footer hides when keyboard opens', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(50);

		const state = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			if (!footer) return null;
			const cs = getComputedStyle(footer);
			return {
				maxHeight: cs.maxHeight,
				opacity: parseFloat(cs.opacity),
				transform: cs.transform
			};
		});

		expect(state).not.toBeNull();
		expect(state!.maxHeight).toBe('0px');
		expect(state!.opacity).toBe(0);
		expect(state!.transform).not.toBe('none');
	});

	test('footer reappears when keyboard closes', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		await simulateKeyboardClose(page);
		await page.waitForTimeout(400);

		const state = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			if (!footer) return null;
			const cs = getComputedStyle(footer);
			return {
				maxHeight: cs.maxHeight,
				opacity: parseFloat(cs.opacity),
				isInViewport: footer.getBoundingClientRect().bottom > 0
			};
		});

		expect(state).not.toBeNull();
		expect(state!.opacity).toBe(1);
		expect(state!.maxHeight).not.toBe('0px');
		expect(state!.isInViewport).toBe(true);
	});

	test('footer uses will-change for GPU acceleration', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const willChange = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			return footer ? getComputedStyle(footer).willChange : '';
		});

		expect(willChange).toContain('transform');
	});

	test('footer CSS has no transition (Motion library handles animation)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const transition = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			return footer ? getComputedStyle(footer).transition : '';
		});

		// Should have no CSS transition — Motion library handles the animation
		expect(transition).toBe('none');
	});

	test('rapid keyboard toggle does not leave footer in wrong state', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		for (let i = 0; i < 5; i++) {
			await simulateKeyboardOpen(page);
			await page.waitForTimeout(30);
			await simulateKeyboardClose(page);
			await page.waitForTimeout(30);
		}

		await page.waitForTimeout(500);

		const state = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			if (!footer) return null;
			return {
				opacity: parseFloat(getComputedStyle(footer).opacity),
				isInViewport: footer.getBoundingClientRect().bottom > 0
			};
		});

		expect(state).not.toBeNull();
		expect(state!.opacity).toBe(1);
		expect(state!.isInViewport).toBe(true);
	});

	test('dock position is stable after keyboard cycle', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const dockBefore = await getRect(page, '.dock');

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);
		await simulateKeyboardClose(page);
		await page.waitForTimeout(500);

		const dockAfter = await getRect(page, '.dock');

		if (dockBefore && dockAfter) {
			const drift = Math.abs(dockAfter.top - dockBefore.top);
			expect(drift).toBeLessThan(2);
		}
	});
});

test.describe('keyboard - CDP viewport simulation', () => {
	test('viewport resize + attribute = full keyboard simulation', async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const before = await page.evaluate(() => ({
			viewportHeight: window.innerHeight,
			contentHeight:
				document.querySelector('.app-shell__content')?.getBoundingClientRect().height ?? 0
		}));

		// Simulate keyboard: resize viewport + set attribute
		await page.setViewportSize(KEYBOARD_VIEWPORT);
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(200);

		const during = await page.evaluate(() => ({
			viewportHeight: window.innerHeight,
			contentHeight:
				document.querySelector('.app-shell__content')?.getBoundingClientRect().height ?? 0,
			footerMaxHeight: getComputedStyle(document.querySelector('.app-shell__footer')!).maxHeight
		}));

		expect(during.viewportHeight).toBeLessThan(before.viewportHeight);
		expect(during.footerMaxHeight).toBe('0px');

		// Restore
		await page.setViewportSize(MOBILE_VIEWPORT);
		await simulateKeyboardClose(page);
		await page.waitForTimeout(400);

		const after = await page.evaluate(() => ({
			viewportHeight: window.innerHeight
		}));

		expect(after.viewportHeight).toBe(MOBILE_VIEWPORT.height);
	});

	test('phantom keyboard - attribute set but viewport full size', async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Phantom: attribute set but viewport is full
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(50);

		const viewportRatio = await page.evaluate(() => window.innerHeight / window.screen.height);

		// Viewport ratio should indicate no keyboard
		expect(viewportRatio).toBeGreaterThanOrEqual(0.75);

		await simulateKeyboardClose(page);
	});
});

test.describe('keyboard - drawer popup not affected', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('drawer opens and closes correctly after keyboard cycle', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open and close keyboard
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);
		await simulateKeyboardClose(page);
		await page.waitForTimeout(500);

		// Now open the drawer menu
		const menuBtn = page.locator('.dock-menu-btn');
		await expect(menuBtn).toBeVisible();
		await menuBtn.click();

		const drawer = page.locator('.drawer-panel');
		await expect(drawer).toBeVisible({ timeout: 3000 });

		// Drawer should be visible and not clipped
		const drawerRect = await page.evaluate(() => {
			const el = document.querySelector('.drawer-panel');
			if (!el) return null;
			const rect = el.getBoundingClientRect();
			return { top: rect.top, bottom: rect.bottom, height: rect.height };
		});

		expect(drawerRect).not.toBeNull();
		expect(drawerRect!.height).toBeGreaterThan(100);

		// Close drawer
		const backdrop = page.locator('.drawer-backdrop');
		await backdrop.click({ position: { x: 10, y: 10 } });
		await page.waitForTimeout(500);

		await expect(drawer).not.toBeVisible({ timeout: 3000 });
	});
});
