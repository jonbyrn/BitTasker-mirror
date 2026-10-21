import { fold } from './taxonomy.js';
import { SEARCH_COLLECTIONS, SEARCH_SYNONYMS, QUERY_BY } from './synonyms.js';

const memoryDocs = new Map();
const pendingProfileFields = new Map();

export function resetMemoryIndex() {
	memoryDocs.clear();
	pendingProfileFields.clear();
}

/** @param {Record<string, string | undefined>} env */
export function resolveProvider(env) {
	const flag = String(env.SEARCH_PROVIDER || '')
		.trim()
		.toLowerCase();
	if (flag === 'memory') return 'memory';
	// Typesense is opt-in and only when a server is configured. Otherwise stay
	// on Meilisearch so an empty Typesense host cannot blank search.
	if (flag === 'typesense' && env.TYPESENSE_HOST) return 'typesense';
	if (flag === 'meilisearch' || flag === 'meili' || flag === 'typesense') return 'meilisearch';
	if (env.TYPESENSE_HOST && env.TYPESENSE_API_KEY) return 'typesense';
	if (env.MEILISEARCH_HOST || env.MEILI_HOST) return 'meilisearch';
	return 'memory';
}

/** @param {Record<string, string | undefined>} env */
export function providerReady(env) {
	const provider = resolveProvider(env);
	if (provider === 'memory') return true;
	if (provider === 'typesense') {
		return Boolean(env.TYPESENSE_HOST && (env.TYPESENSE_SEARCH_ONLY_KEY || env.TYPESENSE_API_KEY));
	}
	return Boolean(meiliHost(env) && meiliKey(env));
}

/** @param {string | undefined} host @param {string} fallbackProtocol */
export function normalizeHost(host, fallbackProtocol = 'https') {
	const value = String(host || '')
		.trim()
		.replace(/\/$/, '');
	if (!value) return '';
	if (value.startsWith('http://') || value.startsWith('https://')) return value;
	const protocol =
		value.includes('localhost') || value.startsWith('127.') ? 'http' : fallbackProtocol;
	return `${protocol}://${value}`;
}

/** @param {Record<string, string | undefined>} env */
function meiliHost(env) {
	return normalizeHost(env.MEILISEARCH_HOST || env.MEILI_HOST);
}

/** @param {Record<string, string | undefined>} env */
function meiliKey(env) {
	return env.MEILISEARCH_API_KEY || env.MEILI_MASTER_KEY || env.MEILI_API_KEY || '';
}

/** @param {string} q */
export function typoSettings(q) {
	const length = fold(q).length;
	return {
		num_typos: length >= 8 ? 2 : length >= 4 ? 1 : 0,
		min_len_1typo: 4,
		min_len_2typo: 8
	};
}

/**
 * @param {URLSearchParams | Record<string, string>} params
 */
export function parseSearchQuery(params) {
	const read = (key) => {
		if (params instanceof URLSearchParams) return params.get(key) || '';
		return params[key] || '';
	};
	const remoteRaw = read('remote').toLowerCase();
	/** @type {boolean | null} */
	let remote = null;
	if (remoteRaw === 'true' || remoteRaw === '1' || remoteRaw === 'remote') remote = true;
	if (remoteRaw === 'false' || remoteRaw === '0' || remoteRaw === 'local') remote = false;
	const minPrice = read('minPrice') || read('min_price');
	const maxPrice = read('maxPrice') || read('max_price');
	const minRating = read('minRating') || read('rating');
	const sort = read('sort');
	return {
		q: read('q').trim(),
		type: read('type') || 'all',
		category: read('category').trim(),
		subcategory: read('subcategory').trim(),
		minPriceUsd: minPrice === '' ? null : Number(minPrice),
		maxPriceUsd: maxPrice === '' ? null : Number(maxPrice),
		remote,
		location: read('location').trim(),
		minRating: minRating === '' ? null : Number(minRating),
		sort: sort === 'price' || sort === 'rating' || sort === 'newest' ? sort : 'newest',
		page: Math.max(1, Number(read('page')) || 1),
		perPage: Math.min(20, Math.max(1, Number(read('perPage') || read('limit')) || 8))
	};
}

