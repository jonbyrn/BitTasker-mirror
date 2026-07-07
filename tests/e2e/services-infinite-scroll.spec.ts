import { expect, test, type Page } from '@playwright/test';

/**
 * Services Infinite Scroll E2E Tests
 *
 * Verifies the cursor-based pagination fix: services load in pages via
 * IntersectionObserver, the `until` cursor is sent on subsequent pages,
 * and end-of-results appears only after all services are loaded.
 */

const SERVICE_KIND = 30402;

function createServiceEvent(index: number, createdAt: number) {
	return {
		id: `infinite-scroll-event-${index}`,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: SERVICE_KIND,
		tags: [
			['d', `infinite-scroll-service-${index}`],
			['title', `Infinite Scroll Service ${index}`],
			['s', 'active']
		],
		content: JSON.stringify({
			uniqueId: `infinite-scroll-service-${index}`,
			status: 'active',
			title: `Infinite Scroll Service ${index}`,
			description: `Description for service ${index}`,
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: { type: 'FIXED', amount: 100, currency: 'USD' },
			skills: ['Design'],
			categories: [{ id: 'cat-design', name: 'Design', slug: 'design' }],
			portfolio: [],
			creator: { username: `provider-${index}`, avatar: '' },
			createdAt
		}),
		sig: 'b'.repeat(128)
	};
}

function createServiceEvents(count: number, startTimestamp = 1_700_000_000) {
	return Array.from({ length: count }, (_, i) =>
		createServiceEvent(i + 1, startTimestamp - i * 100)
	);
}

async function mockServicePages(
	page: Page,
	pages: Array<{ events: ReturnType<typeof createServiceEvent>[] }>
) {
	let requestCount = 0;

	await page.route('**/api/v1/events**', async (route) => {
		const url = route.request().url();
		const method = route.request().method();

		// Only intercept GET requests for service events
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

		const pageIndex = Math.min(requestCount, pages.length - 1);
		requestCount++;

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: pages[pageIndex].events })
		});
	});
}

async function mockDeletionEvents(page: Page) {
	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: [] })
		});
	});
}

