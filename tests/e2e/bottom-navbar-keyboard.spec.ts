import { expect, test, type Page } from '@playwright/test';

/**
 * Bottom Navbar + Keyboard Interaction E2E Tests
 *
 * Tests the show/hide behavior of the bottom navigation bar when the
 * virtual keyboard opens and closes on mobile.
 *
 * Since Playwright cannot trigger real Capacitor keyboard events, we simulate
 * by toggling `data-keyboard-visible` on <html> (matching keyboard.ts behavior).
 *
 * These tests document the current "junkiness" and will serve as regression
 * tests after the motion-based animation fix is implemented.
 *
 * Key issues being tested:
 * 1. Footer hide is instant (transition: none) — feels abrupt
 * 2. Footer show uses only max-height transition — opacity/transform have no transition
 * 3. The asymmetry creates a visual "pop" when footer reappears
 * 4. No GPU-accelerated animation (transform not transitioned on show)
 * 5. No coordinated timing with keyboard animation
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };

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

/**
 * Measure the rendered state of the footer dock
 */
async function measureDockState(page: Page) {
	return page.evaluate(() => {
		const footer = document.querySelector('.app-shell__footer');
		const dock = document.querySelector('.app-shell__footer .dock');
		if (!footer || !dock) return null;

		const footerCs = getComputedStyle(footer);
		const dockCs = getComputedStyle(dock);
		const footerRect = footer.getBoundingClientRect();
		const dockRect = dock.getBoundingClientRect();

		return {
			footer: {
				maxHeight: footerCs.maxHeight,
				opacity: parseFloat(footerCs.opacity),
				transform: footerCs.transform,
				transition: footerCs.transition,
				offsetHeight: footer.offsetHeight,
				rectTop: footerRect.top,
				rectBottom: footerRect.bottom,
				rectHeight: footerRect.height,
				isInViewport: footerRect.bottom > 0 && footerRect.top < window.innerHeight
			},
			dock: {
				offsetHeight: dock.offsetHeight,
				rectTop: dockRect.top,
				rectBottom: dockRect.bottom,
				rectHeight: dockRect.height,
				visible: dockCs.display !== 'none' && dockCs.visibility !== 'hidden'
			},
			viewportHeight: window.innerHeight
		};
	});
}