/** @param {ReturnType<typeof parseSearchQuery>} query */
export function typesenseFilter(query) {
	/** @type {string[]} */
	const filters = [];
	if (query.category) filters.push(`category:=\`${escapeFilter(query.category)}\``);
	if (query.subcategory) filters.push(`subcategory:=\`${escapeFilter(query.subcategory)}\``);
	const priceFiltered = query.minPriceUsd != null || query.maxPriceUsd != null;
	if (priceFiltered) filters.push('price_usd:>0');
	if (query.minPriceUsd != null && Number.isFinite(query.minPriceUsd)) {
		filters.push(`price_usd:>=${query.minPriceUsd}`);
	}
	if (query.maxPriceUsd != null && Number.isFinite(query.maxPriceUsd)) {
		filters.push(`price_usd:<=${query.maxPriceUsd}`);
	}
	if (query.remote === true) filters.push('remote:=true');
	if (query.remote === false) filters.push('remote:=false');
	if (query.location) {
		const token = fold(query.location)
			.split(/[^a-z0-9]+/)
			.find((part) => part.length > 2);
		if (token) filters.push(`location_tokens:=\`${escapeFilter(token)}\``);
	}
	if (query.minRating != null && Number.isFinite(query.minRating) && query.minRating > 0) {
		filters.push(`rating:>=${query.minRating}`);
	}
	return filters.join(' && ');
}

/** @param {string} value */
function escapeFilter(value) {
	return String(value).replace(/`/g, '');
}

/** @param {ReturnType<typeof parseSearchQuery>} query */
export function typesenseSort(query) {
	if (query.sort === 'price') return 'price_usd:asc';
	if (query.sort === 'rating') return 'rating:desc';
	return 'created_at:desc';
}

/** @param {ReturnType<typeof parseSearchQuery>} query */
export function meiliFilter(query) {
	/** @type {string[]} */
	const filters = [];
	if (query.category) filters.push(`category = "${query.category.replace(/"/g, '')}"`);
	if (query.subcategory) filters.push(`subcategory = "${query.subcategory.replace(/"/g, '')}"`);
	if (query.minPriceUsd != null || query.maxPriceUsd != null) filters.push('price_usd > 0');
	if (query.minPriceUsd != null && Number.isFinite(query.minPriceUsd)) {
		filters.push(`price_usd >= ${query.minPriceUsd}`);
	}
	if (query.maxPriceUsd != null && Number.isFinite(query.maxPriceUsd)) {
		filters.push(`price_usd <= ${query.maxPriceUsd}`);
	}
	if (query.remote === true) filters.push('remote = true');
	if (query.remote === false) filters.push('remote = false');
	if (query.minRating != null && query.minRating > 0) filters.push(`rating >= ${query.minRating}`);
	return filters;
}

/** @param {string} collection */
export function collectionSchema(collection) {
	return {
		name: collection,
		default_sorting_field: 'created_at',
		fields: [
			{ name: 'title', type: 'string', locale: 'en' },
			{ name: 'title_es', type: 'string', locale: 'es', optional: true },
			{ name: 'description', type: 'string', locale: 'en', optional: true },
			{ name: 'description_es', type: 'string', locale: 'es', optional: true },
			{ name: 'category', type: 'string', facet: true, optional: true },
			{ name: 'subcategory', type: 'string', facet: true, optional: true },
			{ name: 'skills', type: 'string[]', facet: true, optional: true },
			{ name: 'price_usd', type: 'float', sort: true, optional: true },
			{ name: 'price_sats', type: 'int64', sort: true, optional: true },
			{ name: 'location', type: 'string', optional: true },
			{ name: 'location_tokens', type: 'string[]', facet: true, optional: true },
			{ name: 'remote', type: 'bool', facet: true, optional: true },
			{ name: 'rating', type: 'float', sort: true, optional: true },
			{ name: 'created_at', type: 'int64', sort: true },
			{ name: 'status', type: 'string', facet: true, optional: true },
			{ name: 'pubkey', type: 'string' },
			{ name: 'event_id', type: 'string', optional: true },
			{ name: 'url', type: 'string', index: false, optional: true }
		]
	};
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} path
 * @param {RequestInit & { admin?: boolean }} [options]
 */
async function typesenseFetch(env, path, options = {}) {
	const host = normalizeHost(env.TYPESENSE_HOST);
	const key = options.admin
		? env.TYPESENSE_API_KEY
		: env.TYPESENSE_SEARCH_ONLY_KEY || env.TYPESENSE_API_KEY;
	if (!host || !key) throw new Error('Typesense is not configured');
	const headers = new Headers(options.headers || {});
	headers.set('X-TYPESENSE-API-KEY', key);
	if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	return fetch(`${host}${path}`, { ...options, headers });
}

