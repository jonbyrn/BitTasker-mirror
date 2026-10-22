import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionsFromEvent } from '$lib/search/documents.js';
import { handleSearchRequest } from '$lib/search/http.js';
import { DEFAULT_SEARCH_RELAYS, indexerRelays, searchRelays } from '$lib/search/relay.js';
import {
	collectionPrefix,
	applyActions,
	issueSearchOnlyKey,
	parseSearchQuery,
	providerReady,
	resetMemoryIndex,
	resolveProvider,
	searchCollectionNames,
	typoSettings,
	typesenseCollectionName,
	typesenseFilter
} from '$lib/search/search-api.js';

const pubkey = 'ab'.repeat(32);
const eventId = 'cd'.repeat(32);

function taskEvent(status: string, extra: Record<string, unknown> = {}) {
	return {
		kind: 31000,
		id: eventId,
		pubkey,
		created_at: 1_700_000_000,
		tags: [['d', 'sofa-move']],
		content: JSON.stringify({
			title: 'Need a developer',
			description: 'Help moving a sofa',
			status,
			taskType: 'in-person',
			skills: ['Moving'],
			budget: { amount: 80, currency: 'USD' },
			pickupLocation: { displayName: 'Austin, Texas' },
			...extra
		})
	};
}

function env(extra: Record<string, string> = {}) {
	return { SEARCH_PROVIDER: 'memory', INDEXER_SECRET: 'indexer-secret', ...extra };
}

async function index(events: unknown[], secret = 'indexer-secret') {
	return handleSearchRequest(
		new Request('http://localhost/api/search/index', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${secret}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ events })
		}),
		env()
	);
}

describe('search provider', () => {
	it('stays on Meilisearch when Typesense is named but has no server', () => {
		expect(resolveProvider({ SEARCH_PROVIDER: 'typesense' })).toBe('meilisearch');
		expect(providerReady({ SEARCH_PROVIDER: 'typesense' })).toBe(false);
	});

	it('uses Typesense only when the host is set', () => {
		const configured = {
			SEARCH_PROVIDER: 'typesense',
			TYPESENSE_HOST: '127.0.0.1:8108',
			TYPESENSE_API_KEY: 'admin'
		};
		expect(resolveProvider(configured)).toBe('typesense');
		expect(providerReady(configured)).toBe(true);
	});

	it('keeps an explicit Meilisearch flag even if Typesense credentials exist', () => {
		expect(
			resolveProvider({
				SEARCH_PROVIDER: 'meilisearch',
				TYPESENSE_HOST: 'https://search.example',
				TYPESENSE_API_KEY: 'admin',
				MEILISEARCH_HOST: 'https://meili.example',
				MEILISEARCH_API_KEY: 'key'
			})
		).toBe('meilisearch');
	});

	it('reads the listing relay plus the public relays by default', () => {
		expect(DEFAULT_SEARCH_RELAYS).toEqual([
			'wss://relay2.bittasker.com',
			'wss://nos.lol',
			'wss://relay.primal.net'
		]);
		expect(searchRelays({})).toEqual(DEFAULT_SEARCH_RELAYS);
		expect(searchRelays({ VITE_NOSTR_RELAY_URL: 'wss://nos.lol' })).toEqual(DEFAULT_SEARCH_RELAYS);
		expect(searchRelays({ NOSTR_RELAY_URLS: 'wss://relay.example, wss://nos.lol' })).toEqual([
			'wss://relay.example',
			'wss://nos.lol'
		]);
	});
});

