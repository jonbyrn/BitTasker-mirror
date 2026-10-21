import { beforeEach, describe, expect, it } from 'vitest';
import { actionsFromEvent } from '$lib/search/documents.js';
import { handleSearchRequest } from '$lib/search/http.js';
import { DEFAULT_SEARCH_RELAYS, searchRelays } from '$lib/search/relay.js';
import {
	parseSearchQuery,
	providerReady,
	resetMemoryIndex,
	resolveProvider,
	typoSettings,
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
			attachments: [{ url: 'https://cdn.example/sofa.jpg', type: 'image/jpeg' }],
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
			'wss://relay.bittasker.com',
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
			document: {
				title: 'Need a developer',
				price_usd: 80,
				location: 'Austin, Texas',
				image: 'https://cdn.example/sofa.jpg'
			}
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
