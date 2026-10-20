/**
 * Meilisearch proxy. The master key stays in the Worker secret MEILI_MASTER_KEY.
 * The browser only calls this same-origin route. Search uses MEILI_SEARCH_KEY
 * when it is set, otherwise the master key, still only on the server.
 *
 * Queries read the relay's existing `events` index (kind 31000 tasks, kind 30402
 * services). This Worker must not create that index or change its settings —
 * nostr-relay-nestjs owns the schema and is the only writer.
 *
 * Worker secrets (names only, never committed, never VITE_*):
 *   MEILI_HOST         https://ms-dc33b13a1710-25507.nyc.meilisearch.io
 *   MEILI_SEARCH_KEY   search-only key for the `events` index
 *   MEILI_MASTER_KEY   optional here; required only for the signed listing writes
 *                      below. The relay indexer needs the admin key as
 *                      MEILI_SEARCH_API_KEY, not the browser.
 */

import {
	authorizeDeletion,
	authorizeDocuments,
	authorHex,
	rateLimitWrite,
	resetRateLimits
} from './search-auth.js';

const INDEXES = ['tasks', 'services'];
/** Catalog name the Find pages send → Nostr kind stored in the `events` index. */
const CATALOG_KIND = { tasks: 31000, services: 30402 };
const EVENTS_INDEX = 'events';
const EVENT_FIELDS = [
	'id',
	'pubkey',
	'author',
	'createdAt',
	'kind',
	'tags',
	'content',
	'dTagValue'
];
const SEARCH_TIMEOUT_MS = 8000;

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

function stringList(value) {
	if (!Array.isArray(value)) return [];
	return value.filter((item) => typeof item === 'string' && item.trim().length > 0);
}

function categoryNames(categories) {
	if (!Array.isArray(categories)) return [];
	return categories
		.map((category) => {
			if (typeof category === 'string') return category;
			if (category && typeof category === 'object' && typeof category.name === 'string') {
				return category.name;
			}
			return '';
		})
		.filter((name) => name.length > 0);
}

/**
 * Turn one `events` hit into the listing shape Find Tasks / Find Services render.
 * The d-tag is the stable id, matching convertEventToTask / convertEventToService.
 */
function listingFromEvent(hit, catalog) {
	if (!hit || typeof hit !== 'object') return null;
	let payload = {};
	if (typeof hit.content === 'string') {
		try {
			const parsed = JSON.parse(hit.content);
			if (parsed && typeof parsed === 'object') payload = parsed;
		} catch {
			payload = {};
		}
	}
	const tags = Array.isArray(hit.tags) ? hit.tags : [];
	const dTag = tags.find((tag) => Array.isArray(tag) && tag[0] === 'd')?.[1];
	const id =
		(typeof dTag === 'string' && dTag.trim()) ||
		(typeof hit.dTagValue === 'string' && hit.dTagValue.trim()) ||
		(typeof hit.id === 'string' ? hit.id : '');
	if (!id) return null;
	const npub = typeof hit.pubkey === 'string' && hit.pubkey ? hit.pubkey : hit.author || '';
	const createdAt = Number(hit.createdAt ?? payload.createdAt ?? 0);
	const location =
		payload.pickupLocation?.displayName ||
		payload.dropOffLocation?.displayName ||
		payload.locationDetails?.taskeeLocation?.locationDisplayName ||
		'';
	const price = Number(
		payload.budget?.amount ??
			(payload.pricing && 'amount' in payload.pricing ? payload.pricing.amount : 0) ??
			0
	);
	return {
		id,
		title: typeof payload.title === 'string' ? payload.title : '',
		description: typeof payload.description === 'string' ? payload.description : '',
		category: categoryNames(payload.categories),
		skills: stringList(payload.skills),
		tags: stringList(payload.tags),
		location: typeof location === 'string' ? location : '',
		price: Number.isFinite(price) ? price : 0,
		status: payload.status != null ? String(payload.status) : '',
		type: catalog === 'services' ? 'service' : String(payload.taskType ?? 'task'),
		createdAt: Number.isFinite(createdAt) ? createdAt : 0,
		npub: typeof npub === 'string' ? npub : '',
		payload: { ...payload, id, npub, createdAt: Number.isFinite(createdAt) ? createdAt : 0 }
	};
}

async function searchEvents(env, q, kind) {
	// matchingStrategy "all" requires every query word. Do not send typoTolerance:
	// this Meilisearch rejects that field on POST /search (HTTP 400), and the
	// Worker maps any Meili error to 502. Typo tolerance is an index setting.
	const body = JSON.stringify({
		q,
		limit: 40,
		filter: `kind = ${kind}`,
		matchingStrategy: 'all',
		attributesToSearchOn: ['content'],
		attributesToRetrieve: EVENT_FIELDS
	});
	const run = () =>
		meili(
			env,
			`/indexes/${EVENTS_INDEX}/search`,
			{ method: 'POST', body, signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS) },
			'search'
		);
	try {
		const response = await run();
		if (response.status >= 500 || response.status === 429) return run();
		return response;
	} catch (error) {
		console.error('search query retry', error);
		return run();
	}
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
		const kind = CATALOG_KIND[index];
		if (!kind) return json({ error: 'Unknown index' }, 400);
		try {
			const response = await searchEvents(env, q, kind);
			const body = await response.json().catch(() => ({}));
			if (!response.ok) {
				console.error('search query failed', response.status, body);
				return json({ configured: true, hits: [], estimatedTotalHits: 0 }, 502);
			}
			const hits = (body.hits || []).map((hit) => listingFromEvent(hit, index)).filter(Boolean);
			return json({
				configured: true,
				hits,
				estimatedTotalHits: body.estimatedTotalHits ?? hits.length
			});
		} catch (error) {
			console.error('search query failed', error);
			return json({ configured: true, hits: [], estimatedTotalHits: 0 }, 502);
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