test.describe('bottom navbar keyboard hide/show', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('dock is visible before keyboard opens', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const dock = page.locator('.app-shell__footer .dock');
		await expect(dock).toBeVisible();

		const state = await measureDockState(page);
		expect(state).not.toBeNull();
		expect(state!.dock.visible).toBe(true);
		expect(state!.footer.opacity).toBe(1);
		expect(state!.footer.isInViewport).toBe(true);
	});

	test('dock hides when keyboard opens (data-keyboard-visible)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		await simulateKeyboardOpen(page);
		await page.waitForTimeout(50);

		const state = await measureDockState(page);
		expect(state).not.toBeNull();

		// Footer should be collapsed
		expect(state!.footer.maxHeight).toBe('0px');
		expect(state!.footer.opacity).toBe(0);
		// Should have translateY(100%) to slide out
		expect(state!.footer.transform).not.toBe('none');

		// Dock should not be in viewport
		expect(state!.footer.isInViewport).toBe(false);
	});

	test('dock reappears when keyboard closes', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open keyboard
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		// Verify hidden
		const stateHidden = await measureDockState(page);
		expect(stateHidden!.footer.maxHeight).toBe('0px');

		// Close keyboard
		await simulateKeyboardClose(page);
		await page.waitForTimeout(400); // Wait for transition to complete

		const stateVisible = await measureDockState(page);
		expect(stateVisible).not.toBeNull();
		expect(stateVisible!.footer.opacity).toBe(1);
		expect(stateVisible!.footer.maxHeight).not.toBe('0px');
		expect(stateVisible!.footer.isInViewport).toBe(true);
	});

	test('footer has no CSS transition (Motion library handles animation)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const transition = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			if (!footer) return '';
			return getComputedStyle(footer).transition;
		});

		// Footer has no CSS transition — Motion library drives the animation
		expect(transition).toBe('none');

		await simulateKeyboardClose(page);
	});

	test('footer does NOT use will-change (would trap drawer overlay)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const willChange = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			if (!footer) return '';
			return getComputedStyle(footer).willChange;
		});

		// will-change:transform creates a containing block that traps position:fixed
		// descendants (the drawer overlay). Must NOT be present.
		expect(willChange).not.toContain('transform');
	});

	test('rapid keyboard open/close does not leave footer in wrong state', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Rapid toggle
		for (let i = 0; i < 5; i++) {
			await simulateKeyboardOpen(page);
			await page.waitForTimeout(30);
			await simulateKeyboardClose(page);
			await page.waitForTimeout(30);
		}

		// After rapid toggle, settle
		await page.waitForTimeout(500);

		const state = await measureDockState(page);
		expect(state).not.toBeNull();

		// Footer should be in the correct final state (visible, since keyboard is closed)
		expect(state!.footer.opacity).toBe(1);
		expect(state!.footer.maxHeight).not.toBe('0px');
		expect(state!.footer.isInViewport).toBe(true);
	});

	test('navbar position is stable during keyboard toggle (no jump)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Measure dock position before
		const beforeState = await measureDockState(page);
		const dockTopBefore = beforeState!.dock.rectTop;

		// Open keyboard
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		// Close keyboard
		await simulateKeyboardClose(page);
		await page.waitForTimeout(500);

		// Measure dock position after
		const afterState = await measureDockState(page);
		const dockTopAfter = afterState!.dock.rectTop;

		const positionDrift = Math.abs(dockTopAfter - dockTopBefore);
		console.log(`[Navbar+KB] Dock position drift after keyboard cycle: ${positionDrift}px`);

		// Dock should return to exactly the same position
		expect(positionDrift).toBeLessThan(2);
	});

	test('content does not jump when footer hides/shows', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Measure content area before
		const contentBefore = await page.evaluate(() => {
			const el = document.querySelector('.app-shell__content');
			if (!el) return null;
			return {
				height: el.getBoundingClientRect().height,
				scrollHeight: el.scrollHeight
			};
		});

		// Open keyboard (footer hides, content should grow)
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(200);

		const contentDuring = await page.evaluate(() => {
			const el = document.querySelector('.app-shell__content');
			if (!el) return null;
			return {
				height: el.getBoundingClientRect().height,
				scrollHeight: el.scrollHeight
			};
		});

		// Close keyboard (footer shows, content should shrink)
		await simulateKeyboardClose(page);
		await page.waitForTimeout(400);

		const contentAfter = await page.evaluate(() => {
			const el = document.querySelector('.app-shell__content');
			if (!el) return null;
			return {
				height: el.getBoundingClientRect().height,
				scrollHeight: el.scrollHeight
			};
		});

		console.log('[Navbar+KB] Content heights:', { contentBefore, contentDuring, contentAfter });

		if (contentBefore && contentDuring && contentAfter) {
			// When footer hides, content should gain height
			const heightGain = contentDuring.height - contentBefore.height;
			console.log(`[Navbar+KB] Content height gain when footer hides: ${heightGain}px`);
			// Height gain should approximate footer height (~64px + safe area)
			expect(heightGain).toBeGreaterThan(0);

			// After keyboard close, content should return to original height
			const heightDrift = Math.abs(contentAfter.height - contentBefore.height);
			expect(heightDrift).toBeLessThan(5);
		}
	});
});

test.describe('bottom navbar keyboard - animation quality', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('footer uses will-change for GPU acceleration', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const willChange = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			return footer ? getComputedStyle(footer).willChange : '';
		});

		// After fix: should include transform for GPU acceleration
		expect(willChange).toContain('transform');
	});

	test('footer uses transform for slide animation (not just max-height)', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open keyboard and check if transform is used
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(50);

		const transformOnHide = await page.evaluate(() => {
			const footer = document.querySelector('.app-shell__footer');
			return footer ? getComputedStyle(footer).transform : '';
		});

		console.log(`[Navbar+KB] Footer transform on hide: ${transformOnHide}`);

		// Current: uses translateY(100%) — this IS GPU-accelerated (good)
		// But the transition: none prevents smooth animation
		expect(transformOnHide).not.toBe('none');

		await simulateKeyboardClose(page);
	});

	test('prefers-reduced-motion is respected', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open/close keyboard with reduced motion
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);

		const stateHidden = await measureDockState(page);
		expect(stateHidden!.footer.maxHeight).toBe('0px');

		await simulateKeyboardClose(page);
		await page.waitForTimeout(200);

		const stateVisible = await measureDockState(page);
		expect(stateVisible!.footer.isInViewport).toBe(true);
	});
});

