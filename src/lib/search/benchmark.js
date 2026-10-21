import { applyActions, parseSearchQuery, resetMemoryIndex, searchByType } from './search-api.js';

/**
 * Time in-memory search. Typesense is optional and measured by the CLI when configured.
 * @param {number} [iterations]
 */
export async function benchmarkMemorySearch(iterations = 21) {
	resetMemoryIndex();
	const events = Array.from({ length: 40 }, (_, index) => ({
		op: 'upsert',
		collection: 'tasks',
		document: {
			id: `task_bench_${index}`,
			public_id: `bench-${index}`,
			title: index % 2 === 0 ? 'Trusted Cleaner en La Costa' : 'Landing Page Development',
			description: 'El Salvador sandbox listing',
			category: index % 2 === 0 ? 'cleaning' : 'development',
			price_usd: 20 + index,
			location: 'La Libertad',
			location_tokens: ['libertad'],
			remote: index % 2 === 1,
			created_at: 1_700_000_000 + index,
			status: 'OPEN',
			pubkey: 'ab'.repeat(32),
			type: 'task'
		}
	}));
	await applyActions({ SEARCH_PROVIDER: 'memory' }, events);
	/** @type {number[]} */
	const samples = [];
	for (let index = 0; index < iterations; index += 1) {
		const started = performance.now();
		await searchByType(
			{ SEARCH_PROVIDER: 'memory' },
			parseSearchQuery({ q: 'cleaner', type: 'task', perPage: '20' })
		);
		samples.push(performance.now() - started);
	}
	samples.sort((left, right) => left - right);
	const p50 = samples[Math.floor(samples.length / 2)] || 0;
	return { p50, iterations: samples.length, provider: 'memory' };
}
