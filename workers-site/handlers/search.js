/**
 * Meilisearch proxy. The master key stays in the Worker secret MEILI_MASTER_KEY.
 * The browser only calls this same-origin route. Search uses MEILI_SEARCH_KEY
 * when it is set, otherwise the master key, still only on the server.
 *
 * Required Worker secrets (names only, never committed):
 *   MEILI_HOST
 *   MEILI_MASTER_KEY
 * Optional:
 *   MEILI_SEARCH_KEY
 */

const INDEXES = ['tasks', 'services'];

const SETTINGS = {
	searchableAttributes: ['title', 'description', 'category', 'skills', 'tags', 'location'],
	filterableAttributes: ['category', 'skills', 'tags', 'type', 'status', 'price'],
	sortableAttributes: ['price', 'createdAt'],
	typoTolerance: { enabled: true },
	synonyms: {
		spanish: ['translation', 'translate', 'espanol', 'traduccion'],
		translation: ['spanish', 'translate'],
		translate: ['spanish', 'translation'],
		copywriting: ['writing', 'copywriter'],
		writing: ['copywriting'],
		copywriter: ['copywriting', 'writing'],
		proofread: ['proofreading', 'editing', 'proofreader'],
		proofreading: ['proofread', 'editing'],
		editing: ['proofread', 'proofreading'],
		proofreader: ['proofread', 'proofreading']
	}
};

const ALLOWED_FIELDS = [
	'id',
	'title',
	'description',
	'category',
	'skills',
	'tags',
	'location',
	'price',
	'status',
	'type',
	'createdAt',
	'npub',
	'payload'
];

let settingsReady = null;

function json(body, status = 200) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
	});
}

function configured(env) {
	return Boolean(env.MEILI_HOST && (env.MEILI_MASTER_KEY || env.MEILI_SEARCH_KEY));
}

function host(env) {
	return String(env.MEILI_HOST || '').replace(/\/$/, '');
}

async function meili(env, path, options = {}, keyName = 'master') {
	const key =
		keyName === 'search' ? env.MEILI_SEARCH_KEY || env.MEILI_MASTER_KEY : env.MEILI_MASTER_KEY;
	if (!key) throw new Error('Meilisearch key is not configured');
	const response = await fetch(`${host(env)}${path}`, {
		...options,
		headers: {
			Authorization: `Bearer ${key}`,
			'Content-Type': 'application/json',
			...(options.headers || {})
		}
	});
	return response;
}

async function ensureSettings(env) {
	if (!env.MEILI_MASTER_KEY) return;
	if (!settingsReady) {
		settingsReady = (async () => {
			for (const index of INDEXES) {
				await meili(env, `/indexes`, {
					method: 'POST',
					body: JSON.stringify({ uid: index, primaryKey: 'id' })
				});
				await meili(env, `/indexes/${index}/settings`, {
					method: 'PATCH',
					body: JSON.stringify(SETTINGS)
				});
			}
		})().catch((error) => {
			settingsReady = null;
			throw error;
		});
	}
	await settingsReady;
}

function sanitizeDocument(input) {
	if (!input || typeof input !== 'object') return null;
	const id = typeof input.id === 'string' ? input.id.trim() : '';
	if (!id || id.length > 200) return null;
	const document = { id };
	for (const field of ALLOWED_FIELDS) {
		if (field === 'id') continue;
		if (input[field] !== undefined) document[field] = input[field];
	}
	return document;
}

export async function handleSearchRoute(request, env) {
	const url = new URL(request.url);
	const pathname = url.pathname;

	if (!configured(env)) {
		return json({ configured: false, hits: [], estimatedTotalHits: 0 }, 503);
	}

	if (request.method === 'GET' && pathname === '/api/search/query') {
		const index = url.searchParams.get('index');
		const q = (url.searchParams.get('q') || '').slice(0, 200);
		if (!INDEXES.includes(index)) return json({ error: 'Unknown index' }, 400);
		try {
			await ensureSettings(env);
			const response = await meili(
				env,
				`/indexes/${index}/search`,
				{
					method: 'POST',
					body: JSON.stringify({
						q,
						limit: 40,
						attributesToRetrieve: ALLOWED_FIELDS
					})
				},
				'search'
			);
			const body = await response.json().catch(() => ({}));
			if (!response.ok) return json({ configured: true, error: 'Search failed' }, 502);
			return json({
				configured: true,
				hits: body.hits || [],
				estimatedTotalHits: body.estimatedTotalHits ?? (body.hits || []).length
			});
		} catch (error) {
			console.error('search query failed', error);
			return json({ configured: false, hits: [] }, 503);
		}
	}

	if (
		pathname === '/api/search/documents' &&
		(request.method === 'POST' || request.method === 'DELETE')
	) {
		if (!env.MEILI_MASTER_KEY) return json({ configured: false }, 503);
		let body;
		try {
			body = await request.json();
		} catch {
			return json({ error: 'Invalid JSON' }, 400);
		}
		const index = body?.index;
		if (!INDEXES.includes(index)) return json({ error: 'Unknown index' }, 400);

		try {
			await ensureSettings(env);
			if (request.method === 'DELETE') {
				const ids = Array.isArray(body.ids)
					? body.ids.filter((id) => typeof id === 'string').slice(0, 100)
					: [];
				const response = await meili(env, `/indexes/${index}/documents/delete-batch`, {
					method: 'POST',
					body: JSON.stringify(ids)
				});
				if (!response.ok) return json({ error: 'Delete failed' }, 502);
				return json({ ok: true, deleted: ids.length });
			}

			const documents = Array.isArray(body.documents)
				? body.documents.map(sanitizeDocument).filter(Boolean).slice(0, 40)
				: [];
			if (documents.length === 0) return json({ error: 'No documents' }, 400);
			const response = await meili(env, `/indexes/${index}/documents`, {
				method: 'POST',
				body: JSON.stringify(documents)
			});
			if (!response.ok) return json({ error: 'Index failed' }, 502);
			return json({ ok: true, indexed: documents.length });
		} catch (error) {
			console.error('search index failed', error);
			return json({ configured: false }, 503);
		}
	}

	return json({ error: 'Not found' }, 404);
}