test.describe('bottom navbar drawer z-order', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('menu button opens drawer popup', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		const menuBtn = page.locator('.dock-menu-btn');
		await expect(menuBtn).toBeVisible();
		await menuBtn.click();

		const drawer = page.locator('.drawer-panel');
		await expect(drawer).toBeVisible({ timeout: 3000 });

		const gridItems = page.locator('.nav-grid-item');
		const count = await gridItems.count();
		expect(count).toBeGreaterThan(0);
	});

	test('drawer backdrop does NOT cover the dock', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open drawer
		const menuBtn = page.locator('.dock-menu-btn');
		await menuBtn.click();
		await page.waitForTimeout(600);

		const backdrop = page.locator('.drawer-backdrop');
		await expect(backdrop).toBeVisible();

		// Get the dock's position and z-index
		const dockInfo = await page.evaluate(() => {
			const dock = document.querySelector('.dock');
			const backdrop = document.querySelector('.drawer-backdrop');
			if (!dock || !backdrop) return null;
			const dockRect = dock.getBoundingClientRect();
			const backdropRect = backdrop.getBoundingClientRect();
			const dockZ = parseInt(getComputedStyle(dock).zIndex || '0', 10);
			const backdropZ = parseInt(getComputedStyle(backdrop).zIndex || '0', 10);
			return {
				dockBottom: dockRect.bottom,
				dockTop: dockRect.top,
				backdropBottom: backdropRect.bottom,
				dockZ,
				backdropZ
			};
		});

		expect(dockInfo).not.toBeNull();

		// The dock should be ABOVE the backdrop in z-order
		expect(dockInfo!.dockZ).toBeGreaterThan(dockInfo!.backdropZ);

		// Close drawer
		const drawerBackdrop = page.locator('.drawer-backdrop');
		await drawerBackdrop.click({ position: { x: 10, y: 10 } });
		await page.waitForTimeout(500);
	});

	test('dock buttons remain clickable when drawer is open', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open drawer
		const menuBtn = page.locator('.dock-menu-btn');
		await menuBtn.click();
		await page.waitForTimeout(600);

		// Try to click a dock icon (e.g. Home)
		const homeIcon = page.locator('.dock .dock-link').first();
		await expect(homeIcon).toBeVisible();

		// The click should succeed (not be intercepted by the drawer overlay)
		await homeIcon.click({ timeout: 3000 });

		// Drawer should close after navigation
		await page.waitForTimeout(1000);
		const drawer = page.locator('.drawer-panel');
		await expect(drawer).not.toBeVisible({ timeout: 3000 });
	});

	test('drawer popup works after keyboard cycle', async ({ page }) => {
		await page.goto('/tasks', { waitUntil: 'domcontentloaded' });
		await page.waitForTimeout(2000);

		// Open and close keyboard
		await simulateKeyboardOpen(page);
		await page.waitForTimeout(100);
		await simulateKeyboardClose(page);
		await page.waitForTimeout(500);

		// Open drawer
		const menuBtn = page.locator('.dock-menu-btn');
		await expect(menuBtn).toBeVisible();
		await menuBtn.click();

		const drawer = page.locator('.drawer-panel');
		await expect(drawer).toBeVisible({ timeout: 3000 });

		// Close drawer
		const backdrop = page.locator('.drawer-backdrop');
		await backdrop.click({ position: { x: 10, y: 10 } });
		await page.waitForTimeout(500);

		await expect(drawer).not.toBeVisible({ timeout: 3000 });
	});
});
