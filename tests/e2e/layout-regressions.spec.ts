import { expect, test, type Page } from '@playwright/test';

/**
 * Layout Regression E2E Tests
 *
 * Comprehensive tests for all drawers/modals in the app to catch:
 * 1. Double scrollbar issues (drawer content + inner scroll)
 * 2. Scroll lock not working (page scrolls behind drawer)
 * 3. Content overflow behind drawer overlay
 */

async function mockServiceEvents(page: Page) {
	await page.route('**/api/v1/events**', async (route) => {
		const url = route.request().url();
		if (route.request().method() !== 'GET' || !url.includes('kinds')) {
			await route.continue();
			return;
		}
		const requestUrl = new URL(url);
		const rawKinds = requestUrl.searchParams
			.getAll('kinds')
			.concat(requestUrl.searchParams.getAll('kinds[]'));
		const isService = rawKinds.some((k) => k.includes('30402'));
		if (!isService) {
			await route.continue();
			return;
		}
		const events = Array.from({ length: 5 }, (_, i) => ({
			id: `drawer-test-${i}`,
			pubkey: 'a'.repeat(64),
			created_at: 1_700_000_000 - i * 100,
			kind: 30402,
			tags: [
				['d', `drawer-svc-${i}`],
				['title', `Drawer Test Service ${i}`],
				['s', 'active']
			],
			content: JSON.stringify({
				uniqueId: `drawer-svc-${i}`,
				status: 'active',
				title: `Drawer Test Service ${i}`,
				description: `Description ${i}`,
				serviceLocationTypes: ['remote'],
				locationDetails: {},
				pricing: { type: 'FIXED', amount: 100, currency: 'USD' },
				skills: ['Design'],
				categories: [{ id: 'cat', name: 'Design', slug: 'design' }],
				portfolio: [],
				creator: { username: `user-${i}`, avatar: '' },
				createdAt: 1_700_000_000 - i * 100
			}),
			sig: 'b'.repeat(128)
		}));
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});
	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: [] })
		});
	});
}

async function mockTaskEvents(page: Page) {
	await page.route('**/api/v1/events**', async (route) => {
		const url = route.request().url();
		if (route.request().method() !== 'GET' || !url.includes('kinds')) {
			await route.continue();
			return;
		}
		const requestUrl = new URL(url);
		const rawKinds = requestUrl.searchParams
			.getAll('kinds')
			.concat(requestUrl.searchParams.getAll('kinds[]'));
		const isTask = rawKinds.some((k) => k.includes('31000'));
		if (!isTask) {
			await route.continue();
			return;
		}
		const events = Array.from({ length: 5 }, (_, i) => ({
			id: `drawer-task-${i}`,
			pubkey: 'd'.repeat(64),
			created_at: 1_700_000_000 - i * 100,
			kind: 31000,
			tags: [['d', `drawer-task-${i}`], ['title', `Drawer Test Task ${i}`]],
			content: JSON.stringify({
				title: `Drawer Test Task ${i}`,
				description: `Description ${i}`,
				status: 'OPEN',
				budget: { amount: 100, currency: 'USD' },
				attachments: [],
				deadline: '2030-01-01T00:00:00.000Z',
				categories: [{ id: 'cat', name: 'Development', slug: 'development' }],
				skills: ['Development']
			}),
			sig: 'e'.repeat(128)
		}));
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});
	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: [] })
		});
	});
}

/**
 * Helper: check if a drawer has double scrollbars
 * A drawer should have exactly ONE scrollable area (the .drawer-scroll-area)
 * If the drawer panel itself is also scrollable, that's a double scrollbar.
 */
async function checkDrawerScrollbar(page: Page, drawerSelector: string): Promise<{
	hasDoubleScrollbar: boolean;
	panelOverflow: string;
	contentOverflow: string;
	contentScrollHeight: number;
	contentClientHeight: number;
}> {
	return page.evaluate((sel) => {
		const drawer = document.querySelector(sel);
		if (!drawer) {
			return {
				hasDoubleScrollbar: false,
				panelOverflow: 'not found',
				contentOverflow: 'not found',
				contentScrollHeight: 0,
				contentClientHeight: 0
			};
		}

		const panelCs = getComputedStyle(drawer);
		const scrollArea = drawer.querySelector('.drawer-scroll-area');
		const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;

		const panelScrollable =
			panelCs.overflowY === 'auto' || panelCs.overflowY === 'scroll';
		const contentScrollable =
			scrollAreaCs &&
			(scrollAreaCs.overflowY === 'auto' || scrollAreaCs.overflowY === 'scroll');

		return {
			hasDoubleScrollbar: panelScrollable && !!contentScrollable,
			panelOverflow: panelCs.overflowY,
			contentOverflow: scrollAreaCs?.overflowY ?? 'not found',
			contentScrollHeight: scrollArea?.scrollHeight ?? 0,
			contentClientHeight: scrollArea?.clientHeight ?? 0
		};
	}, drawerSelector);
}

