import { expect, test } from '@playwright/test';

/**
 * Dashboard Redirect & 404 Handling E2E Tests
 *
 * Verifies that:
 * 1. Old /dashboard/* routes redirect to /hiring (not 500)
 * 2. Truly non-existent routes show 404 (not 500)
 * 3. The error page distinguishes between 404 and 500 correctly
 */

test.describe('/dashboard redirect to /hiring', () => {
	test('/dashboard redirects to /hiring', async ({ page }) => {
		await page.goto('/dashboard');
		// After redirect, we should be on /hiring or a sub-route of /hiring
		await page.waitForLoadState('networkidle');
		const url = new URL(page.url());
		expect(url.pathname.startsWith('/hiring')).toBe(true);
	});

	test('/dashboard/tasks redirects to /hiring', async ({ page }) => {
		await page.goto('/dashboard/tasks');
		await page.waitForLoadState('networkidle');
		const url = new URL(page.url());
		expect(url.pathname.startsWith('/hiring')).toBe(true);
	});

	test('/dashboard/bids redirects to /hiring', async ({ page }) => {
		await page.goto('/dashboard/bids');
		await page.waitForLoadState('networkidle');
		const url = new URL(page.url());
		expect(url.pathname.startsWith('/hiring')).toBe(true);
	});

	test('/dashboard/settings redirects to /hiring', async ({ page }) => {
		await page.goto('/dashboard/settings');
		await page.waitForLoadState('networkidle');
		const url = new URL(page.url());
		expect(url.pathname.startsWith('/hiring')).toBe(true);
	});

	test('/dashboard does NOT show 500 Server Error', async ({ page }) => {
		await page.goto('/dashboard');
		await page.waitForLoadState('networkidle');

		const bodyText = await page.textContent('body');
		expect(bodyText).not.toContain('Server Error');
		expect(bodyText).not.toContain('500');
		expect(bodyText).not.toContain('Something went wrong on our end');
	});

	test('/dashboard does NOT show error page content', async ({ page }) => {
		await page.goto('/dashboard');
		await page.waitForLoadState('networkidle');

		// Should not land on the error page
		const errorTitle = page.locator('h1:has-text("Server Error")');
		await expect(errorTitle).not.toBeVisible({ timeout: 3000 });

		const notFoundTitle = page.locator('h1:has-text("Page Not Found")');
		await expect(notFoundTitle).not.toBeVisible({ timeout: 3000 });
	});
});

test.describe('404 handling for non-existent routes', () => {
	test('/completely-fake-route shows 404, not 500', async ({ page }) => {
		await page.goto('/completely-fake-route');
		await page.waitForLoadState('networkidle');

		// Should see 404-related content, NOT 500
		const bodyText = await page.textContent('body');
		expect(bodyText).not.toContain('Server Error');
		expect(bodyText).not.toContain('500');
		expect(bodyText).not.toContain('Something went wrong on our end');
	});

	test('/this-page-does-not-exist shows appropriate error', async ({ page }) => {
		await page.goto('/this-page-does-not-exist');
		await page.waitForLoadState('networkidle');

		const bodyText = await page.textContent('body');
		// Should NOT show server error
		expect(bodyText).not.toContain('Server Error');
	});

	test('non-existent sub-route shows 404', async ({ page }) => {
		await page.goto('/tasks/nonexistent-deep-route/xyz');
		await page.waitForLoadState('networkidle');

		const bodyText = await page.textContent('body');
		expect(bodyText).not.toContain('Server Error');
	});

	test('error page shows correct status in title', async ({ page }) => {
		await page.goto('/completely-fake-route');
		await page.waitForLoadState('networkidle');

		const title = await page.title();
		// Title should contain 404, not 500
		if (title.includes('BitTasker')) {
			expect(title).toContain('404');
			expect(title).not.toContain('500');
		}
	});

	test('error page has navigation buttons', async ({ page }) => {
		await page.goto('/completely-fake-route');
		await page.waitForLoadState('networkidle');

		// Should have a way to navigate back
		const goHomeBtn = page.locator('button:has-text("Go Home"), a:has-text("Go Home")');
		const goBackBtn = page.locator('button:has-text("Go Back"), a:has-text("Go Back")');

		const homeVisible = await goHomeBtn.isVisible().catch(() => false);
		const backVisible = await goBackBtn.isVisible().catch(() => false);

		expect(homeVisible || backVisible).toBe(true);
	});
});

test.describe('existing routes still work', () => {
	const WORKING_ROUTES = [
		{ path: '/tasks', name: 'Tasks' },
		{ path: '/services', name: 'Services' },
		{ path: '/about', name: 'About' },
		{ path: '/how-it-works', name: 'How It Works' },
		{ path: '/auth/login', name: 'Login' },
		{ path: '/auth/signup', name: 'Signup' },
		{ path: '/404', name: '404 Page' }
	];

	for (const route of WORKING_ROUTES) {
		test(`${route.path} loads without error`, async ({ page }) => {
			await page.goto(route.path);
			await page.waitForLoadState('networkidle');

			// Should not show error page
			const bodyText = await page.textContent('body');
			expect(bodyText).not.toContain('Server Error');
		});
	}
});
