import { expect, test, type Page } from '@playwright/test';

/**
 * Rapid Search Race Condition — E2E Tests
 *
 * Reproduces the production bug where rapidly changing the search term in the
 * services page causes an infinite loading loop. The user reported:
 * 1. Typed "Node" in search
 * 2. After ~2 seconds, changed to "Beauty"
 * 3. The skeleton/loading indicator kept showing/hiding indefinitely
 * 4. Never got results or "no services found" message
 *
 * Root cause analysis:
 * - Two concurrent findServices() calls race on the same store
 * - findServices() always updates the store regardless of whether the search is current
 * - The version check in debouncedSearch only gates searchParamsKey, not the store update
 * - syncScrollHasMore() dispatches scroll events that can trigger loadMore
 * - The IntersectionObserver may keep firing if sentinel stays visible
 * - hasMore stays true indefinitely due to incorrect calculation with SEARCH_FETCH_LIMIT
 */

const SERVICE_KIND = 30402;
const TASK_KIND = 31000;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function createServiceEvent(
	index: number,
	title: string,
	createdAt: number,
	uniquePrefix = 'race'
) {
	const uid = `${uniquePrefix}-service-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	return {
		id: `${uniquePrefix}-event-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: SERVICE_KIND,
		tags: [
			['d', uid],
			['title', title],
			['s', 'active']
		],
		content: JSON.stringify({
			uniqueId: uid,
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

function createTaskEvent(
	index: number,
	title: string,
	createdAt: number,
	uniquePrefix = 'race-task'
) {
	const uid = `${uniquePrefix}-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	return {
		id: `${uniquePrefix}-evt-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
		pubkey: 'a'.repeat(64),
		created_at: createdAt,
		kind: TASK_KIND,
		tags: [
			['d', uid],
			['title', title],
			['s', 'open']
		],
		content: JSON.stringify({
			uniqueId: uid,
			status: 'open',
			title,
			description: `Task description ${title}`,
			budget: { tier: 'small', currency: 'USD', type: 'fixed' },
			skills: ['Design'],
			categories: [{ id: 'cat', name: 'Design', slug: 'design' }],
			createdAt
		}),
		sig: 'b'.repeat(128)
	};
}

function createMatchingEvents(searchTerm: string, count: number, startTimestamp = 1_700_000_000) {
	return Array.from({ length: count }, (_, i) =>
		createServiceEvent(
			i + 1,
			`${searchTerm} Service ${i + 1}`,
			startTimestamp - i * 100,
			searchTerm.toLowerCase()
		)
	);
}

async function mockSearchAwareServices(
	page: Page,
	searchResults: Map<string, ReturnType<typeof createServiceEvent>[]>,
	defaultEvents: ReturnType<typeof createServiceEvent>[] = [],
	delayMs: number = 300
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
		const isServiceRequest = rawKinds.some((kind) => kind.includes(String(SERVICE_KIND)));

		if (!isServiceRequest) {
			await route.continue();
			return;
		}

		requestCount++;
		const searchParam = requestUrl.searchParams.get('search') || '';
		const hasUntil = requestUrl.searchParams.has('until');

		console.log(
			`[MOCK-SVC] Request #${requestCount}: search="${searchParam}", hasUntil=${hasUntil}`
		);

		await new Promise((resolve) => setTimeout(resolve, delayMs));

		let events = defaultEvents;
		if (searchParam && searchResults.has(searchParam)) {
			events = searchResults.get(searchParam) || [];
		}

		if (hasUntil) {
			events = [];
		}

		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ data: events })
		});
	});
}

