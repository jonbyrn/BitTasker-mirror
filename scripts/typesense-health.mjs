/**
 * Fail if Typesense /health or /api/search/counts does not respond.
 * Prints status only. Never prints keys.
 */
import http from 'node:http';
import { readEnvFile } from '../src/lib/search/search-key-file.js';
import { handleSearchRequest } from '../src/lib/search/http.js';

const file = process.env.TYPESENSE_ENV_FILE || '/opt/bittasker/typesense.env';
const stored = await readEnvFile(file);
const host = String(process.env.TYPESENSE_HOST || stored.TYPESENSE_HOST || '').replace(/\/$/, '');
const env = {
	TYPESENSE_HOST: host,
	TYPESENSE_API_KEY: process.env.TYPESENSE_API_KEY || stored.TYPESENSE_API_KEY || '',
	TYPESENSE_SEARCH_ONLY_KEY: stored.TYPESENSE_SEARCH_ONLY_KEY || '',
	TYPESENSE_COLLECTION_PREFIX:
		process.env.TYPESENSE_COLLECTION_PREFIX || stored.TYPESENSE_COLLECTION_PREFIX || '',
	SEARCH_PROVIDER: 'typesense'
};

if (!host || !env.TYPESENSE_SEARCH_ONLY_KEY) {
	console.error('Typesense health check is missing the host or the search-only key');
	process.exit(1);
}

const health = await fetch(`${host}/health`, { signal: AbortSignal.timeout(10000) });
if (!health.ok) {
	console.error(`Typesense health failed status=${health.status}`);
	process.exit(1);
}
console.log('typesense health: ok');

const server = http.createServer(async (req, res) => {
	try {
		const request = new Request(new URL(req.url || '/', 'http://127.0.0.1'), {
			method: req.method || 'GET'
		});
		const response = await handleSearchRequest(request, env);
		const body = Buffer.from(await response.arrayBuffer());
		res.statusCode = response.status;
		res.setHeader('content-type', 'application/json');
		res.end(body);
	} catch {
		res.statusCode = 500;
		res.end('{"error":"search failed"}');
	}
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
const address = server.address();
const port = address && typeof address === 'object' ? address.port : 0;

try {
	const counts = await fetch(`http://127.0.0.1:${port}/api/search/counts?type=task`, {
		signal: AbortSignal.timeout(10000)
	});
	const body = await counts.json().catch(() => ({}));
	const provider = typeof body.provider === 'string' ? body.provider : 'none';
	const ready = body.ready === true;
	if (!counts.ok || provider !== 'typesense' || !ready) {
		console.error(
			`api/search/counts failed status=${counts.status} provider=${provider} ready=${ready}`
		);
		process.exit(1);
	}
	console.log(`api/search/counts: ${counts.status} provider=typesense ready=true`);
} finally {
	await new Promise((resolve) => server.close(() => resolve()));
}