/** @param {Record<string, string | undefined>} env */
export async function ensureTypesense(env) {
	if (!env.TYPESENSE_HOST || !env.TYPESENSE_API_KEY) {
		throw new Error('Set TYPESENSE_HOST and TYPESENSE_API_KEY');
	}
	for (const collection of SEARCH_COLLECTIONS) {
		const existing = await typesenseFetch(env, `/collections/${collection}`, { admin: true });
		if (existing.status === 404) {
			const created = await typesenseFetch(env, '/collections', {
				method: 'POST',
				admin: true,
				body: JSON.stringify(collectionSchema(collection))
			});
			if (!created.ok) {
				throw new Error(`Could not create the ${collection} collection (${created.status})`);
			}
		} else if (!existing.ok) {
			throw new Error(`Could not read the ${collection} collection (${existing.status})`);
		}
		for (const synonym of SEARCH_SYNONYMS) {
			const saved = await typesenseFetch(env, `/collections/${collection}/synonyms/${synonym.id}`, {
				method: 'PUT',
				admin: true,
				body: JSON.stringify({ synonyms: synonym.synonyms })
			});
			if (!saved.ok) {
				throw new Error(`Could not save synonyms for ${collection} (${saved.status})`);
			}
		}
	}
	if (env.TYPESENSE_CREATE_SEARCH_KEY === 'true') {
		const created = await typesenseFetch(env, '/keys', {
			method: 'POST',
			admin: true,
			body: JSON.stringify({
				description: 'BitTasker search',
				actions: ['documents:search'],
				collections: SEARCH_COLLECTIONS
			})
		});
		if (!created.ok) throw new Error(`Could not create a search-only key (${created.status})`);
		const body = await created.json();
		if (body?.value) {
			console.log(`TYPESENSE_SEARCH_ONLY_KEY=${body.value}`);
		}
	}
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<Record<string, any>>} actions
 */
export async function applyActions(env, actions) {
	const provider = resolveProvider(env);
	if (provider === 'memory') {
		applyMemory(actions);
		return { provider, applied: actions.length };
	}
	if (provider !== 'typesense') {
		throw new Error('Indexing writes to Typesense. Meilisearch stays read-only for rollback.');
	}
	let applied = 0;
	for (const action of actions) {
		if (action.op === 'upsert' && action.document) {
			const response = await typesenseFetch(
				env,
				`/collections/${action.collection}/documents?action=upsert`,
				{ method: 'POST', admin: true, body: JSON.stringify(action.document) }
			);
			if (!response.ok) throw new Error(`Index write failed (${response.status})`);
			applied += 1;
		} else if (action.op === 'remove' && action.id) {
			const response = await typesenseFetch(
				env,
				`/collections/${action.collection}/documents/${encodeURIComponent(action.id)}`,
				{ method: 'DELETE', admin: true }
			);
			if (!response.ok && response.status !== 404) {
				throw new Error(`Index delete failed (${response.status})`);
			}
			applied += 1;
		} else if (action.op === 'remove-filter' && action.filter) {
			const response = await typesenseFetch(
				env,
				`/collections/${action.collection}/documents?filter_by=${encodeURIComponent(action.filter)}`,
				{ method: 'DELETE', admin: true }
			);
			if (!response.ok && response.status !== 404) {
				throw new Error(`Index filter delete failed (${response.status})`);
			}
			applied += 1;
		} else if (action.op === 'patch' && action.fields) {
			const response = await typesenseFetch(
				env,
				`/collections/${action.collection}/documents/${encodeURIComponent(action.id)}`,
				{ method: 'PATCH', admin: true, body: JSON.stringify(action.fields) }
			);
			if (response.status === 404 && action.create) {
				const created = await typesenseFetch(env, `/collections/${action.collection}/documents`, {
					method: 'POST',
					admin: true,
					body: JSON.stringify(action.fields)
				});
				if (!created.ok) throw new Error(`Profile create failed (${created.status})`);
			} else if (!response.ok && response.status !== 404) {
				throw new Error(`Profile update failed (${response.status})`);
			}
			applied += 1;
		}
	}
	return { provider, applied };
}

/** @param {Record<string, any>} action */
function memoryKey(action) {
	const id = action.id || action.document?.id || '';
	return `${action.collection}:${id}`;
}

