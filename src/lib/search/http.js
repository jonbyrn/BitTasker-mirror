import { actionsFromEvent, mergeActions } from './documents.js';
import { queryRelay, searchRelays } from './relay.js';
import {
	applyActions,
	categoryCounts,
	findPreview,
	parseSearchQuery,
	providerReady,
	resolveProvider,
	searchByType,
	suggest
} from './search-api.js';

const INDEX_KINDS = [0, 30000, 31000, 30402, 30403, 5];

/**
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 */
export async function handleSearchRequest(request, env) {
	const url = new URL(request.url);
	const path = url.pathname.replace(/\/$/, '') || '/';
	if (!path.startsWith('/api/search')) return json({ error: 'Not found' }, 404);

	try {
		if (request.method === 'GET' && path === '/api/search/counts') {
			const type = url.searchParams.get('type') || 'task';
			return json(await categoryCounts(env, type));
		}
		if (request.method === 'GET' && path === '/api/search/preview') {
			return json(
				await findPreview(
					env,
					url.searchParams.get('type') || 'task',
					url.searchParams.get('id') || ''
				)
			);
		}
		if (request.method === 'GET' && path === '/api/search/health') {
			const provider = resolveProvider(env);
			return json({ provider, ready: providerReady(env) });
		}
		if (request.method === 'GET' && (path === '/api/search' || path === '/api/search/documents')) {
			const result = await searchByType(env, parseSearchQuery(url.searchParams));
			if (path === '/api/search/documents') {
				const hits = [...result.tasks, ...result.services, ...result.profiles];
				return json({
					hits,
					found: hits.length,
					total: hits.length,
					estimatedTotalHits: hits.length,
					provider: result.provider,
					query: result.query,
					message: result.message
				});
			}
			return json(result);
		}
		if (request.method === 'GET' && path === '/api/search/suggest') {
			return json(await suggest(env, url.searchParams.get('q') || ''));
		}
		if (request.method === 'POST' && path === '/api/search/index') {
			if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
			const body = await readJson(request);
			const events = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
			const btcUsd = Number(env.BTC_USD_RATE) || Number(body.btcUsd) || 0;
			const actions = mergeActions(events.map((event) => actionsFromEvent(event, { btcUsd })));
			const result = await applyActions(env, actions);
			return json({ ...result, events: events.length });
		}
		if (request.method === 'POST' && path === '/api/search/sync') {
			if (!authorized(request, env)) return json({ error: 'Unauthorized' }, 401);
			const body = await readJson(request);
			const relays = searchRelays(env, body.relays);
			const pages = Math.min(3, Math.max(1, Number(body.pages) || 1));
			const btcUsd = Number(env.BTC_USD_RATE) || 0;
			let events = 0;
			let applied = 0;
			for (const relay of relays) {
				for (const kind of INDEX_KINDS) {
					let until = Math.floor(Date.now() / 1000);
					for (let page = 0; page < pages; page += 1) {
						const batch = await queryRelay(relay, [{ kinds: [kind], until, limit: 100 }]);
						if (!batch.length) break;
						events += batch.length;
						const actions = mergeActions(batch.map((event) => actionsFromEvent(event, { btcUsd })));
						const result = await applyActions(env, actions);
						applied += result.applied || 0;
						const oldest = Math.min(...batch.map((event) => event.created_at || until));
						if (batch.length < 100 || oldest >= until) break;
						until = oldest - 1;
					}
				}
			}
			return json({ provider: resolveProvider(env), events, applied, relays });
		}
		return json({ error: 'Not found' }, 404);
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Search failed';
		return json({ error: message }, 500);
	}
}

/**
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 */
function authorized(request, env) {
	const secret = env.INDEXER_SECRET || '';
	if (!secret) return false;
	const header = request.headers.get('authorization') || '';
	const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
	if (token.length !== secret.length) return false;
	let mismatch = 0;
	for (let index = 0; index < token.length; index += 1) {
		mismatch |= token.charCodeAt(index) ^ secret.charCodeAt(index);
	}
	return mismatch === 0;
}

/** @param {Request} request */
async function readJson(request) {
	try {
		const body = await request.json();
		return body && typeof body === 'object' ? body : {};
	} catch {
		return {};
	}
}

/** @param {unknown} body @param {number} status */
function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}
