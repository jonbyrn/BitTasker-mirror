import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchCatalog,
	mapCatalogService,
	mapCatalogShift,
	mapCatalogTask
} from '$lib/search/catalog-client';

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'content-type': 'application/json' }
	});
}

describe('fetchCatalog', () => {
	beforeEach(() => {
		vi.unstubAllGlobals();
	});

	it('returns every indexed hit and does not ask the relay when Typesense is ready', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/api/search/health')) {
				return jsonResponse({ provider: 'typesense', ready: true });
			}
			return jsonResponse({
				provider: 'typesense',
				ready: true,
				tasks: [
					{ id: 'task-a', public_id: 'pub-a', title: 'Pintar', pubkey: 'aa', status: 'OPEN' },
					{ id: 'task-b', public_id: 'pub-b', title: 'Reparar', pubkey: 'bb', status: 'OPEN' }
				],
				found: 2,
				total: 2
			});
		});

		const catalog = await fetchCatalog('task', 'pintar', fetchImpl);
		expect(catalog).toEqual({
			ready: true,
			hits: [
				{ id: 'task-a', public_id: 'pub-a', title: 'Pintar', pubkey: 'aa', status: 'OPEN' },
				{ id: 'task-b', public_id: 'pub-b', title: 'Reparar', pubkey: 'bb', status: 'OPEN' }
			]
		});
		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(String(fetchImpl.mock.calls[1][0])).toContain('type=task');
		expect(String(fetchImpl.mock.calls[1][0])).toContain('perPage=60');
		expect(String(fetchImpl.mock.calls[1][0])).toContain('q=pintar');
	});

	it('returns an empty list when Typesense is ready and the query has no hits', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/health')) return jsonResponse({ provider: 'typesense', ready: true });
			return jsonResponse({ provider: 'typesense', ready: true, services: [], found: 0, total: 0 });
		});

		await expect(fetchCatalog('service', '', fetchImpl)).resolves.toEqual({
			ready: true,
			hits: []
		});
		expect(String(fetchImpl.mock.calls[1][0])).not.toContain('q=');
	});

	it('returns an empty list when the search request fails after Typesense is ready', async () => {
		const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input).includes('/health')) {
				return jsonResponse({ provider: 'typesense', ready: true });
			}
			return jsonResponse({ error: 'down' }, 500);
		});

		await expect(fetchCatalog('shift', 'suchitoto', fetchImpl)).resolves.toEqual({
			ready: true,
			hits: []
		});
	});

	it('returns null when search is not the Typesense catalog', async () => {
		const fetchImpl = vi.fn(async () => jsonResponse({ provider: 'memory', ready: true }));
		await expect(fetchCatalog('task', '', fetchImpl)).resolves.toBeNull();
		expect(fetchImpl).toHaveBeenCalledTimes(1);
	});

	it('returns null when the health check cannot be reached', async () => {
		const fetchImpl = vi.fn(async () => {
			throw new TypeError('Failed to parse URL');
		});
		await expect(fetchCatalog('task', '', fetchImpl)).resolves.toBeNull();
	});
});

describe('catalog card mapping', () => {
	it('keeps two task documents with different ids', () => {
		const tasks = [
			mapCatalogTask({
				id: 'task_one',
				public_id: 'probe-a',
				title: 'probe',
				pubkey: 'aa',
				status: 'OPEN',
				created_at: 10,
				remote: false,
				budget: { amount: 20, currency: 'USD', type: 'FIXED' }
			}),
			mapCatalogTask({
				id: 'task_two',
				public_id: 'probe-b',
				title: 'probe',
				pubkey: 'bb',
				status: 'OPEN',
				created_at: 11,
				remote: true
			})
		];
		expect(tasks.map((task) => task.id)).toEqual(['probe-a', 'probe-b']);
		expect(tasks[0].budget.amount).toBe(20);
		expect(tasks[1].taskType).toBe('remote');
		expect(tasks[0].npub).toBe('aa');
	});

	it('maps a service hit onto the card fields', () => {
		const service = mapCatalogService({
			id: 'svc-row',
			event_id: 'event-1',
			public_id: 'limpieza',
			title: 'Limpieza',
			description: 'Hogar',
			pubkey: 'cc',
			status: 'active',
			pricing: { type: 'INQUIRY_REQUIRED', amount: 0, currency: 'USD' },
			skills: ['cleaning'],
			serviceLocationTypes: ['REMOTE'],
			created_at: 20
		});
		expect(service.id).toBe('event-1');
		expect(service.uniqueId).toBe('limpieza');
		expect(service.pricing.type).toBe('INQUIRY_REQUIRED');
		expect(service.serviceLocationTypes).toEqual(['REMOTE']);
		expect(service.createdAt).toBe(20);
	});

	it('maps a shift hit for the staff list', () => {
		const shift = mapCatalogShift({
			id: 'shift-1',
			title: 'Turno',
			description: 'Suchitoto',
			status: 'open',
			pubkey: 'dd',
			created_at: 30
		});
		expect(shift).toMatchObject({
			id: 'shift-1',
			title: 'Turno',
			description: 'Suchitoto',
			status: 'open',
			npub: 'dd',
			createdAt: 30
		});
	});
});
