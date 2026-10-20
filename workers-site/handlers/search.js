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

import {
	authorizeDeletion,
	authorizeDocuments,
	authorHex,
	rateLimitWrite,
	resetRateLimits
} from './search-auth.js';

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

export function resetSearchState() {
	settingsReady = null;
	resetRateLimits();
}

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

async function readExistingDocument(env, index, id) {
	const response = await meili(
		env,
		`/indexes/${encodeURIComponent(index)}/documents/${encodeURIComponent(id)}`
	);
	if (response.status === 404) return null;
	if (!response.ok) {
		const error = new Error('Document lookup failed');
		error.status = 502;
		throw error;
	}
	return response.json();
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
			if (request.method === 'DELETE') {
				const ids = Array.isArray(body.ids)
					? body.ids.filter((id) => typeof id === 'string' && id.trim()).slice(0, 100)
					: [];
				const decision = authorizeDeletion(body.event, ids);
				if (!decision.ok) return json({ error: decision.error }, decision.status);
				if (!rateLimitWrite(request, decision.pubkey)) {
					return json({ error: 'Too many requests' }, 429);
				}
				await ensureSettings(env);
				const deletable = [];
				for (const id of ids) {
					const existing = await readExistingDocument(env, index, id);
					if (!existing) continue;
					const existingAuthor = authorHex(existing.npub);
					if (!existingAuthor || existingAuthor !== decision.pubkey) {
						return json({ error: 'Pubkey does not match the listing author' }, 403);
					}
					deletable.push(id);
				}
				if (deletable.length === 0) return json({ ok: true, deleted: 0 });
				const response = await meili(env, `/indexes/${index}/documents/delete-batch`, {
					method: 'POST',
					body: JSON.stringify(deletable)
				});
				if (!response.ok) return json({ error: 'Delete failed' }, 502);
				return json({ ok: true, deleted: deletable.length });
			}

			const documents = Array.isArray(body.documents)
				? body.documents.map(sanitizeDocument).filter(Boolean).slice(0, 40)
				: [];
			const decision = authorizeDocuments(body.event, documents);
			if (!decision.ok) return json({ error: decision.error }, decision.status);
			if (!rateLimitWrite(request, decision.pubkey)) {
				return json({ error: 'Too many requests' }, 429);
			}
			await ensureSettings(env);
			for (const document of documents) {
				const existing = await readExistingDocument(env, index, document.id);
				if (!existing) continue;
				const existingAuthor = authorHex(existing.npub);
				if (existingAuthor && existingAuthor !== decision.pubkey) {
					return json({ error: 'Pubkey does not match the listing author' }, 403);
				}
			}
			const stamped = documents.map((document) => ({ ...document, npub: decision.pubkey }));
			const response = await meili(env, `/indexes/${index}/documents`, {
				method: 'POST',
				body: JSON.stringify(stamped)
			});
			if (!response.ok) return json({ error: 'Index failed' }, 502);
			return json({ ok: true, indexed: stamped.length });
		} catch (error) {
			console.error('search index failed', error);
			const status = error && error.status === 502 ? 502 : 503;
			return json(
				status === 502 ? { error: 'Index lookup failed' } : { configured: false },
				status
			);
		}
	}

	return json({ error: 'Not found' }, 404);
}
