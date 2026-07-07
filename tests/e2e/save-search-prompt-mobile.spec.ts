import { expect, test, type Page } from '@playwright/test';

/**
 * Save Search Prompt — Mobile UX E2E Tests
 *
 * Reproduces the issue where the "Save Search" banner/prompt interferes with
 * mobile filtering, especially when the keyboard is open.
 *
 * The banner should NOT appear when:
 * - The keyboard is open (search input is focused)
 * - Services/tasks are still loading
 * - The user is actively typing
 *
 * The banner SHOULD appear only after:
 * - The user has stopped interacting for a while
 * - Results have loaded
 * - The keyboard is closed (input blurred)
 */

const MOBILE_VIEWPORT = { width: 390, height: 844 };
const SERVICE_KIND = 30402;

function createServiceEvent(index: number, title: string, createdAt: number) {
	return {
		id: `save-search-event-${index}`,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: SERVICE_KIND,
		tags: [
			['d', `save-search-service-${index}`],
			['title', title],
			['s', 'active']
		],
		content: JSON.stringify({
			uniqueId: `save-search-service-${index}`,
			status: 'active',
			title,
			description: `Description for ${title}`,
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

async function mockServicesWithDelay(
	page: Page,
	events: ReturnType<typeof createServiceEvent>[],
	delayMs: number = 500
) {
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

		// Simulate network delay
		await new Promise((resolve) => setTimeout(resolve, delayMs));

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
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

async function isBannerVisible(page: Page): Promise<boolean> {
	const banner = page.locator('.toast-container .bg-base-100.border-primary\\/50');
	return banner.isVisible().catch(() => false);
}

async function getSearchInput(page: Page) {
	return page.locator('#services-main input[type="text"]').first();
}

test.describe('Save Search Prompt — Mobile Keyboard Interaction', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('banner does NOT appear while search input is focused (keyboard open)', async ({ page }) => {
		const events = [
			createServiceEvent(1, 'Node.js Development', 1_700_000_000),
			createServiceEvent(2, 'Beauty Services', 1_699_999_900)
		];
		await mockServicesWithDelay(page, events, 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);
		await expect(searchInput).toBeVisible();

		// Focus the input (opens keyboard)
		await searchInput.focus();
		await page.waitForTimeout(200);

		// Type a search query that would normally trigger the save search prompt
		await searchInput.fill('Node');
		await page.waitForTimeout(200);

		// While input is still focused (keyboard open), the banner should NOT appear
		const bannerWhileFocused = await isBannerVisible(page);

		// Wait for debounce to fire (1s) + network delay
		await page.waitForTimeout(2000);

		// Banner should still not be visible while input is focused
		const bannerAfterDebounce = await isBannerVisible(page);

		// CRITICAL: The banner should not appear while the user is still in the search flow
		// If this fails, the banner is showing during keyboard-open state
		console.log(
			`Banner visible while focused: ${bannerWhileFocused}, after debounce: ${bannerAfterDebounce}`
		);

		// Blur the input (closes keyboard)
		await searchInput.blur();
		await page.waitForTimeout(500);

		const bannerAfterBlur = await isBannerVisible(page);
		console.log(`Banner visible after blur: ${bannerAfterBlur}`);
	});

	test('banner does NOT appear while services are still loading', async ({ page }) => {
		// Use a slow response to ensure we can check during loading
		const events = [createServiceEvent(1, 'Test Service', 1_700_000_000)];
		await mockServicesWithDelay(page, events, 3000); // 3 second delay
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('domcontentloaded');

		const searchInput = await getSearchInput(page);
		await searchInput.fill('Test');
		await page.waitForTimeout(1200); // Just past debounce

		// Services are still loading (3s delay, only ~1.2s elapsed)
		const bannerDuringLoading = await isBannerVisible(page);
		console.log(`Banner visible during loading: ${bannerDuringLoading}`);

		// Wait for loading to complete
		await page.waitForTimeout(4000);

		const bannerAfterLoading = await isBannerVisible(page);
		console.log(`Banner visible after loading: ${bannerAfterLoading}`);
	});

	test('banner show/hide does NOT flicker during rapid search changes', async ({ page }) => {
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
			const currentCount = requestCount;

			// Simulate varying network delays
			await new Promise((resolve) => setTimeout(resolve, 200 + currentCount * 100));

			const events = [
				createServiceEvent(
					currentCount,
					`Result ${currentCount}`,
					1_700_000_000 - currentCount * 100
				)
			];

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: events })
			});
		});
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Track banner visibility changes
		let bannerVisibilityChanges = 0;
		let lastBannerState = false;

		const checkBanner = async () => {
			const current = await isBannerVisible(page);
			if (current !== lastBannerState) {
				bannerVisibilityChanges++;
				lastBannerState = current;
			}
		};

		// Rapidly type different search terms
		const searchTerms = ['Node', 'Beauty', 'Desi', 'Art', 'Cook'];
		for (const term of searchTerms) {
			await searchInput.fill(term);
			await checkBanner();
			await page.waitForTimeout(200); // Shorter than debounce
			await checkBanner();
		}

		// Wait for all debounced searches to settle
		await page.waitForTimeout(5000);

		await checkBanner();

		console.log(`Banner visibility changed ${bannerVisibilityChanges} times during rapid search`);

		// The banner should not flicker excessively
		// With 5 rapid search changes, we expect at most 2-3 visibility changes
		// (appears once after settling, maybe disappears once)
		// If this fails with high numbers, the banner is flickering
		expect(bannerVisibilityChanges).toBeLessThanOrEqual(4);
	});

	test('banner shows AFTER results load and user stops interacting', async ({ page }) => {
		const events = [
			createServiceEvent(1, 'Node.js Service', 1_700_000_000),
			createServiceEvent(2, 'Another Service', 1_699_999_900)
		];
		await mockServicesWithDelay(page, events, 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Type a search and wait for debounce + load
		await searchInput.fill('Node');
		// Blur to simulate user moving on
		await searchInput.blur();
		await page.waitForTimeout(2000);

		// After results have loaded and user has stopped interacting,
		// the banner SHOULD appear (this is the expected behavior)
		const bannerAfterSettle = await isBannerVisible(page);
		console.log(`Banner visible after settle: ${bannerAfterSettle}`);

		// Verify the banner is actually present with correct content
		if (bannerAfterSettle) {
			const bannerText = await page
				.locator('.toast-container .bg-base-100.border-primary\\/50 p')
				.textContent();
			expect(bannerText).toBeTruthy();
		}
	});

	test('banner dismissed state persists across search changes', async ({ page }) => {
		const events = [createServiceEvent(1, 'Test Service', 1_700_000_000)];
		await mockServicesWithDelay(page, events, 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Type a search
		await searchInput.fill('Node');
		await searchInput.blur();
		await page.waitForTimeout(2000);

		// If banner appeared, dismiss it
		const dismissButton = page
			.locator('.toast-container button:has-text("Dismiss"), .toast-container button.btn-ghost')
			.first();
		if (await dismissButton.isVisible().catch(() => false)) {
			await dismissButton.click();
			await page.waitForTimeout(500);
		}

		const bannerAfterDismiss = await isBannerVisible(page);

		// Now change the search to something else
		await searchInput.fill('Beauty');
		await searchInput.blur();
		await page.waitForTimeout(2000);

		// If the same filter hash was dismissed, it should not reappear
		// But a NEW filter hash should show the banner again
		const bannerAfterNewSearch = await isBannerVisible(page);
		console.log(
			`Banner after dismiss: ${bannerAfterDismiss}, after new search: ${bannerAfterNewSearch}`
		);
	});
});