/** @param {Array<Record<string, any>>} actions */
function applyMemory(actions) {
	for (const action of actions) {
		const key = memoryKey(action);
		if (action.op === 'upsert' && action.document) {
			memoryDocs.set(key, { ...action.document, type: collectionType(action.collection) });
		} else if (action.op === 'remove') {
			memoryDocs.delete(key);
		} else if (action.op === 'remove-filter') {
			const eventId = String(action.filter || '').replace('event_id:=', '');
			for (const [docKey, doc] of memoryDocs) {
				if (docKey.startsWith(`${action.collection}:`) && doc.event_id === eventId) {
					memoryDocs.delete(docKey);
				}
			}
		} else if (action.op === 'patch' && action.fields) {
			const existing = memoryDocs.get(key);
			if (!existing && !action.create) {
				pendingProfileFields.set(action.id, {
					...(pendingProfileFields.get(action.id) || {}),
					...action.fields
				});
				continue;
			}
			const pending = pendingProfileFields.get(action.id) || {};
			const next = {
				...pending,
				...(existing || {}),
				...action.fields,
				type: collectionType(action.collection)
			};
			if (
				Array.isArray(action.fields.skills) &&
				action.fields.skills.length === 0 &&
				existing?.skills?.length
			) {
				next.skills = existing.skills;
			}
			if (!next.skills?.length && pending.skills) next.skills = pending.skills;
			if (!next.category && pending.category) {
				next.category = pending.category;
				next.subcategory = pending.subcategory || '';
			}
			pendingProfileFields.delete(action.id);
			if (next.title) memoryDocs.set(key, next);
		}
	}
}

