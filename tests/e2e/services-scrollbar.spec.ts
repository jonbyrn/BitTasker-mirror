import { expect, test, type Page } from '@playwright/test';

/**
 * Services Scrollbar & Layout E2E Tests
 *
 * Verifies the double scrollbar is eliminated, the two-column desktop layout
 * is preserved, and mobile uses a single scroll container.
 */

const SERVICE_KIND = 30402;

function createServiceEvent(index: number) {
	return {
		id: `scrollbar-event-${index}`,
		pubkey: 'c'.repeat(64),
		created_at: 1_700_000_000 - index * 100,
		kind: SERVICE_KIND,
		tags: [
			['d', `scrollbar-service-${index}`],
			['title', `Scrollbar Test Service ${index}`],
			['s', 'active']
		],
		content: JSON.stringify({
			uniqueId: `scrollbar-service-${index}`,
			status: 'active',
			title: `Scrollbar Test Service ${index}`,
			description: `Description for service ${index}`,
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: { type: 'FIXED', amount: 50, currency: 'USD' },
			skills: ['Development'],
			categories: [{ id: 'cat-dev', name: 'Development', slug: 'development' }],
			portfolio: [],
			creator: { username: `provider-${index}`, avatar: '' },
			createdAt: 1_700_000_000 - index * 100
		}),
		sig: 'd'.repeat(128)
	};
}

function createServiceEvents(count: number) {
	return Array.from({ length: count }, (_, i) => createServiceEvent(i + 1));
}

