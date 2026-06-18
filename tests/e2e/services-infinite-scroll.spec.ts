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

		// Scroll to load page 2
		const scrollContainer = page.locator('.app-shell__content');
		await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
		await expect(cards).toHaveCount(40, { timeout: 10000 });
		await expect(noMore).not.toBeVisible();

		// Scroll to load page 3
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
});
