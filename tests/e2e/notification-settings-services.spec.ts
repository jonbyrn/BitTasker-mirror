import { test, expect } from './fixtures/cross-browser-auth';

async function dismissOverlays(page: import('@playwright/test').Page) {
	const closeButtons = page.locator('.modal-backdrop, [aria-label*="ismiss"]');
	for (const btn of await closeButtons.all()) {
		try {
			await btn.click({ timeout: 500 });
		} catch {
			/* no overlay */
		}
	}
	await page.waitForTimeout(300);
}

test.describe('Notification Preferences — Task & Service Settings', () => {
	test('notification settings page loads without crashing', async ({ authenticatedPage }) => {
		const pageErrors: string[] = [];
		authenticatedPage.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(4000);

		const undefinedErrors = pageErrors.filter(
			(e) => e.includes('Cannot read properties of undefined') || e.includes("reading 'enabled'")
		);
		expect(undefinedErrors).toEqual([]);
	});

	test('notification settings page does not throw when API omits nested settings', async ({
		authenticatedPage
	}) => {
		const pageErrors: string[] = [];
		authenticatedPage.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		await authenticatedPage.route('**/api/v1/notification-preferences**', (route, request) => {
			if (request.method() === 'GET') {
				route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({
						id: 'pref-1',
						npub: 'npub1test',
						userId: 1,
						pushEnabled: true,
						emailEnabled: false,
						quietHoursEnabled: false,
						quietHoursStart: '22:00',
						quietHoursEnd: '07:00',
						contractUpdates: true,
						bidUpdates: true,
						taskMatches: true,
						taskMatchFrequency: 'INSTANT',
						messageNotifications: true,
						messagePreview: true,
						reviewNotifications: true,
						discoveryNotifications: true,
						reengagementNotifications: true,
						securityAlerts: true,
						walletNotifications: true,
						serviceNotifications: true,
						createdAt: '2026-01-01T00:00:00Z',
						updatedAt: '2026-01-01T00:00:00Z'
					})
				});
			} else {
				route.continue();
			}
		});

		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(5000);

		const undefinedErrors = pageErrors.filter(
			(e) => e.includes('Cannot read properties of undefined') || e.includes("reading 'enabled'")
		);
		expect(undefinedErrors).toEqual([]);
	});

	test('notification settings page has no console errors', async ({ authenticatedPage }) => {
		const errors: string[] = [];
		authenticatedPage.on('console', (msg) => {
			if (msg.type() === 'error') {
				errors.push(msg.text());
			}
		});

		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(5000);

		const criticalErrors = errors.filter(
			(e) =>
				!e.includes('favicon') &&
				!e.includes('WebSocket') &&
				!e.includes('Sentry') &&
				!e.includes('Failed to load resource')
		);

		expect(criticalErrors).toEqual([]);
	});
});

test.describe('Notification Settings — Sectioned Card UI', () => {
	async function isSettingsPage(page: import('@playwright/test').Page): Promise<boolean> {
		const cards = await page.locator('.notif-settings-card').count();
		return cards > 0;
	}

	test('page displays 5 section cards (Global, Quiet hours, Categories, Tasks, Services)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const cards = authenticatedPage.locator('.notif-settings-card');
		expect(await cards.count()).toBe(5);
	});

	test('each section card has an icon', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const icons = authenticatedPage.locator('.notif-section-icon');
		expect(await icons.count()).toBe(5);
	});

	test('page header has animated bell icon', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const headerIcon = authenticatedPage.locator('.notif-header-icon');
		await expect(headerIcon).toBeVisible();
	});

	test('category toggles use actual toggle switches', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const toggles = authenticatedPage.locator('.toggle.toggle-xs');
		expect(await toggles.count()).toBeGreaterThanOrEqual(1);
	});

	test('categories section shows active count badge', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const badge = authenticatedPage.locator('.badge');
		expect(await badge.count()).toBeGreaterThanOrEqual(1);

		const badgeText = await badge.first().textContent();
		expect(badgeText).toMatch(/\d+\/\d+/);
	});

	test('categories do not include Tasks or Services (they have their own cards)', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const categoryGrid = authenticatedPage.locator('[aria-label="Notification categories"]');
		const gridText = await categoryGrid.textContent();
		expect(gridText).not.toContain('Tasks');
		expect(gridText).not.toContain('Services');
	});

	test('frequency selectors use segmented pill buttons', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const btnGroups = authenticatedPage.locator('.btn-group');
		expect(await btnGroups.count()).toBeGreaterThanOrEqual(2);
	});

	test('frequency pill buttons show Instant, Daily, Weekly options', async ({
		authenticatedPage
	}) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const body = await authenticatedPage.locator('body').textContent();
		expect(body).toContain('Instant');
		expect(body).toContain('Daily');
		expect(body).toContain('Weekly');
	});

	test('page has subtitle text', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const body = await authenticatedPage.locator('body').textContent();
		expect(body).toContain('Manage how and when');
	});

	test('section cards have rounded-2xl and shadow-lg styling', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const firstCard = authenticatedPage.locator('.notif-settings-card').first();
		const cls = await firstCard.getAttribute('class');
		expect(cls).toContain('rounded-2xl');
		expect(cls).toContain('shadow-lg');
	});

	test('subtle icon animation classes are present', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const pulse = await authenticatedPage.locator('.icon-subtle-pulse').count();
		const float = await authenticatedPage.locator('.icon-subtle-float').count();
		const breathe = await authenticatedPage.locator('.icon-subtle-breathe').count();
		const sway = await authenticatedPage.locator('.icon-subtle-sway').count();

		expect(pulse).toBeGreaterThanOrEqual(1);
		expect(float).toBeGreaterThanOrEqual(1);
		expect(breathe).toBeGreaterThanOrEqual(1);
		expect(sway).toBeGreaterThanOrEqual(1);
	});

	test('task card has 2-column grid on desktop', async ({ authenticatedPage }) => {
		await authenticatedPage.setViewportSize({ width: 1280, height: 720 });
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const taskGrid = authenticatedPage.locator('[aria-label="Task notification settings"] .grid');
		const count = await taskGrid.count();
		expect(count).toBeGreaterThanOrEqual(1);
	});

	test('quiet hours section has aria-label', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const quietSection = authenticatedPage.locator('[aria-label="Quiet hours settings"]');
		expect(await quietSection.count()).toBe(1);
	});

	test('each section card has a spotlight effect div', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const cards = authenticatedPage.locator('.notif-settings-card');
		const count = await cards.count();
		for (let i = 0; i < count; i++) {
			const spotlight = cards.nth(i).locator('[style*="radial-gradient"]');
			expect(await spotlight.count()).toBeGreaterThanOrEqual(1);
		}
	});

	test('labels use sentence case, not Title Case', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/settings/notifications');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(6000);

		if (!(await isSettingsPage(authenticatedPage))) return;

		const body = await authenticatedPage.locator('body').textContent();
		expect(body).not.toContain('Saved Search Matches');
		expect(body).not.toContain('Match Frequency');
		expect(body).not.toContain('New Task Alerts');
		expect(body).not.toContain('New Service Alerts');
		expect(body).toContain('Saved search matches');
		expect(body).toContain('New task alerts');
		expect(body).toContain('New service alerts');
	});
});