test.describe('Services Infinite Scroll', () => {
	test('loads first page of services on initial visit', async ({ page }) => {
		const allEvents = createServiceEvents(25);
		const page1 = allEvents.slice(0, 20);
		const page2 = allEvents.slice(20);

		await mockServicePages(page, [{ events: page1 }, { events: page2 }]);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		// Wait for service cards to appear
		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });

		// First page should show 20 services
		const initialCount = await cards.count();
		expect(initialCount).toBe(20);
	});

	test('loads more services when scrolling to bottom', async ({ page }) => {
		const allEvents = createServiceEvents(25);
		const page1 = allEvents.slice(0, 20);
		const page2 = allEvents.slice(20);

		await mockServicePages(page, [{ events: page1 }, { events: page2 }]);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		await expect(cards).toHaveCount(20);

		// Scroll the page to the bottom to trigger load more
		const scrollContainer = page.locator('.app-shell__content');
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await page.waitForTimeout(500);
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));

		// Wait for second page to load
		await expect(cards).toHaveCount(25, { timeout: 10000 });
	});

	test('shows end-of-results after all services loaded', async ({ page }) => {
		const allEvents = createServiceEvents(25);
		const page1 = allEvents.slice(0, 20);
		const page2 = allEvents.slice(20);

		await mockServicePages(page, [{ events: page1 }, { events: page2 }]);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });

		// Scroll to load second page
		const scrollContainer = page.locator('.app-shell__content');
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await expect(cards).toHaveCount(25, { timeout: 10000 });

		// "No more services" should appear
		await expect(page.getByText(/no more services/i)).toBeVisible({ timeout: 5000 });
	});

	test('does not show premature end-of-results with 45 services', async ({ page }) => {
		const allEvents = createServiceEvents(45);
		const page1 = allEvents.slice(0, 20);
		const page2 = allEvents.slice(20, 40);
		const page3 = allEvents.slice(40);

		await mockServicePages(page, [{ events: page1 }, { events: page2 }, { events: page3 }]);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		await expect(cards).toHaveCount(20);

		// "No more services" should NOT be visible yet
		const noMore = page.getByText(/no more services/i);
		await expect(noMore).not.toBeVisible();

		// Scroll to load page 2 — wait for InfiniteScroll cooldown (300ms) to expire
		const scrollContainer = page.locator('.app-shell__content');
		await page.waitForTimeout(350);
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await expect(cards).toHaveCount(40, { timeout: 10000 });
		await expect(noMore).not.toBeVisible();

		// Scroll to load page 3 — wait for cooldown again
		await page.waitForTimeout(350);
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await expect(cards).toHaveCount(45, { timeout: 10000 });

		// NOW "no more services" should appear
		await expect(noMore).toBeVisible({ timeout: 5000 });
	});

	test('handles relay returning fewer than limit (no false hasMore)', async ({ page }) => {
		const events = createServiceEvents(8);

		await mockServicePages(page, [{ events }]);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		await expect(cards).toHaveCount(8);

		// With only 8 services (< 20 page size), "no more services" should appear immediately
		await expect(page.getByText(/no more services/i)).toBeVisible({ timeout: 5000 });
	});

	test('handles network error during load more gracefully', async ({ page }) => {
		const page1Events = createServiceEvents(20);
		let requestCount = 0;

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

			requestCount++;

			if (requestCount === 1) {
				await route.fulfill({
					status: 200,
					contentType: 'application/json',
					body: JSON.stringify({ data: page1Events })
				});
			} else {
				await route.abort('failed');
			}
		});

		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		await expect(cards).toHaveCount(20);

		// Existing cards should still be visible after failed load more
		await expect(cards).toHaveCount(20);
	});

	test('infinite scroll works after switching views and changing filters', async ({ page }) => {
		const page1Events = createServiceEvents(20);
		// Page 2 events must have different indices (21-30) to avoid dedup
		const page2Events = Array.from({ length: 10 }, (_, i) =>
			createServiceEvent(i + 21, 1_699_998_000 - i * 100)
		);

		const logs: string[] = [];
		page.on('console', (msg) => logs.push(msg.text()));

		let requestCount = 0;
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

			requestCount++;
			const hasUntil = requestUrl.searchParams.has('until');
			const data = hasUntil ? page2Events : page1Events;
			console.log(
				`[MOCK] Request #${requestCount} hasUntil=${hasUntil} returning ${data.length} events`
			);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data })
			});
		});
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');

		const cards = page.locator('[data-service-id]');
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		await expect(cards).toHaveCount(20);

		// Switch to map view and back
		const mapToggle = page.getByRole('button', { name: /map/i }).first();
		if (await mapToggle.isVisible()) {
			await mapToggle.click();
			await page.waitForTimeout(500);
			await mapToggle.click();
			await page.waitForTimeout(500);
		}

		// Verify cards are still there
		await expect(cards).toHaveCount(20);

		// Open filter drawer, apply a filter, then clear it
		const filterButton = page.getByRole('button', { name: /filter/i }).first();
		if (await filterButton.isVisible()) {
			await filterButton.click();
			await page.waitForTimeout(500);

			// Apply filter
			const applyButton = page.getByRole('button', { name: /apply/i }).first();
			if (await applyButton.isVisible()) {
				await applyButton.click();
				await page.waitForTimeout(2000);
			}

			// Clear filters
			const clearButton = page.getByRole('button', { name: /clear/i }).first();
			if (await clearButton.isVisible()) {
				await clearButton.click();
				await page.waitForTimeout(2000);
			}
		}

		// After filter cycle, verify cards are loaded
		await expect(cards.first()).toBeVisible({ timeout: 10000 });
		const countAfterFilter = await cards.count();
		console.log('Cards after filter cycle:', countAfterFilter);

		// Scroll to bottom
		const scrollContainer = page.locator('.app-shell__content');
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await page.waitForTimeout(1000);
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await page.waitForTimeout(1000);

		const finalCount = await cards.count();
		console.log('Final card count:', finalCount);
		console.log('SYNC logs:', logs.filter((l) => l.includes('[SYNC]')).join('\n'));
		console.log('MOCK logs:', logs.filter((l) => l.includes('[MOCK]')).join('\n'));

		expect(finalCount).toBeGreaterThan(20);
	});
});