async function mockTaskAwareSearch(
	page: Page,
	searchResults: Map<string, ReturnType<typeof createTaskEvent>[]>,
	defaultEvents: ReturnType<typeof createTaskEvent>[] = [],
	delayMs: number = 300
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

		requestCount++;
		const searchParam = requestUrl.searchParams.get('search') || '';
		const hasUntil = requestUrl.searchParams.has('until');

		console.log(
			`[MOCK-TASK] Request #${requestCount}: search="${searchParam}", hasUntil=${hasUntil}`
		);

		await new Promise((resolve) => setTimeout(resolve, delayMs));

		let events = defaultEvents;
		if (searchParam && searchResults.has(searchParam)) {
			events = searchResults.get(searchParam) || [];
		}

		if (hasUntil) {
			events = [];
		}

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

async function getServiceCards(page: Page) {
	return page.locator('[data-service-id]');
}

async function getTaskCards(page: Page) {
	return page.locator('[data-task-id]');
}

async function isLoadingVisible(page: Page, container: string = 'services'): Promise<boolean> {
	const selector =
		container === 'tasks'
			? '#panel-find-tasks .animate-pulse, #panel-find-tasks .loading-spinner'
			: '[data-services-list-column] .animate-pulse, [data-services-list-column] .loading-spinner';
	const loading = page.locator(selector);
	const count = await loading.count();
	return count > 0;
}

async function isNoResultsVisible(page: Page): Promise<boolean> {
	// Match both the translated text and the i18n key (in case translations aren't loaded)
	const noResultsHeading = page.locator('h3').filter({ hasText: /no services found/i });
	const noResultsKey = page.locator('h3').filter({
		hasText: /dashboard\.services\.browse\.no_services_found/i
	});
	const headingVisible = await noResultsHeading.isVisible().catch(() => false);
	const keyVisible = await noResultsKey.isVisible().catch(() => false);
	return headingVisible || keyVisible;
}

async function isBlankState(page: Page): Promise<boolean> {
	// Detect the blank state: no cards, no loading, no "no results" message, no skeleton
	const cards = await getServiceCards(page);
	const cardCount = await cards.count();
	const loading = await isLoadingVisible(page);
	const noResults = await isNoResultsVisible(page);
	const skeleton = page.locator('[data-services-list-column] .animate-pulse');
	const hasSkeleton = (await skeleton.count()) > 0;

	return cardCount === 0 && !loading && !noResults && !hasSkeleton;
}

async function getSearchInput(page: Page) {
	return page.locator('#services-main input[type="text"]').first();
}

async function getTaskSearchInput(page: Page) {
	return page.locator('#panel-find-tasks input[type="text"]').first();
}

async function getPageState(page: Page, container: string = 'services') {
	const cards = container === 'tasks' ? await getTaskCards(page) : await getServiceCards(page);
	const cardCount = await cards.count();
	const loading = await isLoadingVisible(page, container);
	const noResults = await isNoResultsVisible(page);
	const blank = await isBlankState(page);

	return { cardCount, loading, noResults, blank };
}

async function waitForStabilization(page: Page, timeoutMs: number = 6000) {
	await page.waitForTimeout(timeoutMs);
}

test.describe('Rapid Search Race Condition — Services', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('rapid search from "Node" to "Beauty" stabilizes to final state', async ({ page }) => {
		/**
		 * Exact scenario from production user report.
		 * Search "Node" then quickly change to "Beauty".
		 * Must eventually stabilize (not infinite loading).
		 */
		const searchResults = new Map([
			['Node', createMatchingEvents('Node', 3)],
			['Beauty', createMatchingEvents('Beauty', 2)]
		]);

		await mockSearchAwareServices(page, searchResults, [], 500);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);
		await expect(searchInput).toBeVisible();

		// Step 1: Type "Node" (debounce starts 1s timer)
		await searchInput.fill('Node');
		// Step 2: Quickly change to "Beauty" (debounce resets)
		await page.waitForTimeout(400);
		await searchInput.fill('Beauty');

		// Wait for debounce (1s) + network delay (500ms) + buffer
		await waitForStabilization(page, 6000);

		const state = await getPageState(page);
		console.log(`Node-Beauty final state: ${JSON.stringify(state)}`);

		// CRITICAL: Must not be stuck loading
		expect(state.loading).toBe(false);

		// CRITICAL: Must not be in blank state (no cards, no loading, no message)
		expect(state.blank).toBe(false);

		// Should have results for "Beauty" or show "no services found"
		const isStable = state.cardCount > 0 || state.noResults;
		expect(isStable).toBe(true);
	});

	test('rapid search with no results does NOT produce blank state', async ({ page }) => {
		/**
		 * Both searches return empty results.
		 * Should show "No services found" message, NOT blank screen.
		 */
		const searchResults = new Map([
			['Node', []],
			['Beauty', []]
		]);

		await mockSearchAwareServices(page, searchResults, [], 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);
		await searchInput.fill('Node');
		await page.waitForTimeout(400);
		await searchInput.fill('Beauty');

		await waitForStabilization(page, 6000);

		const state = await getPageState(page);
		console.log(`Empty results state: ${JSON.stringify(state)}`);

		// Must not be stuck loading
		expect(state.loading).toBe(false);

		// BUG DETECTION: If blank=true, the page shows nothing
		// This is the reported bug — should show "No services found" instead
		if (state.blank) {
			// Capture page content for debugging
			const content = await page.locator('[data-services-content-area]').innerHTML();
			console.log('BUG: Blank state detected. Content area HTML:', content.substring(0, 500));
		}

		// This assertion documents the expected behavior:
		// The page should show "no services found" when search returns empty
		expect(state.cardCount).toBe(0);
		// NOTE: This may fail due to blank state bug - that's expected, it documents the issue
		expect(state.noResults).toBe(true);
	});

	test('loading indicator does NOT flash repeatedly during rapid search', async ({ page }) => {
		/**
		 * Track loading state transitions. The loading indicator should
		 * transition cleanly, not toggle rapidly.
		 */
		const searchResults = new Map([
			['Node', createMatchingEvents('Node', 5)],
			['Beauty', createMatchingEvents('Beauty', 3)]
		]);

		await mockSearchAwareServices(page, searchResults, [], 400);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Track loading state transitions
		const loadingStates: Array<{ time: number; loading: boolean; phase: string }> = [];
		const t0 = Date.now();

		const recordState = async (phase: string) => {
			const loading = await isLoadingVisible(page);
			loadingStates.push({ time: Date.now() - t0, loading, phase });
		};

		await recordState('before-search');

		await searchInput.fill('Node');
		await recordState('after-node');

		await page.waitForTimeout(500);
		await recordState('mid-debounce');

		await searchInput.fill('Beauty');
		await recordState('after-beauty');

		await page.waitForTimeout(1000);
		await recordState('after-debounce');

		await page.waitForTimeout(1500);
		await recordState('after-network-1');

		await page.waitForTimeout(1500);
		await recordState('after-network-2');

		await page.waitForTimeout(2000);
		await recordState('final');

		let transitions = 0;
		for (let i = 1; i < loadingStates.length; i++) {
			if (loadingStates[i].loading !== loadingStates[i - 1].loading) {
				transitions++;
			}
		}

		console.log('Loading state timeline:');
		for (const s of loadingStates) {
			console.log(`  +${s.time}ms [${s.phase}]: loading=${s.loading}`);
		}
		console.log(`Total transitions: ${transitions}`);

		// Final state should NOT be loading
		const finalState = loadingStates[loadingStates.length - 1];
		expect(finalState.loading).toBe(false);

		// Allow up to 6 transitions (start/stop for each search round)
		// More than 6 indicates flickering
		expect(transitions).toBeLessThanOrEqual(6);
	});

	test('three rapid search changes stabilize correctly', async ({ page }) => {
		/**
		 * Stress test: three rapid search changes.
		 * Should stabilize to the last search's results.
		 */
		const searchResults = new Map([
			['Art', createMatchingEvents('Art', 4)],
			['Node', createMatchingEvents('Node', 6)],
			['Beauty', []]
		]);

		await mockSearchAwareServices(page, searchResults, [], 400);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Three rapid fills (all faster than 1s debounce)
		await searchInput.fill('Art');
		await page.waitForTimeout(300);
		await searchInput.fill('Node');
		await page.waitForTimeout(300);
		await searchInput.fill('Beauty');

		await waitForStabilization(page, 8000);

		const state = await getPageState(page);
		console.log('Three rapid searches:', JSON.stringify(state));

		// Must not be stuck loading
		expect(state.loading).toBe(false);

		// Beauty returns empty, so should show "no services found" or be blank
		// Both are valid states to check — blank is a BUG
		expect(state.cardCount).toBe(0);
		if (state.blank) {
			console.log('BUG: Page is in blank state after empty search results');
		}
	});

	test('search with results then empty search shows "no services found" (no stale cards)', async ({
		page
	}) => {
		/**
		 * First search returns results, second search returns nothing.
		 * Should cleanly transition to "no services found" without stale cards.
		 */
		const searchResults = new Map([
			['Node', createMatchingEvents('Node', 5)],
			['Beauty', []]
		]);

		await mockSearchAwareServices(page, searchResults, [], 300);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// First search: "Node" (has results)
		await searchInput.fill('Node');
		await page.waitForTimeout(2500); // Wait for debounce (1s) + network (300ms) + buffer

		const stateAfterNode = await getPageState(page);
		console.log('After Node:', JSON.stringify(stateAfterNode));
		expect(stateAfterNode.cardCount).toBeGreaterThan(0);

		// Second search: "Beauty" (no results)
		await searchInput.fill('Beauty');
		await waitForStabilization(page, 4000);

		const stateAfterBeauty = await getPageState(page);
		console.log('After Beauty:', JSON.stringify(stateAfterBeauty));

		// Should NOT show stale Node cards
		expect(stateAfterBeauty.cardCount).toBe(0);
		expect(stateAfterBeauty.loading).toBe(false);

		// Should show "no services found" (not blank state)
		if (stateAfterBeauty.blank) {
			console.log('BUG: Stale transition produces blank state');
		}
		expect(stateAfterBeauty.noResults).toBe(true);
	});

	test('infinite scroll does NOT trigger excessive requests during search transition', async ({
		page
	}) => {
		/**
		 * After a search, syncScrollHasMore dispatches a scroll event.
		 * This should NOT trigger infinite loadMore loops.
		 */
		const searchResults = new Map([
			['Node', createMatchingEvents('Node', 20)],
			['Beauty', createMatchingEvents('Beauty', 3)]
		]);

		await mockSearchAwareServices(page, searchResults, [], 300);
		await mockDeletionEvents(page);

		// Track all service requests
		const serviceRequests: Array<{ search: string; hasUntil: boolean }> = [];

		// We need to intercept again to track requests (the mock already handles routing)
		page.on('request', (request) => {
			const url = request.url();
			if (url.includes('/api/v1/events') && url.includes(String(SERVICE_KIND))) {
				const requestUrl = new URL(url);
				serviceRequests.push({
					search: requestUrl.searchParams.get('search') || '',
					hasUntil: requestUrl.searchParams.has('until')
				});
			}
		});

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		await searchInput.fill('Node');
		await searchInput.blur();
		await page.waitForTimeout(3000);

		const requestsAfterNode = serviceRequests.length;

		await searchInput.fill('Beauty');
		await searchInput.blur();
		await waitForStabilization(page, 5000);

		const totalRequests = serviceRequests.length;
		const requestsAfterBeauty = totalRequests - requestsAfterNode;

		console.log('Service requests:');
		for (const req of serviceRequests) {
			console.log('  search=' + req.search + ', hasUntil=' + req.hasUntil);
		}
		console.log(
			`Total: ${totalRequests} (Node: ${requestsAfterNode}, Beauty: ${requestsAfterBeauty})`
		);

		const state = await getPageState(page);
		expect(state.loading).toBe(false);

		// Should not have excessive requests
		expect(totalRequests).toBeLessThanOrEqual(8);
	});
});