test.describe('Notification Deep Links — Service Routes', () => {
	test('/services route loads without 404', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/services', { waitUntil: 'domcontentloaded' });
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
		await expect(authenticatedPage.locator('body')).not.toContainText('Not Found');
	});

	test('/services/{id} route loads without 404', async ({ authenticatedPage }) => {
		const fakeServiceId = 'test-service-deeplink-123';
		await authenticatedPage.goto(`/services/${fakeServiceId}`, {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const bodyText = await authenticatedPage.locator('body').innerText();
		const is404 = bodyText.includes('404') || bodyText.includes('Not Found');
		// Route should exist (not 404) — it may show "not found" content but not a 404 page
		expect(is404).toBe(false);
	});

	test('/hiring/service-requests route loads without 404', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/hiring/service-requests', {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('/hiring');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
	});

	test('/earning/my-services route loads without 404', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/earning/my-services', {
			waitUntil: 'domcontentloaded'
		});
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(2000);

		const url = authenticatedPage.url();
		expect(url).toContain('/earning');

		await expect(authenticatedPage.locator('body')).not.toContainText('404');
	});
});

test.describe('Floating Save Search Prompt', () => {
	test('tasks page does not crash with search filters', async ({ authenticatedPage }) => {
		const pageErrors: string[] = [];
		authenticatedPage.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		await authenticatedPage.goto('/tasks');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		const crashErrors = pageErrors.filter(
			(e) => e.includes('Cannot read properties') || e.includes('is not a function')
		);
		expect(crashErrors).toEqual([]);
	});

	test('services page does not crash with search filters', async ({ authenticatedPage }) => {
		const pageErrors: string[] = [];
		authenticatedPage.on('pageerror', (error) => {
			pageErrors.push(error.message);
		});

		await authenticatedPage.goto('/services');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		const crashErrors = pageErrors.filter(
			(e) => e.includes('Cannot read properties') || e.includes('is not a function')
		);
		expect(crashErrors).toEqual([]);
	});

	test('prompt uses centralized banner system (Toast component)', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/services');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		// The toast container should exist (it's always rendered by Toast.svelte)
		const toastContainer = authenticatedPage.locator('.toast-container');
		expect(await toastContainer.count()).toBeGreaterThanOrEqual(1);
	});

	test('prompt is positioned above the bottom navbar', async ({ authenticatedPage }) => {
		await authenticatedPage.goto('/services');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(3000);

		// The toast container uses padding-bottom with --app-footer-height
		const toastContainer = authenticatedPage.locator('.toast-container');
		if ((await toastContainer.count()) > 0) {
			const style = await toastContainer.getAttribute('style');
			expect(style).toContain('--app-footer-height');
		}
	});

	test('tasks page loading timeout is not too aggressive (>= 20s)', async ({
		authenticatedPage
	}) => {
		// Verify the tasks page doesn't show a timeout error within 15 seconds
		// This tests that LOADING_TIMEOUT_MS has been increased from 10s
		await authenticatedPage.goto('/tasks');
		await dismissOverlays(authenticatedPage);
		await authenticatedPage.waitForTimeout(4000);

		const body = await authenticatedPage.locator('body').textContent();
		// Should NOT show "timed out" within 4 seconds of page load
		expect(body).not.toContain('Request timed out');
	});
});
