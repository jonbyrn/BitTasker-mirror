import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, beforeEach } from 'vitest';
import { INDEXER_KINDS, planIndexBatch } from '$lib/search/index-plan.js';
import { applyActions, resetMemoryIndex } from '$lib/search/search-api.js';
import { handleSearchRequest } from '$lib/search/http.js';
import { peopleCopy } from '$lib/people/copy';
import { routeDocumentTitle } from '$lib/seo/route-titles';

const ana = 'aa'.repeat(32);
const luis = 'bb'.repeat(32);
const cafe = 'cc'.repeat(32);
const nameless = 'dd'.repeat(32);

function kind0(pubkey: string, createdAt: number, content: Record<string, unknown>) {
	return {
		kind: 0,
		id: '11'.repeat(32),
		pubkey,
		created_at: createdAt,
		tags: [],
		content: JSON.stringify(content),
		sig: ''
	};
}

describe('people index', () => {
	beforeEach(() => {
		resetMemoryIndex();
	});

	it('indexes kind 0 through the batch planner and returns accented names', async () => {
		expect(INDEXER_KINDS.slice(0, 5)).toEqual([31000, 30402, 30403, 31150, 31160]);
		expect(INDEXER_KINDS.slice(-2)).toEqual([0, 30000]);
		expect(readFileSync(resolve('scripts/typesense-indexer.mjs'), 'utf8')).toContain(
			'INDEXER_KINDS'
		);
		expect(readFileSync(resolve('scripts/typesense-indexer.mjs'), 'utf8')).toContain(
			'profile authors='
		);
		expect(readFileSync(resolve('scripts/search-sync.mjs'), 'utf8')).toContain('0, 30000');
		expect(readFileSync(resolve('docs/typesense-sandbox.md'), 'utf8')).toContain(
			'INDEXER_ONCE=true'
		);

		const planned = planIndexBatch(
			[
				kind0(ana, 100, {
					display_name: 'Ana Diseñador',
					about: 'Diseño de marcas',
					picture: 'http://insecure.example/a.png'
				}),
				kind0(ana, 50, { display_name: 'Old Ana' }),
				kind0(luis, 80, {
					name: 'Luis Pérez',
					about: 'Limpieza de apartamentos',
					location: 'San Salvador'
				}),
				kind0(cafe, 90, { display_name: 'Café Luna', about: 'Barista' }),
				kind0('short', 90, { display_name: 'Nope' }),
				kind0(nameless, 10, { display_name: 'Temp' }),
				kind0(nameless, 20, { about: 'gone' })
			],
			Date.parse('2026-10-22T21:00:00Z')
		);
		await applyActions({ SEARCH_PROVIDER: 'memory' }, planned.actions);

		async function search(q: string, category = '') {
			const params = new URLSearchParams({ type: 'profile', perPage: '60' });
			if (q) params.set('q', q);
			if (category) params.set('category', category);
			const response = await handleSearchRequest(
				new Request(`http://localhost/api/search?${params.toString()}`),
				{ SEARCH_PROVIDER: 'memory' }
			);
			expect(response.status).toBe(200);
			return response.json();
		}

		const all = await search('');
		expect(all.profiles.map((hit: { title: string }) => hit.title).sort()).toEqual([
			'Ana Diseñador',
			'Café Luna',
			'Luis Pérez'
		]);
		expect(all.tasks).toEqual([]);

		const designer = await search('diseñador');
		expect(designer.query).toBe('diseñador');
		expect(designer.profiles.map((hit: { title: string }) => hit.title)).toEqual(['Ana Diseñador']);
		expect(designer.profiles[0].picture).toBe('');

		expect((await search('limpieza')).profiles.map((hit: { title: string }) => hit.title)).toEqual([
			'Luis Pérez'
		]);
		expect((await search('café')).profiles.map((hit: { title: string }) => hit.title)).toEqual([
			'Café Luna'
		]);

		const encoded = await handleSearchRequest(
			new Request(`http://localhost/api/search?type=profile&q=${encodeURIComponent('diseñador')}`),
			{ SEARCH_PROVIDER: 'memory' }
		);
		const encodedBody = await encoded.json();
		expect(encodedBody.query).toBe('diseñador');
		expect(encodedBody.profiles).toHaveLength(1);

		const filtered = await search('limpieza', 'cleaning');
		expect(filtered.profiles.map((hit: { title: string }) => hit.title)).toEqual(['Luis Pérez']);
	});

	it('names the people page in English and Spanish', () => {
		expect(peopleCopy('en').title).toBe('People');
		expect(peopleCopy('es').title).toBe('Personas');
		expect(peopleCopy('es').placeholder).toBe('Buscar personas');
		expect(routeDocumentTitle('/people', 'es')).toBe('Personas · BitTasker');
		expect(routeDocumentTitle('/people', 'en')).toBe('People · BitTasker');
	});
});