/** @param {string} collection */
function collectionType(collection) {
	if (collection === 'services') return 'service';
	if (collection === 'profiles') return 'profile';
	return 'task';
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
export async function searchGrouped(env, query) {
	const provider = resolveProvider(env);
	const ready = providerReady(env);
	if (!ready) {
		return emptyResult(provider, query.q, false, 'Search is not connected yet.');
	}
	if (provider === 'memory') return searchByType(env, query);
	if (provider === 'meilisearch') return searchMeili(env, query);
	return searchTypesense(env, query);
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} q
 */
export async function suggest(env, q) {
	const query = parseSearchQuery({ q, perPage: '5' });
	const result = await searchGrouped(env, { ...query, perPage: 5 });
	const titles = [...result.tasks, ...result.services, ...result.profiles]
		.map((hit) => hit.title)
		.filter(Boolean);
	return {
		suggestions: [...new Set(titles)].slice(0, 6),
		provider: result.provider,
		ready: result.ready
	};
}

/**
 * @param {string} provider
 * @param {string} q
 * @param {boolean} ready
 * @param {string} message
 */
function emptyResult(provider, q, ready, message) {
	return {
		provider,
		ready,
		query: q,
		message,
		tasks: [],
		services: [],
		profiles: [],
		suggestions: []
	};
}

/** @param {any[]} hits @param {string} sort */
function sortHits(hits, sort) {
	hits.sort((left, right) => {
		if (sort === 'price') {
			const leftPrice = left.price_usd > 0 ? left.price_usd : Number.MAX_SAFE_INTEGER;
			const rightPrice = right.price_usd > 0 ? right.price_usd : Number.MAX_SAFE_INTEGER;
			return leftPrice - rightPrice;
		}
		if (sort === 'rating') return (right.rating || 0) - (left.rating || 0);
		return (right.created_at || 0) - (left.created_at || 0);
	});
}

/**
 * @param {any} doc
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
function memoryMatches(doc, query) {
	if (query.type === 'task' && doc.type !== 'task') return false;
	if (query.type === 'service' && doc.type !== 'service') return false;
	if (query.type === 'profile' && doc.type !== 'profile') return false;
	if (query.category && doc.category !== query.category) return false;
	if (query.subcategory && doc.subcategory !== query.subcategory) return false;
	if (query.remote === true && !doc.remote) return false;
	if (query.remote === false && doc.remote) return false;
	if (query.minRating != null && query.minRating > 0 && (doc.rating || 0) < query.minRating)
		return false;
	const priceFiltered = query.minPriceUsd != null || query.maxPriceUsd != null;
	if (priceFiltered && !(doc.price_usd > 0)) return false;
	if (query.minPriceUsd != null && doc.price_usd < query.minPriceUsd) return false;
	if (query.maxPriceUsd != null && doc.price_usd > query.maxPriceUsd) return false;
	if (query.location) {
		const token = fold(query.location);
		const tokens = Array.isArray(doc.location_tokens) ? doc.location_tokens : [];
		if (!tokens.some((item) => item.includes(token) || token.includes(item))) return false;
	}
	if (!query.q) return true;
	return textMatches(query.q, doc);
}

/** @param {string} q @param {any} doc */
function textMatches(q, doc) {
	const queryTokens = fold(q)
		.split(/[^a-z0-9]+/)
		.filter((token) => token.length > 1);
	if (!queryTokens.length) return true;
	const haystack = fold(
		[
			doc.title,
			doc.title_es,
			doc.description,
			doc.description_es,
			doc.category,
			doc.subcategory,
			doc.location,
			...(doc.skills || [])
		].join(' ')
	);
	const docTokens = haystack.split(/[^a-z0-9]+/).filter(Boolean);
	return queryTokens.every((token) => docTokens.some((docToken) => tokensClose(token, docToken)));
}

/** @param {string} queryToken @param {string} docToken */
function tokensClose(queryToken, docToken) {
	if (queryToken === docToken || docToken.includes(queryToken) || queryToken.includes(docToken)) {
		return true;
	}
	if (sameSynonym(queryToken, docToken)) return true;
	const distance = levenshtein(queryToken, docToken);
	if (queryToken.length >= 8) return distance <= 2;
	if (queryToken.length >= 5) return distance <= 1;
	return false;
}

/** @param {string} left @param {string} right */
function sameSynonym(left, right) {
	const a = fold(left);
	const b = fold(right);
	return SEARCH_SYNONYMS.some((group) => {
		const words = group.synonyms.map((word) => fold(word));
		return words.includes(a) && words.includes(b);
	});
}

/** @param {string} left @param {string} right */
function levenshtein(left, right) {
	if (Math.abs(left.length - right.length) > 2) return 3;
	const rows = Array.from({ length: left.length + 1 }, (_, index) => [index]);
	for (let col = 1; col <= right.length; col += 1) rows[0][col] = col;
	for (let row = 1; row <= left.length; row += 1) {
		for (let col = 1; col <= right.length; col += 1) {
			const cost = left[row - 1] === right[col - 1] ? 0 : 1;
			rows[row][col] = Math.min(
				rows[row - 1][col] + 1,
				rows[row][col - 1] + 1,
				rows[row - 1][col - 1] + cost
			);
		}
	}
	return rows[left.length][right.length];
}

/** @param {any[]} hits @param {string} q */
function suggestionTitles(hits, q) {
	const needle = fold(q);
	return hits
		.map((hit) => hit.title)
		.filter(
			(title) => title && (!needle || fold(title).includes(needle) || textMatches(q, { title }))
		)
		.slice(0, 6);
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
async function searchTypesense(env, query) {
	const collections =
		query.type === 'task' || query.type === 'service' || query.type === 'profile'
			? [`${query.type === 'profile' ? 'profiles' : `${query.type}s`}`]
			: SEARCH_COLLECTIONS;
	const typos = typoSettings(query.q);
	const filter = typesenseFilter(query);
	const searches = collections.map((collection) => {
		/** @type {Record<string, unknown>} */
		const search = {
			collection,
			q: query.q || '*',
			query_by: QUERY_BY,
			sort_by: typesenseSort(query),
			per_page: query.perPage,
			page: query.page,
			prefix: true,
			...typos
		};
		if (filter) search.filter_by = filter;
		return search;
	});
	let response;
	try {
		response = await typesenseFetch(env, '/multi_search', {
			method: 'POST',
			body: JSON.stringify({ searches })
		});
	} catch {
		return emptyResult('typesense', query.q, false, 'Search is unavailable right now.');
	}
	if (response.status === 404) {
		return emptyResult('typesense', query.q, false, 'Search is still being set up.');
	}
	if (!response.ok) {
		return emptyResult('typesense', query.q, false, 'Search is unavailable right now.');
	}
	const body = await response.json();
	const grouped = { tasks: [], services: [], profiles: [] };
	(body.results || []).forEach((result, index) => {
		const collection = collections[index];
		const type = collectionType(collection);
		for (const hit of result.hits || []) {
			const document = hit.document || {};
			grouped[type === 'task' ? 'tasks' : type === 'service' ? 'services' : 'profiles'].push({
				...document,
				type
			});
		}
	});
	return {
		provider: 'typesense',
		ready: true,
		query: query.q,
		message: '',
		...grouped,
		suggestions: suggestionTitles(
			[...grouped.tasks, ...grouped.services, ...grouped.profiles],
			query.q
		)
	};
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
async function searchMeili(env, query) {
	const strict = env.MEILISEARCH_STRICT === 'true';
	try {
		return await meiliRequest(env, query, true);
	} catch (error) {
		if (strict) {
			return emptyResult('meilisearch', query.q, false, 'Search is unavailable right now.');
		}
		try {
			const loose = await meiliRequest(env, query, false);
			return { ...loose, message: loose.message || '' };
		} catch {
			return emptyResult(
				'meilisearch',
				query.q,
				false,
				error instanceof Error
					? 'Search is unavailable right now.'
					: 'Search is unavailable right now.'
			);
		}
	}
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 * @param {boolean} filtered
 */
async function meiliRequest(env, query, filtered) {
	const host = meiliHost(env);
	const key = meiliKey(env);
	const index = env.MEILISEARCH_INDEX || env.MEILI_INDEX || 'events';
	const sort =
		query.sort === 'price'
			? ['price_usd:asc']
			: query.sort === 'rating'
				? ['rating:desc']
				: ['created_at:desc'];
	const response = await fetch(`${host}/indexes/${encodeURIComponent(index)}/search`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${key}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			q: query.q,
			limit: query.perPage,
			offset: (query.page - 1) * query.perPage,
			...(filtered ? { filter: meiliFilter(query), sort } : {})
		})
	});
	if (!response.ok) throw new Error(`Meilisearch ${response.status}`);
	const body = await response.json();
	const hits = (body.hits || []).map(mapMeiliHit).filter((hit) => {
		if (query.type === 'task') return hit.type === 'task';
		if (query.type === 'service') return hit.type === 'service';
		if (query.type === 'profile') return hit.type === 'profile';
		return true;
	});
	return {
		provider: 'meilisearch',
		ready: true,
		query: query.q,
		message: '',
		tasks: hits.filter((hit) => hit.type === 'task'),
		services: hits.filter((hit) => hit.type === 'service'),
		profiles: hits.filter((hit) => hit.type === 'profile'),
		suggestions: suggestionTitles(hits, query.q)
	};
}

/** @param {Record<string, any>} hit */
function mapMeiliHit(hit) {
	const kind = Number(hit.kind);
	let type = 'task';
	if (kind === 30402 || hit.type === 'service') type = 'service';
	else if (kind === 0 || hit.type === 'profile' || hit.type === 'person') type = 'profile';
	else if (typeof hit.type === 'string' && ['task', 'service', 'profile'].includes(hit.type))
		type = hit.type;
	const title = String(hit.title || hit.name || '');
	return {
		id: String(hit.id || ''),
		type,
		title,
		description: String(hit.description || hit.about || ''),
		category: String(hit.category || ''),
		subcategory: String(hit.subcategory || ''),
		skills: Array.isArray(hit.skills) ? hit.skills.map(String) : [],
		price_usd: Number(hit.price_usd ?? hit.price ?? 0) || 0,
		price_sats: Number(hit.price_sats ?? 0) || 0,
		location: String(hit.location || ''),
		remote: Boolean(hit.remote),
		rating: Number(hit.rating ?? 0) || 0,
		created_at: Number(hit.created_at ?? 0) || 0,
		status: String(hit.status || ''),
		pubkey: String(hit.pubkey || ''),
		url: String(hit.url || '')
	};
}

/**
 * Per-type cap used by the public API. Memory search above slices a mixed page
 * for unit tests of sort; the handler asks for each type separately when needed.
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
export async function searchByType(env, query) {
	if (resolveProvider(env) !== 'memory') return searchGrouped(env, query);
	const ready = providerReady(env);
	if (!ready) return emptyResult('memory', query.q, false, 'Search is not connected yet.');
	const hits = [...memoryDocs.values()].filter((doc) => memoryMatches(doc, query));
	const take = (type) => {
		const group = hits.filter((hit) => hit.type === type);
		sortHits(group, query.sort);
		return group.slice(0, query.perPage);
	};
	const tasks = take('task');
	const services = take('service');
	const profiles = take('profile');
	return {
		provider: 'memory',
		ready: true,
		query: query.q,
		message: '',
		tasks,
		services,
		profiles,
		suggestions: suggestionTitles([...tasks, ...services, ...profiles], query.q)
	};
}
