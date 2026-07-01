import { expect, test, type Page } from '@playwright/test';

/**
 * Tasks Page Scroll & Layout E2E Tests
 *
 * Reproduces the same issues we found and fixed on the services page:
 * - Infinite scroll broken (manual scroll listener instead of InfiniteScroll component)
 * - Double scrollbar (inner .task-list-scroll-container)
 * - data-find-tasks-page attribute injection
 * - Sticky controls and map
 */

const TASK_KIND = 31000;

function createTaskEvent(index: number, createdAt: number) {
	return {
		id: `task-evt-${index}`,
		pubkey: 'd'.repeat(64),
		created_at: createdAt,
		kind: TASK_KIND,
		tags: [
			['d', `task-${index}`],
			['title', `Test Task ${index}`],
			['s', 'open']
		],
		content: JSON.stringify({
			title: `Test Task ${index}`,
			description: `Description for task ${index}`,
			status: 'OPEN',
			budget: { amount: 100 + index * 10, currency: 'USD' },
			attachments: [],
			deadline: '2030-01-01T00:00:00.000Z',
			categories: [{ id: 'cat-dev', name: 'Development', slug: 'development' }],
			skills: ['Development']
		}),
		sig: 'e'.repeat(128)
	};
}

function createTaskEvents(count: number, startTimestamp = 1_700_000_000) {
	return Array.from({ length: count }, (_, i) => createTaskEvent(i + 1, startTimestamp - i * 100));
}

async function mockTaskPages(
	page: Page,
	pages: Array<{ events: ReturnType<typeof createTaskEvent>[] }>
) {
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
		const isTaskRequest = rawKinds.some((kind) => kind.includes(String(TASK_KIND)));

		if (!isTaskRequest) {
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

	await page.route('**/api/v1/events/request', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: [] })
		});
	});
}

