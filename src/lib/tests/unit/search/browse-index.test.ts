import { describe, expect, it } from 'vitest';
import { benchmarkMemorySearch } from '$lib/search/benchmark.js';
import {
	cacheIndexHit,
	categoriesWithListings,
	countsFromRows,
	indexSuppliesListings,
	readCachedHit,
	INDEX_TIMEOUT_MS
} from '$lib/search/browse-index';
import { hitFromTask, taskFromIndexHit } from '$lib/search/detail-preview';
import { listingCategory, tasksForTileCounts } from '$lib/search/category-counts';
import { suggestStaffRole } from '$lib/staffing/suggest-role';

describe('browse index helpers', () => {
	it('hides categories that have no listings and keeps the counts', () => {
		const counts = countsFromRows([
			{ categoryId: 'cleaning' },
			{ categoryId: 'cleaning' },
			{ categoryId: 'design' }
		]);
		expect(counts).toEqual({ cleaning: 2, design: 1 });
		expect(
			categoriesWithListings(
				[{ id: 'cleaning' }, { id: 'painting' }, { id: 'design' }],
				counts
			).map((category) => category.id)
		).toEqual(['cleaning', 'design']);
	});

	it('sends browse to the relay when search errors, is not ready, or has no hits', () => {
		expect(INDEX_TIMEOUT_MS).toBe(2000);
		expect(indexSuppliesListings(null, 'tasks')).toBe(false);
		expect(
			indexSuppliesListings(
				{ provider: 'meilisearch', ready: false, tasks: [{ id: 'a' }] },
				'tasks'
			)
		).toBe(false);
		expect(
			indexSuppliesListings({ provider: 'typesense', ready: false, tasks: [{ id: 'a' }] }, 'tasks')
		).toBe(false);
		expect(indexSuppliesListings({ provider: 'typesense', ready: true, tasks: [] }, 'tasks')).toBe(
			false
		);
		expect(
			indexSuppliesListings({ provider: 'typesense', ready: true, tasks: [{ id: 'a' }] }, 'tasks')
		).toBe(true);
		expect(
			indexSuppliesListings({ provider: 'meilisearch', ready: true, tasks: [{ id: 'a' }] }, 'tasks')
		).toBe(true);
	});

	it('builds a task the detail page can render before the relay answers', () => {
		const task = taskFromIndexHit(
			{
				public_id: 'cleaner',
				title: 'Trusted Cleaner en La Costa',
				description: 'House clean',
				price_usd: 40,
				category: 'cleaning',
				location: 'La Costa',
				remote: false,
				status: 'OPEN',
				pubkey: 'ab'
			},
			'cleaner'
		);
		expect(task.title).toBe('Trusted Cleaner en La Costa');
		expect(task.budget.amount).toBe(40);
		expect(task.searchCategory).toBe('cleaning');
	});

	it('paints a detail from the list row without waiting on the relay', () => {
		const hit = hitFromTask({
			id: 'sofa',
			title: 'Help move my sofa',
			description: 'Up the stairs',
			status: 'OPEN',
			deadline: '2026-04-11T23:59:59.999Z',
			budget: { amount: 10 },
			pickupLocation: { displayName: 'Lourdes' },
			npub: 'abc'
		});
		cacheIndexHit('task', 'sofa', hit);
		const cached = readCachedHit('task', 'sofa');
		expect(cached?.title).toBe('Help move my sofa');
		expect(taskFromIndexHit(cached || {}, 'sofa').deadline).toBe('2026-04-11T23:59:59.999Z');
		expect(taskFromIndexHit(cached || {}, 'sofa').budget.amount).toBe(10);
	});

	it('uses the homepage category match for a category page', () => {
		const cleaning = {
			title: 'Limpieza profunda de la cocina',
			description: '',
			skills: [],
			categories: [{ id: '6', name: 'Automotive' }],
			status: 'OPEN',
			deadline: '2099-01-01',
			npub: 'a',
			createdAt: 1,
			budget: { amount: 20, currency: 'USD', type: 'FIXED' }
		};
		expect(listingCategory(cleaning)?.category).toBe('cleaning');
		const rows = tasksForTileCounts([
			cleaning as never,
			{ ...cleaning, createdAt: 2 } as never,
			{
				...cleaning,
				npub: 'expired',
				status: 'OPEN',
				deadline: '2020-01-01',
				createdAt: 3
			} as never
		]);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.status).toBe('OPEN');
		expect(rows[0]?.createdAt).toBe(2);
	});

	it('suggests a shift role and leaves an explicit choice alone', () => {
		expect(suggestStaffRole('Cleaning shift in La Libertad', '')).toBe('cleaning');
		expect(suggestStaffRole('Limpieza de oficina', 'traer trapeador')).toBe('cleaning');
		expect(suggestStaffRole('Something odd', '')).toBe('');
	});

	it('keeps in-memory search under a second at p50', async () => {
		const measured = await benchmarkMemorySearch();
		console.log(
			`search p50: ${measured.p50.toFixed(2)}ms (${measured.iterations} samples, ${measured.provider})`
		);
		expect(measured.p50).toBeLessThan(1000);
	});
});
