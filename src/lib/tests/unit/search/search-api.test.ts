import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actionsFromEvent } from '$lib/search/documents.js';
import { handleSearchRequest } from '$lib/search/http.js';
import { DEFAULT_SEARCH_RELAYS, indexerRelays, searchRelays } from '$lib/search/relay.js';
import {
	collectionPrefix,
	collectionSchema,
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

	it('ORs several categories and decodes an encoded ñ', () => {
		expect(typesenseFilter(parseSearchQuery({ category: 'cleaning,moving' }))).toBe(
			'category:=[`cleaning`,`moving`]'
		);
		expect(parseSearchQuery({ q: 'ni%C3%B1a' }).q).toBe('niña');
		expect(parseSearchQuery(new URLSearchParams('q=ni%C3%B1a&type=task')).q).toBe('niña');
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

	it('accepts a percent-encoded ñ instead of rejecting the query', async () => {
		const response = await handleSearchRequest(
			new Request(`http://localhost/api/search?q=${encodeURIComponent('niña')}&type=task`),
			env()
		);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.query).toBe('niña');
		expect(body.tasks).toEqual([]);
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
		expect(searchCollectionNames({})).toEqual([
			'tasks',
			'services',
			'profiles',
			'shifts',
			'listings'
		]);
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
			'rgb_shifts',
			'rgb_listings'
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

describe('hybrid search and goods listings', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('indexes an active goods listing and removes a sold one', () => {
		const event = {
			kind: 31160,
			id: eventId,
			pubkey,
			created_at: 20,
			tags: [['d', 'roof-1']],
			content: JSON.stringify({
				v: 1,
				listing: {
					title: 'Techos y goteras',
					description: 'Reparación de techos',
					category: 'home',
					offer: 'sell',
					priceUsd: 40,
					status: 'active',
					location: 'San Salvador'
				}
			})
		};
		const indexed = actionsFromEvent(event)[0];
		expect(indexed).toMatchObject({
			op: 'upsert',
			collection: 'listings',
			document: {
				title: 'Techos y goteras',
				description: 'Reparación de techos',
				url: '/browse/goods/roof-1',
				price_usd: 40
			}
		});
		const sold = actionsFromEvent({
			...event,
			content: JSON.stringify({
				listing: { title: 'Techos y goteras', priceUsd: 40, status: 'sold' }
			})
		})[0];
		expect(sold).toMatchObject({ op: 'remove', collection: 'listings' });
	});

	it('adds an optional embedding field without changing the task budget schema', () => {
		const fields = collectionSchema('tasks', { QVAC_EMBED_DIM: '4' }).fields as Array<{
			name: string;
			num_dim?: number;
			optional?: boolean;
		}>;
		const embedding = fields.find((field) => field.name === 'embedding');
		expect(embedding).toMatchObject({ num_dim: 4, optional: true });
		expect(fields.some((field) => field.name === 'price_usd')).toBe(true);
	});

	it('keeps keyword hits when the embedder fails', async () => {
		const bodies: Array<{ searches?: Array<{ vector_query?: string }> }> = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (String(url).includes('/v1/embeddings')) throw new Error('embed down');
				bodies.push(JSON.parse(String(init?.body || '{}')));
				return new Response(
					JSON.stringify({
						results: [
							{
								hits: [{ document: { id: '1', title: 'Techos y goteras', public_id: 'roof' } }],
								facet_counts: []
							}
						]
					}),
					{ status: 200 }
				);
			})
		);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=fix+my+leaking+roof&type=task'),
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_SEARCH_ONLY_KEY: 'search-only',
				TYPESENSE_COLLECTION_PREFIX: 'rgb_',
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434'
			}
		);
		const body = await response.json();
		expect(body.tasks.map((hit: { title: string }) => hit.title)).toContain('Techos y goteras');
		expect(bodies[0].searches?.[0].vector_query).toBeUndefined();
	});

	it('sends a hybrid query and retries keyword search when the vector field is rejected', async () => {
		const bodies: Array<{ searches?: Array<{ vector_query?: string; exclude_fields?: string }> }> =
			[];
		let searches = 0;
		vi.stubGlobal(
			'fetch',
			vi.fn(async (url: string, init?: RequestInit) => {
				if (String(url).includes('/v1/embeddings')) {
					return new Response(JSON.stringify({ data: [{ index: 0, embedding: [0.2, 0.8] }] }), {
						status: 200
					});
				}
				bodies.push(JSON.parse(String(init?.body || '{}')));
				searches += 1;
				if (searches === 1) return new Response('unknown field', { status: 400 });
				return new Response(
					JSON.stringify({
						results: [
							{
								hits: [{ document: { id: '1', title: 'Techos y goteras', public_id: 'roof' } }],
								facet_counts: []
							}
						]
					}),
					{ status: 200 }
				);
			})
		);
		const response = await handleSearchRequest(
			new Request('http://localhost/api/search?q=fix+my+leaking+roof&type=task'),
			{
				SEARCH_PROVIDER: 'typesense',
				TYPESENSE_HOST: 'https://typesense-dev.bittasker.com',
				TYPESENSE_SEARCH_ONLY_KEY: 'search-only',
				TYPESENSE_COLLECTION_PREFIX: 'dev_',
				QVAC_ENABLED: 'true',
				QVAC_BASE_URL: 'http://127.0.0.1:11434',
				QVAC_EMBED_DIM: '2'
			}
		);
		const body = await response.json();
		expect(body.tasks[0].title).toBe('Techos y goteras');
		expect(bodies[0].searches?.[0].vector_query).toContain('embedding:([0.2,0.8]');
		expect(bodies[0].searches?.[0].exclude_fields).toBe('embedding');
		expect(bodies[1].searches?.[0].vector_query).toBeUndefined();
	});
});