test.describe('Tasks Page Scroll & Layout', () => {
	test.describe('Mobile (375px)', () => {
		test.use({ viewport: { width: 375, height: 667 } });

		test('single scroll container — no inner scroll wrapper', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(10) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// The old .task-list-scroll-container should NOT exist inside the tasks page
			const oldScrollContainer = page.locator(
				'[data-tasks-content-area] .task-list-scroll-container'
			);
			await expect(oldScrollContainer).toHaveCount(0);

			// No data-find-tasks-page attribute on app-shell__content
			const appShellContent = page.locator('.app-shell__content');
			const hasDataAttr = await appShellContent.getAttribute('data-find-tasks-page');
			expect(hasDataAttr).toBeNull();
		});

		test('controls are visible on mobile', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(10) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Controls should be visible
			const controls = page.locator('#panel-find-tasks section').first();
			await expect(controls).toBeVisible();
		});

		test('scroll-to-top button appears when scrolled down', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(20) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Scroll down the app-shell content
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, 500));
			await page.waitForTimeout(300);

			// Scroll-to-top button should appear
			const scrollButton = page.locator('.scroll-to-top-button');
			await expect(scrollButton).toBeVisible({ timeout: 3000 });
		});
	});

	test.describe('Desktop (1440px)', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('two-column layout preserved', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(10) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			const listColumn = page.locator('[data-tasks-list-column]');
			await expect(listColumn).toBeVisible();

			const mapColumn = page.locator('[data-tasks-map-column]');
			await expect(mapColumn).toBeVisible();

			const listBox = await listColumn.boundingBox();
			const mapBox = await mapColumn.boundingBox();

			expect(listBox).not.toBeNull();
			expect(mapBox).not.toBeNull();
			expect(listBox!.width).toBeGreaterThan(100);
			expect(mapBox!.width).toBeGreaterThan(100);
		});

		test('map height must not exceed visible viewport (accounting for top bar)', async ({
			page
		}) => {
			await mockTaskPages(page, [{ events: createTaskEvents(20) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			const mapColumn = page.locator('[data-tasks-map-column]');
			const viewport = page.viewportSize()!;

			// Get the header height to know the visible area
			const headerHeight = await page.evaluate(() => {
				const header = document.querySelector('.app-shell__header');
				return header ? header.getBoundingClientRect().height : 0;
			});

			const mapHeight = await mapColumn.evaluate((el) => el.getBoundingClientRect().height);
			const visibleArea = viewport.height - headerHeight;

			// Map must not exceed the visible area below the header
			expect(mapHeight).toBeLessThanOrEqual(visibleArea + 10);
		});

		test('filters stay sticky when scrolling', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(20) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Find the controls section inside the tasks panel
			const controls = page.locator('#panel-find-tasks > section').first();
			const initialBox = await controls.boundingBox();
			expect(initialBox).not.toBeNull();

			// Scroll down
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, 800));
			await page.waitForTimeout(300);

			// Controls must still be visible at/near the top (sticky)
			const afterBox = await controls.boundingBox();
			expect(afterBox).not.toBeNull();
			// After scrolling 800px, controls should be at top of viewport (y ≈ 0 or header height)
			expect(afterBox!.y).toBeLessThanOrEqual(100);
		});

		test('map stays visible when scrolling slowly like a real user', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(20) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			const mapColumn = page.locator('[data-tasks-map-column]');
			const initialMapY = await mapColumn.evaluate((el) => el.getBoundingClientRect().y);

			// Scroll gradually like a real user
			const scrollContainer = page.locator('.app-shell__content');
			for (let i = 1; i <= 7; i++) {
				await scrollContainer.evaluate((el) => el.scrollBy(0, 150));
				await page.waitForTimeout(200);
			}

			// Map must still be visible in the viewport
			const mapBox = await mapColumn.boundingBox();
			expect(mapBox).not.toBeNull();
			expect(mapBox!.y).toBeGreaterThanOrEqual(0);
			expect(mapBox!.y).toBeLessThanOrEqual(initialMapY + 10);
		});

		test('no double scrollbar on desktop', async ({ page }) => {
			await mockTaskPages(page, [{ events: createTaskEvents(10) }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			await expect(page.locator('[data-task-id]').first()).toBeVisible({ timeout: 10000 });

			// Old scroll container should not exist in the tasks page
			const oldScrollContainer = page.locator(
				'[data-tasks-content-area] .task-list-scroll-container'
			);
			await expect(oldScrollContainer).toHaveCount(0);

			// No data-find-tasks-page attribute
			const appShellContent = page.locator('.app-shell__content');
			const hasDataAttr = await appShellContent.getAttribute('data-find-tasks-page');
			expect(hasDataAttr).toBeNull();
		});
	});

	test.describe('Infinite Scroll', () => {
		test.use({ viewport: { width: 1440, height: 900 } });

		test('loads first page of tasks on initial visit', async ({ page }) => {
			const events = createTaskEvents(10);
			await mockTaskPages(page, [{ events }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			const cards = page.locator('[data-task-id]');
			await expect(cards.first()).toBeVisible({ timeout: 10000 });
			await expect(cards).toHaveCount(10);
		});

		test('loads more tasks when scrolling to bottom', async ({ page }) => {
			const allEvents = createTaskEvents(15);
			const page1 = allEvents.slice(0, 10);
			const page2 = allEvents.slice(10);

			await mockTaskPages(page, [{ events: page1 }, { events: page2 }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			const cards = page.locator('[data-task-id]');
			await expect(cards.first()).toBeVisible({ timeout: 10000 });
			await expect(cards).toHaveCount(10);

			// Scroll to trigger load more
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
			await page.waitForTimeout(500);
			await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));

			// Wait for second page to load
			await expect(cards).toHaveCount(15, { timeout: 10000 });
		});

		test('shows end-of-results after all tasks loaded', async ({ page }) => {
			const allEvents = createTaskEvents(15);
			const page1 = allEvents.slice(0, 10);
			const page2 = allEvents.slice(10);

			await mockTaskPages(page, [{ events: page1 }, { events: page2 }]);
			await page.goto('/tasks');
			await page.waitForLoadState('networkidle');

			const cards = page.locator('[data-task-id]');
			await expect(cards.first()).toBeVisible({ timeout: 10000 });

			// Scroll to load second page
			const scrollContainer = page.locator('.app-shell__content');
			await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
			await page.waitForTimeout(500);
			await scrollContainer.evaluate((el) => el.scrollTo(0, el.scrollHeight));
			await expect(cards).toHaveCount(15, { timeout: 10000 });

			// No loading spinner should remain
			const spinner = page.locator('.loading-spinner');
			await expect(spinner).not.toBeVisible({ timeout: 3000 });
		});
	});
});