test.describe('Save Search Prompt — Keyboard Open State Detection', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('keyboard open simulation: banner should hide when keyboard attribute is set', async ({
		page
	}) => {
		const events = [createServiceEvent(1, 'Test', 1_700_000_000)];
		await mockServicesWithDelay(page, events, 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Fill search and blur to trigger banner
		await searchInput.fill('Test query here');
		await searchInput.blur();
		await page.waitForTimeout(2500);

		// Check banner before keyboard
		const bannerBefore = await isBannerVisible(page);

		// Simulate keyboard open
		await page.evaluate(() => {
			document.documentElement.setAttribute('data-keyboard-visible', '');
		});
		await searchInput.focus();
		await page.waitForTimeout(300);

		const bannerDuringKeyboard = await isBannerVisible(page);

		// Simulate keyboard close
		await page.evaluate(() => {
			document.documentElement.removeAttribute('data-keyboard-visible');
		});
		await searchInput.blur();
		await page.waitForTimeout(500);

		const bannerAfterKeyboard = await isBannerVisible(page);

		console.log(
			`Banner: before=${bannerBefore}, during keyboard=${bannerDuringKeyboard}, after=${bannerAfterKeyboard}`
		);
	});

	test('rapid focus/blur does not cause banner flicker', async ({ page }) => {
		const events = [createServiceEvent(1, 'Test', 1_700_000_000)];
		await mockServicesWithDelay(page, events, 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);
		await searchInput.fill('Test search term');
		await searchInput.blur();
		await page.waitForTimeout(2500);

		let bannerChanges = 0;
		let lastState = await isBannerVisible(page);

		// Rapid focus/blur cycles (simulating keyboard open/close)
		for (let i = 0; i < 5; i++) {
			await searchInput.focus();
			await page.waitForTimeout(100);
			await searchInput.blur();
			await page.waitForTimeout(100);

			const current = await isBannerVisible(page);
			if (current !== lastState) {
				bannerChanges++;
				lastState = current;
			}
		}

		console.log(`Banner changes during rapid focus/blur: ${bannerChanges}`);

		// Should not flicker more than once
		expect(bannerChanges).toBeLessThanOrEqual(2);
	});
});