test.describe('Layout Regressions — Drawers & Scroll Lock', () => {
	test.describe('Services page drawers (375px mobile)', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('filter drawer: no double scrollbar, scroll lock works', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Open filter drawer
			const filterButton = page.getByRole('button', { name: /filter/i }).first();
			await filterButton.click();
			await page.waitForTimeout(500);

			// Drawer overlay should be visible
			const drawerOverlay = page.locator('.fixed.inset-0.z-60');
			await expect(drawerOverlay.first()).toBeVisible({ timeout: 3000 });

			// Scroll lock: app-shell__content overflowY should be hidden
			const lockedOverflow = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				return el ? el.style.overflowY : null;
			});
			expect(lockedOverflow).toBe('hidden');

			// No double scrollbar on the drawer panel
			const drawerPanel = page.locator('[role="dialog"]').first();
			const hasDouble = await drawerPanel.evaluate((el) => {
				const cs = getComputedStyle(el);
				const scrollArea = el.querySelector('.drawer-scroll-area');
				const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;
				const panelScrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll';
				const contentScrollable =
					scrollAreaCs &&
					(scrollAreaCs.overflowY === 'auto' || scrollAreaCs.overflowY === 'scroll');
				return panelScrollable && !!contentScrollable;
			});
			expect(hasDouble).toBe(false);

			// Close drawer
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);

			// Scroll lock released
			const restoredOverflow = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				return el ? el.style.overflowY : null;
			});
			expect(restoredOverflow).not.toBe('hidden');
		});

		test('services page: no scrollbar when content fits viewport', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const scrollInfo = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				if (!el) return null;
				return {
					overflowY: getComputedStyle(el).overflowY,
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight
				};
			});

			expect(scrollInfo).not.toBeNull();
			expect(scrollInfo!.overflowY).toBe('auto');
		});
	});

	test.describe('Tasks page drawers (375px mobile)', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('tasks filter drawer: no double scrollbar, scroll lock works', async ({ page }) => {
			await mockTaskEvents(page);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Open filter drawer
			const filterButton = page.getByRole('button', { name: /filter/i }).first();
			if (await filterButton.isVisible()) {
				await filterButton.click();
				await page.waitForTimeout(500);

				// Scroll lock should be active
				const lockedOverflow = await page.evaluate(() => {
					const el = document.querySelector('.app-shell__content');
					return el ? el.style.overflowY : null;
				});
				expect(lockedOverflow).toBe('hidden');

				// No double scrollbar
				const drawerPanel = page.locator('[role="dialog"]').first();
				if (await drawerPanel.isVisible()) {
					const hasDouble = await drawerPanel.evaluate((el) => {
						const cs = getComputedStyle(el);
						const scrollArea = el.querySelector('.drawer-scroll-area');
						const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;
						const panelScrollable =
							cs.overflowY === 'auto' || cs.overflowY === 'scroll';
						const contentScrollable =
							scrollAreaCs &&
							(scrollAreaCs.overflowY === 'auto' || scrollAreaCs.overflowY === 'scroll');
						return panelScrollable && !!contentScrollable;
					});
					expect(hasDouble).toBe(false);
				}

				// Close drawer
				await page.keyboard.press('Escape');
				await page.waitForTimeout(500);
			}
		});

		test('tasks bid drawer: no double scrollbar', async ({ page }) => {
			await mockTaskEvents(page);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Click on a task card to open bid drawer
			const firstCard = page.locator('[data-task-id]').first();
			await firstCard.click();
			await page.waitForTimeout(500);

			// Check if a drawer opened
			const drawerPanel = page.locator('[role="dialog"]').first();
			if (await drawerPanel.isVisible()) {
				// No double scrollbar
				const hasDouble = await drawerPanel.evaluate((el) => {
					const cs = getComputedStyle(el);
					const scrollArea = el.querySelector('.drawer-scroll-area');
					const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;
					const panelScrollable =
						cs.overflowY === 'auto' || cs.overflowY === 'scroll';
					const contentScrollable =
						scrollAreaCs &&
						(scrollAreaCs.overflowY === 'auto' || scrollAreaCs.overflowY === 'scroll');
					return panelScrollable && !!contentScrollable;
				});
				expect(hasDouble).toBe(false);

				// Drawer content should be scrollable if it overflows
				const contentInfo = await drawerPanel.evaluate((el) => {
					const scrollArea = el.querySelector('.drawer-scroll-area');
					if (!scrollArea) return null;
					return {
						scrollHeight: scrollArea.scrollHeight,
						clientHeight: scrollArea.clientHeight,
						overflowY: getComputedStyle(scrollArea).overflowY
					};
				});

				if (contentInfo && contentInfo.scrollHeight > contentInfo.clientHeight) {
					// Content overflows — scroll area should have overflow-y: auto
					expect(contentInfo.overflowY).toBe('auto');
				}

				// Close drawer
				await page.keyboard.press('Escape');
				await page.waitForTimeout(500);
			}
		});
	});

	test.describe('Desktop drawer behavior (1440px)', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('services filter drawer: scroll lock prevents page scroll', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Scroll page down first
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, 300));
			await page.waitForTimeout(200);

			const scrollBefore = await scrollContainer.evaluate((el) => el.scrollTop);

			// Open filter drawer
			const filterButton = page.getByRole('button', { name: /filter/i }).first();
			await filterButton.click();
			await page.waitForTimeout(500);

			// Scroll lock should be active
			const lockedOverflow = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				return el ? el.style.overflowY : null;
			});
			expect(lockedOverflow).toBe('hidden');

			// No scrollbar visible behind drawer
			const hasScrollbar = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				if (!el) return false;
				return el.scrollHeight > el.clientHeight && getComputedStyle(el).overflowY !== 'hidden';
			});
			expect(hasScrollbar).toBe(false);

			// Close drawer
			await page.keyboard.press('Escape');
			await page.waitForTimeout(500);

			// Scroll position should be preserved
			const scrollAfter = await scrollContainer.evaluate((el) => el.scrollTop);
			expect(scrollAfter).toBe(scrollBefore);
		});

		test('drawer content area has single scrollbar, not double', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Open filter drawer (uses Drawer component with isScrollable=true)
			const filterButton = page.getByRole('button', { name: /filter/i }).first();
			await filterButton.click();
			await page.waitForTimeout(500);

			// Check the drawer panel and content area
			const drawerInfo = await page.evaluate(() => {
				const panel = document.querySelector('[role="dialog"]');
				if (!panel) return null;

				const panelCs = getComputedStyle(panel);
				const scrollArea = panel.querySelector('.drawer-scroll-area');
				const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;

				// Check if panel itself is scrollable (it shouldn't be — overflow-hidden)
				const panelScrollable =
					panel.scrollHeight > panel.clientHeight &&
					(panelCs.overflowY === 'auto' || panelCs.overflowY === 'scroll');

				// Check if content area is scrollable
				const contentScrollable = scrollArea
					? scrollArea.scrollHeight > scrollArea.clientHeight
					: false;

				return {
					panelOverflow: panelCs.overflowY,
					panelScrollable,
					contentOverflow: scrollAreaCs?.overflowY ?? 'not found',
					contentScrollable,
					panelScrollHeight: panel.scrollHeight,
					panelClientHeight: panel.clientHeight,
					contentScrollHeight: scrollArea?.scrollHeight ?? 0,
					contentClientHeight: scrollArea?.clientHeight ?? 0
				};
			});

			expect(drawerInfo).not.toBeNull();

			// Panel should have overflow: hidden (not scrollable)
			expect(drawerInfo!.panelOverflow).toBe('hidden');
			expect(drawerInfo!.panelScrollable).toBe(false);

			// Content area should have overflow-y: auto
			expect(drawerInfo!.contentOverflow).toBe('auto');

			// Close drawer
			await page.keyboard.press('Escape');
		});

		test('tasks bid drawer: no double scrollbar', async ({ page }) => {
			await mockTaskEvents(page);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');
			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Click on a task card to open details drawer
			const firstCard = page.locator('[data-task-id]').first();
			await firstCard.click();
			await page.waitForTimeout(1000);

			const drawerPanel = page.locator('[role="dialog"]').first();
			if (await drawerPanel.isVisible()) {
				const drawerInfo = await drawerPanel.evaluate((el) => {
					const cs = getComputedStyle(el);
					const scrollArea = el.querySelector('.drawer-scroll-area');
					const scrollAreaCs = scrollArea ? getComputedStyle(scrollArea) : null;

					// Panel should be overflow-hidden, NOT scrollable
					const panelScrollable =
						el.scrollHeight > el.clientHeight &&
						(cs.overflowY === 'auto' || cs.overflowY === 'scroll');

					return {
						panelOverflow: cs.overflowY,
						panelScrollable,
						contentOverflow: scrollAreaCs?.overflowY ?? 'not found',
						hasFooter: !!el.querySelector('.drawer-footer')
					};
				});

				// Panel MUST be overflow-hidden
				expect(drawerInfo.panelOverflow).toBe('hidden');
				expect(drawerInfo.panelScrollable).toBe(false);

				// If the drawer has a scroll area, it should be overflow-y: auto
				if (drawerInfo.contentOverflow !== 'not found') {
					expect(drawerInfo.contentOverflow).toBe('auto');
				}

				await page.keyboard.press('Escape');
			}
		});
	});
});
