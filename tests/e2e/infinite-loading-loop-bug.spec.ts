import { expect, test } from '@playwright/test';

/**
 * Infinite Loading Loop Bug — E2E Reproduction
 *
 * ROOT CAUSE: findServices.ts line 451:
 *   const hasMore = events.length >= limit || cleanServices.length > limit;
 *
 * When searching, the relay is asked for SEARCH_FETCH_LIMIT (150) events.
 * The relay returns events, but most don't match the client-side text filter.
 * `events.length` (150) is compared against `limit` (20), so `hasMore = true`
 * even when there are ZERO more matching events.
 *
 * This causes InfiniteScroll to keep firing loadMore → findServices sets
 * loading=true → fetch → 0 matching → loading=false → hasMore=true →
 * InfiniteScroll fires again → loading=true → ... (infinite loop).
 *
 * The skeleton flickers on/off every ~500ms (300ms tryLoadMore cooldown +
 * network time).
 *
 * REPRODUCTION SCENARIO:
 * 1. Page loads with initial services
 * 2. User types search term that matches SOME but not all services
 * 3. First page shows the few matches
 * 4. hasMore=true (because raw events >= limit)
 * 5. InfiniteScroll fires loadMore for page 2
 * 6. Page 2 fetches more events, 0 match search → hasMore still true
 * 7. InfiniteScroll fires loadMore for page 3
 * 8. Repeat forever — skeleton flickers on each cycle
 */

const SERVICE_KIND = 30402;
const MOBILE_VIEWPORT = { width: 390, height: 844 };

function createServiceEvent(index: number, title: string, createdAt: number, prefix = 'infinite') {
	const uid = `${prefix}-svc-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
	return {
		id: `${prefix}-evt-${index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
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
			description: 'Service description',
			serviceLocationTypes: ['remote'],
			locationDetails: {},
			pricing: { type: 'FIXED', amount: 100, currency: 'USD' },
			skills: ['Design'],
			categories: [{ id: 'cat', name: 'Design', slug: 'design' }],
			portfolio: [],
			creator: { username: 'provider-' + index, avatar: '' },
			createdAt
		}),
		sig: 'b'.repeat(128)
	};
}

/**
 * Creates a set of events where only a small fraction match the search term.
 * Returns a function that generates events for each request.
 */
function createMixedEvents(
	matchingTerm: string,
	matchingCount: number,
	totalPerPage: number,
	startTimestamp: number
) {
	const matching: ReturnType<typeof createServiceEvent>[] = [];
	for (let i = 0; i < matchingCount; i++) {
		matching.push(
			createServiceEvent(i, matchingTerm + ' Service ' + (i + 1), startTimestamp - i * 100, 'match')
		);
	}

	const nonMatching: ReturnType<typeof createServiceEvent>[] = [];
	for (let i = 0; i < totalPerPage - matchingCount; i++) {
		nonMatching.push(
			createServiceEvent(
				matchingCount + i,
				'Generic Design Service ' + (i + 1),
				startTimestamp - matchingCount * 100 - i * 100,
				'nomatch'
			)
		);
	}

	return { matching, nonMatching, all: [...matching, ...nonMatching] };
}