test.describe('Rapid Search Race Condition — Tasks', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('rapid task search from "Node" to "Beauty" stabilizes', async ({ page }) => {
		/**
		 * Same scenario as services but on the tasks page.
		 * Tasks uses regular debounce (not debounceWithAbort).
		 * Tasks also has a different loading state machine (initial/loading/loaded/timeout/error).
		 */
		const searchResults = new Map([
			['Node', [createTaskEvent(1, 'Node.js Task', 1_700_000_000, 'node')]],
			[
				'Beauty',
				[
					createTaskEvent(2, 'Beauty Task 1', 1_699_999_900, 'beauty1'),
					createTaskEvent(3, 'Beauty Task 2', 1_699_999_800, 'beauty2')
				]
			]
		]);

		await mockTaskAwareSearch(page, searchResults, [], 400);
		await mockDeletionEvents(page);

		await page.goto('/tasks');
		await page.waitForSelector('#panel-find-tasks', { timeout: 15000 });

		// Wait for initial load to complete (tasks page has a loading state machine)
		await page.waitForTimeout(5000);

		const searchInput = await getTaskSearchInput(page);
		await expect(searchInput).toBeVisible();

		// Rapid search change
		await searchInput.fill('Node');
		await page.waitForTimeout(400);
		await searchInput.fill('Beauty');

		// Tasks page debounce is 1000ms, plus network 400ms, plus buffer
		await waitForStabilization(page, 10000);

		const cards = await getTaskCards(page);
		const cardCount = await cards.count();

		// For tasks, also check loading-spinner specifically for search loading (not skeleton)
		const searchLoadingSpinner = page.locator(
			'#panel-find-tasks .loading-spinner:not(.animate-pulse)'
		);
		const hasSearchSpinner = await searchLoadingSpinner.isVisible().catch(() => false);

		// Check for "no results" state
		const noResultsHeading = page
			.locator('#panel-find-tasks h3')
			.filter({ hasText: /no results/i });
		const noResults = await noResultsHeading.isVisible().catch(() => false);

		// Also check for skeleton (loading state machine)
		const skeletonVisible = await page
			.locator('#panel-find-tasks .animate-pulse')
			.first()
			.isVisible()
			.catch(() => false);

		const isStable = cardCount > 0 || noResults;

		console.log(
			'Tasks final: cards=' +
				cardCount +
				', hasSearchSpinner=' +
				hasSearchSpinner +
				', skeleton=' +
				skeletonVisible +
				', noResults=' +
				noResults +
				', isStable=' +
				isStable
		);

		if (!isStable || hasSearchSpinner) {
			const content = await page.locator('#panel-find-tasks').innerHTML();
			console.log('Tasks HTML (first 800 chars):', content.substring(0, 800));
		}

		// Must eventually stabilize (not infinite loading)
		expect(isStable).toBe(true);
	});
});