describe('search index', () => {
	beforeEach(() => {
		resetMemoryIndex();
	});

	it('indexes an open task and drops a finished one', () => {
		const open = actionsFromEvent(taskEvent('OPEN'));
		expect(open[0]).toMatchObject({
			op: 'upsert',
			collection: 'tasks',
			document: { title: 'Need a developer', price_usd: 80, location: 'Austin, Texas' }
		});
		const closed = actionsFromEvent(taskEvent('COMPLETED'));
		expect(closed).toEqual([expect.objectContaining({ op: 'remove', collection: 'tasks' })]);
	});

	it('allows two typos on long words and none on short ones', () => {
		expect(typoSettings('cleaning').num_typos).toBe(2);
		expect(typoSettings('move').num_typos).toBe(1);
		expect(typoSettings('ai').num_typos).toBe(0);
	});

	it('leaves the Typesense filter empty when the search has no limits', () => {
		expect(typesenseFilter(parseSearchQuery({ q: 'sofa' }))).toBe('');
	});

	it('filters price, place, and category for Typesense', () => {
		const filter = typesenseFilter(
			parseSearchQuery({
				q: 'sofa',
				category: 'moving',
				minPrice: '20',
				location: 'Austin',
				remote: 'local'
			})
		);
		expect(filter).toContain('category:=`moving`');
		expect(filter).toContain('price_usd:>=20');
		expect(filter).toContain('remote:=false');
		expect(filter).toContain('location_tokens:=`austin`');
	});

	it('rejects index writes without the indexer secret', async () => {
		const response = await index([taskEvent('OPEN')], 'nope');
		expect(response.status).toBe(401);
	});

	it('finds an English task from its Spanish category name', async () => {
		const event = taskEvent('OPEN', {
			title: 'Tidy the kitchen',
			description: 'Counters and floor',
			skills: ['Cleaning']
		});
		const action = actionsFromEvent(event)[0];
		expect(action.document.category).toBe('cleaning');
		expect(action.document.title_es).toContain('Limpieza');

		await index([event]);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=limpieza'),
			env()
		);
		const body = await response.json();
		expect(body.tasks.map((hit: { title: string }) => hit.title)).toContain('Tidy the kitchen');
	});

	it('searches tasks with a Spanish synonym and a one-character typo', async () => {
		const saved = await index([taskEvent('OPEN')]);
		expect(saved.status).toBe(200);

		const spanish = await handleSearchRequest(
			new Request('http://localhost/api/search?q=desarrollador'),
			env()
		);
		const spanishBody = await spanish.json();
		expect(spanishBody.provider).toBe('memory');
		expect(spanishBody.tasks.map((hit: { title: string }) => hit.title)).toContain(
			'Need a developer'
		);

		const typo = await handleSearchRequest(
			new Request('http://localhost/api/search?q=movng'),
			env()
		);
		const typoBody = await typo.json();
		expect(typoBody.tasks.map((hit: { title: string }) => hit.title)).toContain('Need a developer');
	});

	it('removes a task after a deletion event', async () => {
		await index([taskEvent('OPEN')]);
		await index([
			{
				kind: 5,
				id: 'ee'.repeat(32),
				pubkey,
				created_at: 1_700_000_100,
				tags: [['a', `31000:${pubkey}:sofa-move`]],
				content: ''
			}
		]);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=developer'),
			env()
		);
		const body = await response.json();
		expect(body.tasks).toEqual([]);
	});

	it('reports Meilisearch as not ready when the host is missing', async () => {
		const response = await handleSearchRequest(new Request('http://localhost/api/search/health'), {
			SEARCH_PROVIDER: 'meilisearch'
		});
		expect(await response.json()).toEqual({ provider: 'meilisearch', ready: false });
	});
});

