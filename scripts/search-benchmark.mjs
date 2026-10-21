import { benchmarkMemorySearch } from '../src/lib/search/benchmark.js';

const measured = await benchmarkMemorySearch();
console.log(
	`search p50: ${measured.p50.toFixed(2)}ms (${measured.iterations} samples, ${measured.provider})`
);
if (measured.p50 >= 1000) {
	console.error('p50 is not under 1s');
	process.exitCode = 1;
}

const host = process.env.TYPESENSE_HOST;
const key = process.env.TYPESENSE_SEARCH_ONLY_KEY || process.env.TYPESENSE_API_KEY;
if (host && key) {
	const base = host.startsWith('http') ? host : `http://${host}`;
	const samples = [];
	for (let index = 0; index < 11; index += 1) {
		const started = performance.now();
		const response = await fetch(
			`${base.replace(/\/$/, '')}/collections/tasks/documents/search?q=cleaner&query_by=title&per_page=8`,
			{ headers: { 'X-TYPESENSE-API-KEY': key } }
		);
		if (!response.ok) {
			console.error(`Typesense benchmark failed (${response.status})`);
			process.exitCode = 1;
			break;
		}
		await response.json();
		samples.push(performance.now() - started);
	}
	if (samples.length) {
		samples.sort((left, right) => left - right);
		const p50 = samples[Math.floor(samples.length / 2)];
		console.log(`typesense p50: ${p50.toFixed(2)}ms`);
		if (p50 >= 1000) process.exitCode = 1;
	}
}