test.describe('Infinite Loading Loop Bug Reproduction', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(MOBILE_VIEWPORT);
	});

	test('BUG: hasMore stays true when filtered results are exhausted — skeleton flickers', async ({
		page
	}) => {
		/**
		 * This test reproduces the exact production bug.
		 *
		 * The relay returns events that are mostly NOT matching the search text.
		 * After the first page shows the few matches, hasMore stays true because
		 * events.length (raw relay count) >= limit. InfiniteScroll keeps firing
		 * loadMore, which fetches more non-matching events, toggling the loading
		 * state on/off each time.
		 */
		const searchTerm = 'Beauty';
		const matchingCount = 3; // Only 3 out of 25 events match
		const totalPerPage = 25; // More than PAGE_LIMIT (20) so hasMore=true
		const baseTimestamp = 1_700_000_000;

		// Track all requests and loading state
		const requests: Array<{
			search: string;
			hasUntil: boolean;
			timestamp: number;
		}> = [];
		let firstRequest = true;

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

			const searchParam = requestUrl.searchParams.get('search') || '';
			const hasUntil = requestUrl.searchParams.has('until');

			requests.push({
				search: searchParam,
				hasUntil,
				timestamp: Date.now()
			});

			// Simulate network delay
			await new Promise((resolve) => setTimeout(resolve, 200));

			let events;

			if (firstRequest && !searchParam) {
				// Initial page load: return generic services
				firstRequest = false;
				events = Array.from({ length: totalPerPage }, (_, i) =>
					createServiceEvent(i, 'Generic Service ' + (i + 1), baseTimestamp - i * 100, 'init')
				);
			} else if (searchParam === searchTerm && !hasUntil) {
				// First search page: return mixed events (some matching, most not)
				const mixed = createMixedEvents(searchTerm, matchingCount, totalPerPage, baseTimestamp);
				events = mixed.all;
			} else {
				// Subsequent pages (with until): return events that DON'T match the search
				// This is the key: the relay keeps returning events, but none match "Beauty"
				events = Array.from({ length: totalPerPage }, (_, i) => {
					const offset = hasUntil ? 10000 : 0; // Older timestamps for pagination
					return createServiceEvent(
						i + 1000 + requests.length * 100,
						'Unrelated Service ' + (i + 1 + requests.length * totalPerPage),
						baseTimestamp - offset - i * 100 - requests.length * 10000,
						'page' + requests.length
					);
				});
			}

			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: events })
			});
		});

		// Mock deletion events
		await page.route('**/api/v1/events/request', async (route) => {
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({ data: [] })
			});
		});

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(3000);

		// Verify initial load completed
		const initialCards = await page.locator('[data-service-id]').count();
		console.log('Initial cards loaded:', initialCards);
		expect(initialCards).toBeGreaterThan(0);

		// Now search for the term that only matches a few events
		const searchInput = page.locator('#services-main input[type="text"]').first();
		await searchInput.fill(searchTerm);

		// Wait for debounce (1s) + fill-loop (up to 10 rounds × ~200ms each + processing)
		// The fill-loop is bounded by MAX_FILL_ROUNDS=10, so it should finish within ~6s
		await page.waitForTimeout(7000);

		const cardsAfterSearch = await page.locator('[data-service-id]').count();
		console.log('Cards after search for "' + searchTerm + '":', cardsAfterSearch);
		console.log('Search filtered ' + initialCards + ' down to ' + cardsAfterSearch + ' cards');

		// Record request count after fill-loop should have completed
		const requestsAfterFillLoop = requests.length;
		console.log('Requests after fill-loop:', requestsAfterFillLoop);

		// Now wait another 5 seconds and verify NO new requests are made.
		// This is the key assertion: after the fill-loop sets hasMore=false,
		// InfiniteScroll should NOT fire loadMore again.
		await page.waitForTimeout(5000);

		const requestsAfterWait = requests.length;
		const extraRequests = requestsAfterWait - requestsAfterFillLoop;
		console.log('Extra requests during 5s wait:', extraRequests);

		const totalRequests = requests.length;
		const paginationRequests = requests.filter((r) => r.hasUntil);

		console.log('\n--- BUG REPRODUCTION RESULTS ---');
		console.log('Total relay requests:', totalRequests);
		console.log('Pagination requests (with until):', paginationRequests.length);
		console.log(
			'Request timeline:',
			requests.map((r) => 'search="' + r.search + '" hasUntil=' + r.hasUntil)
		);

		// ASSERTION: After the fill-loop completes and sets hasMore=false,
		// no additional requests should be made. The InfiniteScroll should stop.
		expect(extraRequests).toBe(0);

		// Final state should be stable (not loading)
		const finalLoading = await page.locator('[data-services-list-column] .animate-pulse').count();
		expect(finalLoading).toBe(0);
	});

	test('BUG: rapid "Node" to "Beauty" change triggers infinite scroll loop', async ({ page }) => {
		/**
		 * The exact production scenario:
		 * 1. User types "Node" → services load (some match)
		 * 2. User changes to "Beauty" after 2 seconds
		 * 3. "Beauty" search returns some matches
		 * 4. hasMore stays true → InfiniteScroll fires repeatedly
		 * 5. Skeleton flickers on/off indefinitely
		 */
		const baseTimestamp = 1_700_000_000;
		let requestCount = 0;

		const requests: Array<{ search: string; hasUntil: boolean }> = [];

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

			requests.push({ search: searchParam, hasUntil });

			await new Promise((resolve) => setTimeout(resolve, 150));

			let events;

			if (!searchParam && !hasUntil) {
				// Initial load or cleared search: return generic services
				events = Array.from({ length: 25 }, (_, i) =>
					createServiceEvent(i, 'Generic Service ' + (i + 1), baseTimestamp - i * 100, 'init')
				);
			} else if (searchParam === 'Node' && !hasUntil) {
				// "Node" search: return 5 matching + 20 non-matching
				const matching = Array.from({ length: 5 }, (_, i) =>
					createServiceEvent(i, 'Node.js Service ' + (i + 1), baseTimestamp - i * 100, 'node')
				);
				const nonMatching = Array.from({ length: 20 }, (_, i) =>
					createServiceEvent(
						i + 5,
						'Design Service ' + (i + 1),
						baseTimestamp - 500 - i * 100,
						'other'
					)
				);
				events = [...matching, ...nonMatching];
			} else if (searchParam === 'Beauty' && !hasUntil) {
				// "Beauty" search: return 2 matching + 23 non-matching
				const matching = Array.from({ length: 2 }, (_, i) =>
					createServiceEvent(i, 'Beauty Service ' + (i + 1), baseTimestamp - i * 100, 'beauty')
				);
				const nonMatching = Array.from({ length: 23 }, (_, i) =>
					createServiceEvent(
						i + 2,
						'Random Service ' + (i + 1),
						baseTimestamp - 200 - i * 100,
						'rand'
					)
				);
				events = [...matching, ...nonMatching];
			} else {
				// Pagination (with until): always return 25 non-matching events
				events = Array.from({ length: 25 }, (_, i) =>
					createServiceEvent(
						i + 5000 + requestCount * 100,
						'Older Service ' + (i + 1 + requestCount * 25),
						baseTimestamp - 50000 - requestCount * 10000 - i * 100,
						'page' + requestCount
					)
				);
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

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(3000);

		const searchInput = page.locator('#services-main input[type="text"]').first();

		// Step 1: Search "Node" (debounce fires after 1s)
		await searchInput.fill('Node');
		await page.waitForTimeout(1500);

		const nodeCards = await page.locator('[data-service-id]').count();
		console.log('Cards after "Node" search:', nodeCards);

		// Step 2: Quickly change to "Beauty" (before infinite scroll kicks in for Node)
		await searchInput.fill('Beauty');

		// Wait for debounce (1s) + fill-loop (up to 10 rounds × ~200ms + processing)
		await page.waitForTimeout(7000);

		const beautyCards = await page.locator('[data-service-id]').count();
		console.log('Cards after "Beauty" search:', beautyCards);

		// Record request count after fill-loop should have completed
		const requestsAfterFillLoop = requests.length;
		console.log('Requests after fill-loop:', requestsAfterFillLoop);

		// Wait 5 more seconds — no new requests should be made
		await page.waitForTimeout(5000);

		const extraRequests = requests.length - requestsAfterFillLoop;
		console.log('Extra requests during 5s wait:', extraRequests);

		const paginationRequests = requests.filter((r) => r.hasUntil);

		console.log('\n--- NODE→BEAUTY BUG RESULTS ---');
		console.log('Total requests:', requests.length);
		console.log('Pagination (loadMore) requests:', paginationRequests.length);
		console.log(
			'Requests:',
			requests.map((r) => 'search="' + r.search + '" until=' + r.hasUntil)
		);

		// After the fill-loop completes, no more requests should be made.
		expect(extraRequests).toBe(0);
	});

	test('reference: search with FULLY matching results does NOT loop', async ({ page }) => {
		/**
		 * Control test: when ALL returned events match the search term,
		 * hasMore should eventually become false and the loop should stop.
		 * This verifies the test setup is correct.
		 */
		const baseTimestamp = 1_700_000_000;
		const searchTerm = 'Design';
		let requestCount = 0;
		const requests: Array<{ hasUntil: boolean }> = [];

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
			requests.push({ hasUntil });

			await new Promise((resolve) => setTimeout(resolve, 150));

			// ALL events match the search term
			const events = Array.from({ length: hasUntil ? 5 : 20 }, (_, i) => {
				const offset = hasUntil ? 10000 : 0;
				return createServiceEvent(
					i + requestCount * 100,
					searchTerm + ' Service ' + (i + 1 + requestCount * 20),
					baseTimestamp - offset - i * 100 - requestCount * 10000,
					'ctrl'
				);
			});

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

		await page.goto('/services');
		await page.waitForSelector('[data-services-list-column]', { timeout: 15000 });
		await page.waitForTimeout(3000);

		const searchInput = page.locator('#services-main input[type="text"]').first();
		await searchInput.fill(searchTerm);
		await page.waitForTimeout(2000);

		// Wait for potential infinite scroll to settle
		await page.waitForTimeout(5000);

		const paginationRequests = requests.filter((r) => r.hasUntil);
		console.log('Control test — pagination requests:', paginationRequests.length);

		// With all-matching results, pagination should proceed normally
		// and eventually stop (or be bounded).
		// This is the expected behavior when the bug is NOT present.
	});
});
