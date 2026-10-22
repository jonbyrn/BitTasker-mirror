import { describe, expect, it, vi } from 'vitest';
import {
	LISTING_SEARCH_DEBOUNCE_MS,
	fetchListingSearch,
	filterHitsByCategories,
	listingSearchPath,
	readSearchQueryParam,
	replaceSearchQueryParam,
	searchCategoryIdsForFilters,
	servicesFromSearchBody,
	tasksFromSearchBody
} from '$lib/search/listing-search';

describe('listing search', () => {
	it('waits about 250ms between keystrokes', () => {
		expect(LISTING_SEARCH_DEBOUNCE_MS).toBe(250);
	});

	it('percent-encodes ñ and accents and keeps the type filter', () => {
		const path = listingSearchPath({ q: 'niña café', type: 'task' });
		expect(path.startsWith('/api/search?')).toBe(true);
		expect(path).not.toContain('ñ');
		expect(path).not.toContain('é');
		const params = new URLSearchParams(path.slice('/api/search?'.length));
		expect(params.get('q')).toBe('niña café');
		expect(params.get('type')).toBe('task');
		expect(params.get('perPage')).toBe('60');
	});

	it('sends legacy category ids as Typesense categories alongside the query', () => {
		const path = listingSearchPath({
			q: 'limpiesa',
			type: 'service',
			categoryIds: ['1', 'cleaning']
		});
		const params = new URLSearchParams(path.slice('/api/search?'.length));
		expect(params.get('type')).toBe('service');
		expect(params.get('q')).toBe('limpiesa');
		expect(params.get('category')?.split(',').sort()).toEqual(['cleaning']);
		expect(searchCategoryIdsForFilters(['1', '3'])).toEqual(['cleaning', 'removals']);
	});

	it('reads and writes the ?q= param without dropping other filters', () => {
		expect(readSearchQueryParam('https://rgb.bittasker.com/tasks?q=limpiesa')).toBe('limpiesa');
		const next = replaceSearchQueryParam(
			'https://rgb.bittasker.com/tasks?category=cleaning',
			'niña'
		);
		const params = new URL(next).searchParams;
		expect(params.get('q')).toBe('niña');
		expect(params.get('category')).toBe('cleaning');
		expect(new URL(replaceSearchQueryParam(next, '')).searchParams.get('q')).toBeNull();
	});

	it('maps task and service hits and keeps only the selected categories', () => {
		const body = {
			tasks: [
				{
					public_id: 'task-1',
					title: 'Lavado de ventanas',
					description: 'Vidrios',
					category: 'cleaning',
					price_usd: 20,
					budget: { amount: 20, currency: 'USD', type: 'FIXED' },
					pubkey: 'ab'.repeat(32),
					status: 'OPEN'
				},
				{ public_id: 'task-2', title: 'Mudanza', category: 'moving', price_usd: 40 }
			],
			services: [
				{
					public_id: 'service-1',
					title: 'Limpieza',
					category: 'cleaning',
					price_usd: 30,
					remote: false
				}
			]
		};
		expect(tasksFromSearchBody(body, ['1']).map((task) => task.title)).toEqual([
			'Lavado de ventanas'
		]);
		expect(tasksFromSearchBody(body, ['1'])[0].budget.amount).toBe(20);
		expect(servicesFromSearchBody(body).map((service) => service.uniqueId)).toEqual(['service-1']);
		expect(filterHitsByCategories(body.tasks, [])).toHaveLength(2);
	});

	it('aborts an in-flight search when the signal is cancelled', async () => {
		const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
			return new Promise((_resolve, reject) => {
				init?.signal?.addEventListener('abort', () => {
					const error = new DOMException('Aborted', 'AbortError');
					reject(error);
				});
			});
		});
		vi.stubGlobal('fetch', fetchMock);
		const controller = new AbortController();
		const pending = fetchListingSearch('/api/search?q=limpiesa&type=task', controller.signal);
		controller.abort();
		await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
		expect(String(fetchMock.mock.calls[0][0])).toContain('/api/search?q=limpiesa');
		vi.unstubAllGlobals();
	});
});