describe('typesense collection prefix', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('leaves collection names unchanged when the prefix is empty', () => {
		expect(collectionPrefix({})).toBe('');
		expect(searchCollectionNames({})).toEqual(['tasks', 'services', 'profiles', 'shifts']);
		expect(typesenseCollectionName({}, 'tasks')).toBe('tasks');
	});

	it('scopes search and the search-only key to the prefixed collections', async () => {
		expect(typesenseCollectionName({ TYPESENSE_COLLECTION_PREFIX: 'rgb_' }, 'tasks')).toBe(
			'rgb_tasks'
		);
		expect(() => collectionPrefix({ TYPESENSE_COLLECTION_PREFIX: '../tasks' })).toThrow(
			/TYPESENSE_COLLECTION_PREFIX/
		);

		let keyBody = '';
		const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
			const target = String(url);
			if (target.endsWith('/keys')) {
				keyBody = String(init?.body || '');
				return new Response(JSON.stringify({ value: 'scoped-key' }), { status: 200 });
			}
			const payload = JSON.parse(String(init?.body || '{}')) as {
				searches?: Array<{ collection: string }>;
			};
			expect(payload.searches?.map((search) => search.collection)).toEqual(['dev_tasks']);
			return new Response(
				JSON.stringify({
					results: [
						{
							hits: [{ document: { id: '1', title: 'Need a developer', public_id: 'sofa' } }],
							facet_counts: []
						}
					]
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);

		const key = await issueSearchOnlyKey({
			TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
			TYPESENSE_API_KEY: 'admin',
			TYPESENSE_COLLECTION_PREFIX: 'rgb_'
		});
		expect(key).toBe('scoped-key');
		expect(JSON.parse(keyBody).collections).toEqual([
			'rgb_tasks',
			'rgb_services',
			'rgb_profiles',
			'rgb_shifts'
		]);

		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=developer&type=task'),
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_SEARCH_ONLY_KEY: 'search-only',
				TYPESENSE_COLLECTION_PREFIX: 'dev_'
			}
		);
		const body = await response.json();
		expect(body.provider).toBe('typesense');
		expect(body.tasks.map((hit: { title: string }) => hit.title)).toContain('Need a developer');
	});

	it('reports the returned task hits when Typesense found is larger', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(
						JSON.stringify({
							results: [
								{
									found: 555,
									hits: [
										{ document: { id: 'test-dev-tasks-0', title: '[TEST] Logo', price_usd: 25 } },
										{
											document: { id: 'test-dev-tasks-1', title: '[TEST] Lightning', price_usd: 35 }
										}
									],
									facet_counts: []
								}
							]
						}),
						{ status: 200 }
					)
			)
		);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=TEST&type=task'),
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_SEARCH_ONLY_KEY: 'search-only',
				TYPESENSE_COLLECTION_PREFIX: 'dev_'
			}
		);
		const body = await response.json();
		expect(body.tasks).toHaveLength(2);
		expect(body.total).toBe(2);
		expect(body.found).toBeUndefined();
		expect(body.tasks[0].budget.amount).toBe(25);
		expect(body.tasks[1].budget.amount).toBe(35);
	});

	it('writes indexer updates into the prefixed collection', async () => {
		const urls: string[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string) => {
				urls.push(String(url));
				return new Response('{}', { status: 200 });
			})
		);
		await applyActions(
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_API_KEY: 'admin',
				TYPESENSE_COLLECTION_PREFIX: 'rgb_'
			},
			[{ op: 'upsert', collection: 'tasks', document: { id: '1', title: 'Sofa' } }]
		);
		expect(urls).toEqual([
			'https://typesense-dev.bittasker.com/collections/rgb_tasks/documents?action=upsert'
		]);
	});

	it('uses Meilisearch when Typesense returns an error', async () => {
		const fetchMock = vi.fn(async (url: string) => {
			const target = String(url);
			if (target.includes('typesense-dev.bittasker.com')) {
				return new Response('down', { status: 503 });
			}
			return new Response(
				JSON.stringify({
					hits: [{ id: 'sofa', title: 'Move a sofa', type: 'task', kind: 31000 }]
				}),
				{ status: 200 }
			);
		});
		vi.stubGlobal('fetch', fetchMock);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=sofa&type=task'),
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_SEARCH_ONLY_KEY: 'search-only',
				TYPESENSE_COLLECTION_PREFIX: 'dev_',
				MEILISEARCH_HOST: 'https://meili.example',
				MEILISEARCH_API_KEY: 'key'
			}
		);
		const body = await response.json();
		expect(body.provider).toBe('meilisearch');
		expect(body.tasks.map((hit: { title: string }) => hit.title)).toContain('Move a sofa');
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('reads dev relays for dev_ and sandbox relays for rgb_ when none are set', () => {
		expect(indexerRelays({ TYPESENSE_COLLECTION_PREFIX: 'dev_' })).toEqual([
			'wss://relay1-dev.bittasker.com',
			'wss://relay2-dev.bittasker.com'
		]);
		expect(indexerRelays({ TYPESENSE_COLLECTION_PREFIX: 'rgb_' })).toEqual([
			'wss://relay.bittasker.com',
			'wss://nos.lol',
			'wss://relay.primal.net'
		]);
		expect(indexerRelays({})).toEqual(DEFAULT_SEARCH_RELAYS);
		expect(
			indexerRelays({
				TYPESENSE_COLLECTION_PREFIX: 'dev_',
				NOSTR_RELAY_URLS: 'wss://relay.example'
			})
		).toEqual(['wss://relay.example']);
	});
});