async function mockServiceEvents(page: Page, count = 12) {
	const events = createServiceEvents(count);

	await page.route('**/api/v1/events**', async (route) => {
		const url = route.request().url();
		const method = route.request().method();

		if (method !== 'GET' || !url.includes('kinds')) {
			await route.continue();
			return;
		}

		const requestUrl = new URL(url);
		const rawKinds = requestUrl.searchParams
			.getAll('kinds')
			.concat(requestUrl.searchParams.getAll('kinds[]'));
		const isServiceRequest = rawKinds.some((kind) => kind.includes(String(SERVICE_KIND)));

		if (!isServiceRequest) {
			await route.continue();
			return;
		}

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

test.describe('Services Scrollbar & Layout', () => {
	test.describe('Mobile (375px)', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('single scroll container — no inner scroll wrapper', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			// Wait for cards to load
			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// The old .task-list-scroll-container should NOT exist inside the services page
			const oldScrollContainer = page.locator(
				'[data-services-content-area] .task-list-scroll-container'
			);
			await expect(oldScrollContainer).toHaveCount(0);

			// The list column should exist
			const listColumn = page.locator('[data-services-list-column]');
			await expect(listColumn).toBeVisible();

			// Verify app-shell__content does NOT have data-find-services-page attribute
			const appShellContent = page.locator('.app-shell__content');
			const hasDataAttr = await appShellContent.getAttribute('data-find-services-page');
			expect(hasDataAttr).toBeNull();
		});

		test('service list uses available height', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// The page should be scrollable (content taller than viewport)
			const bodyHeight = await page.evaluate(() => document.body.scrollHeight);
			expect(bodyHeight).toBeGreaterThanOrEqual(667);
		});

		test('scroll-to-top button appears when scrolled down', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Scroll down the app-shell content
			await page.evaluate(() => {
				const content = document.querySelector('.app-shell__content');
				if (content) content.scrollTo(0, 500);
			});

			// Scroll-to-top button should appear (it's lg:hidden, so visible on mobile)
			const scrollButton = page.locator('.scroll-to-top-button');
			await expect(scrollButton).toBeVisible({ timeout: 3000 });
		});

		test('controls stay sticky on mobile when scrolling', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const controls = page.locator('.services-controls-wrapper');
			const initialBox = await controls.boundingBox();
			expect(initialBox).not.toBeNull();

			// Scroll down
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, 600));
			await page.waitForTimeout(300);

			// Controls must still be at the top (sticky)
			const afterBox = await controls.boundingBox();
			expect(afterBox).not.toBeNull();
			expect(afterBox!.y).toBeLessThanOrEqual(initialBox!.y + 5);
		});

		test('controls have padding instead of gap from top bar', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const controls = page.locator('.services-controls-wrapper');
			const styles = await controls.evaluate((el) => {
				const cs = getComputedStyle(el);
				return { top: cs.top, paddingTop: cs.paddingTop };
			});

			// top: 0 (no gap), padding-top > 0 (spacing inside controls)
			expect(styles.top).toBe('0px');
			expect(parseFloat(styles.paddingTop)).toBeGreaterThan(0);
		});

		test('map toggle works on mobile and map fills available height', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const mapToggle = page.getByRole('button', { name: /map/i }).first();

			if (await mapToggle.isVisible()) {
				await mapToggle.click();

				const mapView = page.locator('section.map-container-wrapper.lg\\:hidden');
				await expect(mapView).toBeVisible({ timeout: 3000 });

				// Check that the map fills the space between controls and bottom of viewport
				const mapBox = await mapView.boundingBox();
				const controlsBox = await page.locator('.services-controls-wrapper').boundingBox();
				const viewport = page.viewportSize()!;

				expect(mapBox).not.toBeNull();
				expect(controlsBox).not.toBeNull();

				// Map should start right after the controls
				expect(mapBox!.y).toBeGreaterThanOrEqual(controlsBox!.y + controlsBox!.height - 5);
				// Map should extend close to the bottom of the viewport
				expect(mapBox!.y + mapBox!.height).toBeGreaterThan(viewport.height * 0.8);
			}
		});
	});

	test.describe('Desktop (1440px)', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('two-column layout preserved', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// List column should be visible
			const listColumn = page.locator('[data-services-list-column]');
			await expect(listColumn).toBeVisible();

			// Map column should be visible on desktop
			const mapColumn = page.locator('[data-services-map-column]');
			await expect(mapColumn).toBeVisible();

			// Both columns should have non-zero width
			const listBox = await listColumn.boundingBox();
			const mapBox = await mapColumn.boundingBox();

			expect(listBox).not.toBeNull();
			expect(mapBox).not.toBeNull();
			expect(listBox!.width).toBeGreaterThan(100);
			expect(mapBox!.width).toBeGreaterThan(100);
		});

		test('map height must not exceed viewport', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const mapColumn = page.locator('[data-services-map-column]');
			const viewport = page.viewportSize()!;

			// Measure the map's actual rendered height via computed styles
			const mapHeight = await mapColumn.evaluate((el) => {
				const rect = el.getBoundingClientRect();
				return rect.height;
			});

			// The map's rendered height must not exceed the visible viewport
			expect(mapHeight).toBeLessThanOrEqual(viewport.height);
		});

		test('map stays visible when scrolling slowly like a real user', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const mapColumn = page.locator('[data-services-map-column]');
			const scrollContainer = page.locator('.app-shell__content');

			// Record the map's initial position (below header)
			const initialMapY = await mapColumn.evaluate((el) => el.getBoundingClientRect().y);

			// Scroll gradually like a real user — 7 steps of ~150px each
			for (let i = 1; i <= 7; i++) {
				await scrollContainer.evaluate((el) => el.scrollBy(0, 150));
				await page.waitForTimeout(200);
			}

			// After scrolling ~1050px, the map MUST still be visible in the viewport
			const mapBox = await mapColumn.boundingBox();
			expect(mapBox).not.toBeNull();

			// Map must still be visible (y should be >= its initial sticky position)
			// The map sticks at the top of the scroll container (which is below the header)
			expect(mapBox!.y).toBeGreaterThanOrEqual(0);
			expect(mapBox!.y).toBeLessThanOrEqual(initialMapY + 10);
		});

		test('map does not scroll away when scrolling to bottom', async ({ page }) => {
			await mockServiceEvents(page, 20);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			const mapColumn = page.locator('[data-services-map-column]');
			const scrollContainer = page.locator('.app-shell__content');

			// Record the map's initial position (below header)
			const initialMapY = await mapColumn.evaluate((el) => el.getBoundingClientRect().y);

			// Get total scrollable height
			const scrollHeight = await scrollContainer.evaluate((el) => el.scrollHeight);
			const clientHeight = await scrollContainer.evaluate((el) => el.clientHeight);
			const maxScroll = scrollHeight - clientHeight;

			// Scroll all the way to the bottom gradually
			const steps = 10;
			const stepSize = Math.floor(maxScroll / steps);
			for (let i = 0; i < steps; i++) {
				await scrollContainer.evaluate((el, dy) => el.scrollBy(0, dy), stepSize);
				await page.waitForTimeout(150);
			}
			// Ensure we're at the very bottom
			await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
			await page.waitForTimeout(300);

			// Map MUST still be visible in the viewport after scrolling to bottom
			const mapBox = await mapColumn.boundingBox();
			expect(mapBox).not.toBeNull();

			// Map must still be visible — sticky should pin it at its initial position
			// Allow small negative offset at max scroll (sticky clamping edge case)
			expect(mapBox!.y).toBeGreaterThanOrEqual(-25);
			expect(mapBox!.y).toBeLessThanOrEqual(initialMapY + 10);
		});

		test('no double scrollbar on desktop', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Old scroll container should not exist in the services page
			const oldScrollContainer = page.locator(
				'[data-services-content-area] .task-list-scroll-container'
			);
			await expect(oldScrollContainer).toHaveCount(0);

			// No data-find-services-page attribute on app-shell__content
			const appShellContent = page.locator('.app-shell__content');
			const hasDataAttr = await appShellContent.getAttribute('data-find-services-page');
			expect(hasDataAttr).toBeNull();
		});
	});

	test.describe('Tablet (768px)', () => {
		test.use({ viewport: { width: 768, height: 1024 } });

		test('single column layout on tablet', async ({ page }) => {
			await mockServiceEvents(page);
			await page.goto('/services');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-service-id]').first()).toBeVisible({ timeout: 10000 });

			// Map column should be hidden on tablet (lg:block, so hidden below 1024px)
			const mapColumn = page.locator('[data-services-map-column]');
			await expect(mapColumn).toBeHidden();
		});
	});
});
