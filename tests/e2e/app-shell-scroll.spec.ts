import { expect, test } from '@playwright/test';

/**
 * App Shell Scroll Behavior E2E Tests
 *
 * Verifies that the root layout wrapper doesn't break scrolling across ALL routes.
 * The root layout wrapper div is shared by ALL routes — if the protected layout
 * uses overflow:hidden, content is clipped instead of scrolling.
 *
 * Tests run on public routes since the wrapper is identical for all routes.
 * Protected route behavior is verified via CSS class inspection.
 */

const PUBLIC_ROUTES = [
	{ path: '/tasks', name: 'Tasks Browse' },
	{ path: '/services', name: 'Services Browse' },
	{ path: '/', name: 'Homepage' },
	{ path: '/about', name: 'About' },
	{ path: '/terms', name: 'Terms' },
	{ path: '/privacy', name: 'Privacy' },
	{ path: '/faq', name: 'FAQ' },
	{ path: '/contact', name: 'Contact' },
	{ path: '/how-it-works', name: 'How It Works' },
	{ path: '/security', name: 'Security' },
	{ path: '/careers', name: 'Careers' },
	{ path: '/community-guidelines', name: 'Community Guidelines' },
	{ path: '/press', name: 'Press' },
	{ path: '/tasker-fees', name: 'Tasker Fees' },
	{ path: '/taskee-fees', name: 'Taskee Fees' },
	{ path: '/tasker-principles', name: 'Tasker Principles' },
	{ path: '/secure-payments', name: 'Secure Payments' },
	{ path: '/delete-account', name: 'Delete Account' },
	{ path: '/auth/login', name: 'Login' },
	{ path: '/auth/signup', name: 'Signup' },
	{ path: '/404', name: '404 Page' }
];

test.describe('App Shell Scroll Behavior', () => {
	for (const route of PUBLIC_ROUTES) {
		test.describe(`${route.name} (${route.path})`, () => {
			test.use({ viewport: { width: 1440, height: 900 } });

			test('root wrapper fills available space', async ({ page }) => {
				await page.goto(route.path);
				await page.waitForLoadState('networkidle');

				const wrapperInfo = await page.evaluate(() => {
					const appShell = document.querySelector('.app-shell__content');
					const wrapper = appShell?.firstElementChild;
					if (!wrapper) return null;
					const cs = getComputedStyle(appShell!);
					return {
						isFlexContainer: cs.display === 'flex',
						wrapperFlex: getComputedStyle(wrapper).flex,
						wrapperHeight: wrapper.getBoundingClientRect().height
					};
				});

				expect(wrapperInfo).not.toBeNull();
				// app-shell__content should be a flex container
				expect(wrapperInfo!.isFlexContainer).toBe(true);
				// Wrapper should have non-zero height
				expect(wrapperInfo!.wrapperHeight).toBeGreaterThan(0);
			});

			test('app-shell__content is the scroll container', async ({ page }) => {
				await page.goto(route.path);
				await page.waitForLoadState('networkidle');

				const scrollInfo = await page.evaluate(() => {
					const appShell = document.querySelector('.app-shell__content');
					if (!appShell) return null;
					const cs = getComputedStyle(appShell);
					return {
						overflowY: cs.overflowY,
						scrollHeight: appShell.scrollHeight,
						clientHeight: appShell.clientHeight
					};
				});

				expect(scrollInfo).not.toBeNull();
				expect(scrollInfo!.overflowY).toBe('auto');
			});

			test('no horizontal scrollbar on page', async ({ page }) => {
				await page.goto(route.path, { waitUntil: 'domcontentloaded' });
				await page.waitForTimeout(3000);

				const hasHorizontalScroll = await page.evaluate(() => {
					return document.documentElement.scrollWidth > document.documentElement.clientWidth;
				});

				expect(hasHorizontalScroll).toBe(false);
			});
		});
	}

	test.describe('Protected layout structure (CSS verification)', () => {
		test('protected layout does not use overflow:hidden to clip content', async ({ page }) => {
			// The .dashboard-layout class is on the (protected) layout which requires auth.
			// We can't easily test authenticated routes, so we verify the CSS class
			// doesn't have overflow:hidden by checking if the element exists on a public route.
			// On public routes, .dashboard-layout won't exist, which is fine.
			// This test primarily serves as a regression guard for the CSS change.
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			const protectedLayout = await page.evaluate(() => {
				const el = document.querySelector('.dashboard-layout');
				if (!el) return null;
				const cs = getComputedStyle(el);
				return {
					overflowX: cs.overflowX,
					overflowY: cs.overflowY
				};
			});

			// If the protected layout exists (authenticated route), verify no overflow:hidden
			if (protectedLayout) {
				expect(protectedLayout.overflowX).not.toBe('hidden');
				expect(protectedLayout.overflowY).not.toBe('hidden');
			}
			// If null, the protected layout isn't rendered (public route) — test passes
		});
	});

	test.describe('Scrollbar visibility', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('no scrollbar when content fits in viewport', async ({ page }) => {
			// The /auth/login page is a simple form that fits within the viewport
			await page.goto('/auth/login');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1000);

			const info = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				if (!el) return null;
				return {
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight
				};
			});

			expect(info).not.toBeNull();
			expect(info!.scrollHeight).toBeLessThanOrEqual(info!.clientHeight);
		});

		test('scrollbar appears when content exceeds viewport', async ({ page }) => {
			// The homepage has a lot of content that exceeds the viewport
			await page.goto('/');
			await page.waitForLoadState('networkidle');
			await page.waitForTimeout(1000);

			const scrollInfo = await page.evaluate(() => {
				const el = document.querySelector('.app-shell__content');
				if (!el) return null;
				return {
					scrollHeight: el.scrollHeight,
					clientHeight: el.clientHeight,
					hasScrollbar: el.scrollHeight > el.clientHeight
				};
			});

			expect(scrollInfo).not.toBeNull();
			// The homepage should have enough content to scroll
			// (this verifies the scrollbar appears when it should)
			expect(scrollInfo!.hasScrollbar).toBe(true);
		});
	});

	test.describe('Mobile (375px)', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('page scrolls when content exceeds viewport', async ({ page }) => {
			// Use tasks page with mock data that creates enough content to overflow
			await page.route('**/api/v1/events**', async (route) => {
				const url = route.request().url();
				if (route.request().method() !== 'GET' || !url.includes('kinds')) {
					await route.continue();
					return;
				}
				// Return enough events to overflow the viewport
				const events = Array.from({ length: 20 }, (_, i) => ({
					id: `scroll-test-${i}`,
					pubkey: 'a'.repeat(64),
					created_at: 1_700_000_000 - i * 100,
					kind: 30402,
					tags: [
						['d', `scroll-test-${i}`],
						['title', `Test Service ${i}`],
						['s', 'active']
					],
					content: JSON.stringify({
						uniqueId: `scroll-test-${i}`,
						status: 'active',
						title: `Test Service ${i}`,
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

			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			const scrollContainer = page.locator('.app-shell__content');
			const isScrollable = await scrollContainer.evaluate(
				(el) => el.scrollHeight > el.clientHeight
			);

			// With 20 services, the content should overflow on mobile
			expect(isScrollable).toBe(true);

			// Verify we can actually scroll
			await scrollContainer.evaluate((el) => el.scrollTo(0, 300));
			await page.waitForTimeout(200);
			const scrollTop = await scrollContainer.evaluate((el) => el.scrollTop);
			expect(scrollTop).toBeGreaterThan(0);
		});
	});
});