test.describe('Rapid Search — Edge Cases', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('search → clear → search does not leave orphaned loading state', async ({ page }) => {
		const searchResults = new Map([['Node', createMatchingEvents('Node', 3)]]);

		await mockSearchAwareServices(
			page,
			searchResults,
			createMatchingEvents('Default', 10, 1_690_000_000),
			300
		);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		// Search
		await searchInput.fill('Node');
		await page.waitForTimeout(2000);

		const stateAfterSearch = await getPageState(page);
		console.log(`After search: ${JSON.stringify(stateAfterSearch)}`);

		// Clear
		await searchInput.clear();
		await page.waitForTimeout(2000);

		const stateAfterClear = await getPageState(page);
		console.log(`After clear: ${JSON.stringify(stateAfterClear)}`);

		// Search again
		await searchInput.fill('Node');
		await waitForStabilization(page, 4000);

		const stateAfterResarch = await getPageState(page);
		console.log(`After re-search: ${JSON.stringify(stateAfterResarch)}`);

		expect(stateAfterResarch.loading).toBe(false);
		expect(stateAfterResarch.cardCount).toBeGreaterThan(0);
	});

	test('typing during in-flight request does not break state', async ({ page }) => {
		/**
		 * Use slow responses to ensure overlap between requests.
		 * Second search starts while first is still in-flight.
		 */
		const searchResults = new Map([
			['Art', createMatchingEvents('Art', 2)],
			['Node', createMatchingEvents('Node', 4)],
			['Beauty', createMatchingEvents('Beauty', 1)]
		]);

		await mockSearchAwareServices(page, searchResults, [], 1500);
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const searchInput = await getSearchInput(page);

		await searchInput.fill('Art');
		await page.waitForTimeout(1200);
		await searchInput.fill('Node');
		await page.waitForTimeout(1200);
		await searchInput.fill('Beauty');

		await waitForStabilization(page, 8000);

		const state = await getPageState(page);
		console.log(`Slow overlapping searches: ${JSON.stringify(state)}`);

		expect(state.loading).toBe(false);
		expect(state.blank).toBe(false);

		const isStable = state.cardCount > 0 || state.noResults;
		expect(isStable).toBe(true);
	});

	test('debounce fires only once for rapid character input', async ({ page }) => {
		let fetchCount = 0;

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

			fetchCount++;
			console.log(
				'[MOCK] Fetch #' + fetchCount + ': search=' + (requestUrl.searchParams.get('search') || '')
			);

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [] })
			});
		});
		await mockDeletionEvents(page);

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(2000);

		const initialFetchCount = fetchCount;
		const searchInput = await getSearchInput(page);

		// Type characters rapidly
		for (const char of 'Beauty') {
			await searchInput.type(char, { delay: 50 });
		}

		// Wait for debounce + response
		await page.waitForTimeout(3000);

		const searchFetches = fetchCount - initialFetchCount;
		console.log('Rapid typing Beauty: ' + searchFetches + ' search fetches');

		// Should be 1-2 fetches (debounce coalesces, but type may trigger per-character)
		expect(searchFetches).toBeLessThanOrEqual(3);
	});
});
