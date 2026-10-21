import { describe, expect, it } from 'vitest';
import { benchmarkMemorySearch } from '$lib/search/benchmark.js';
import { categoriesWithListings, countsFromRows } from '$lib/search/browse-index';
import { taskFromIndexHit } from '$lib/search/detail-preview';
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
