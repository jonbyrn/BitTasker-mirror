import { fold } from './taxonomy.js';
import { SEARCH_COLLECTIONS, SEARCH_SYNONYMS, QUERY_BY } from './synonyms.js';
import {
	embedDimensions,
	embedTexts,
	embeddingSource,
	needsEmbedding,
	vectorQuery
} from '../qvac/embed.js';

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

/** @param {Record<string, string | undefined>} env */
function meiliConfigured(env) {
	return Boolean(meiliHost(env) && meiliKey(env));
}

/**
 * Empty prefix keeps the original collection names. dev_ and rgb_ select the
 * collections that already exist on the shared Typesense server.
 * @param {Record<string, string | undefined>} env
 */
export function collectionPrefix(env) {
	const raw = String(env?.TYPESENSE_COLLECTION_PREFIX ?? '').trim();
	if (!raw) return '';
	if (!/^[a-z0-9_]{1,32}$/.test(raw)) {
		throw new Error(
			'TYPESENSE_COLLECTION_PREFIX must be empty or made of letters, numbers, and underscores'
		);
	}
	return raw;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} name
 */
export function typesenseCollectionName(env, name) {
	const prefix = collectionPrefix(env);
	const logical = logicalCollection(env, name);
	return `${prefix}${logical}`;
}

/**
 * @param {Record<string, string | undefined> | undefined} env
 * @param {string} name
 */
export function logicalCollection(env, name) {
	const value = String(name || '');
	const prefix = env ? collectionPrefix(env) : '';
	if (prefix && value.startsWith(prefix)) {
		const rest = value.slice(prefix.length);
		if (SEARCH_COLLECTIONS.includes(rest)) return rest;
	}
	return value;
}

/** @param {Record<string, string | undefined>} env */
export function searchCollectionNames(env) {
	return SEARCH_COLLECTIONS.map((name) => typesenseCollectionName(env, name));
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
 * `URLSearchParams` already decodes `%C3%B1`. If a proxy leaves the encoding
 * in the value, decode once more. A broken `%` sequence stays as typed.
 * @param {string} value
 */
function decodeSearchText(value) {
	const text = String(value || '').trim();
	if (!/%[0-9a-fA-F]{2}/.test(text)) return text;
	try {
		return decodeURIComponent(text).trim();
	} catch {
		return text;
	}
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
		q: decodeSearchText(read('q')),
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
		perPage: Math.min(60, Math.max(1, Number(read('perPage') || read('limit')) || 8))
	};
}

/** @param {ReturnType<typeof parseSearchQuery>} query */
export function typesenseFilter(query) {
	/** @type {string[]} */
	const filters = [];
	const categoryFilter = typesenseCategoryFilter(query.category);
	if (categoryFilter) filters.push(categoryFilter);
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

/**
 * One category, or several joined with commas (`cleaning,moving`).
 * @param {string} category
 */
function categoryIds(category) {
	return String(category || '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean);
}

/** @param {string} category */
function typesenseCategoryFilter(category) {
	const ids = categoryIds(category).map(escapeFilter);
	if (!ids.length) return '';
	if (ids.length === 1) return `category:=\`${ids[0]}\``;
	return `category:=[${ids.map((id) => `\`${id}\``).join(',')}]`;
}

/** @param {string} category */
function meiliCategoryFilter(category) {
	const ids = categoryIds(category).map((id) => id.replace(/"/g, ''));
	if (!ids.length) return '';
	if (ids.length === 1) return `category = "${ids[0]}"`;
	return `(${ids.map((id) => `category = "${id}"`).join(' OR ')})`;
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
	const categoryFilter = meiliCategoryFilter(query.category);
	if (categoryFilter) filters.push(categoryFilter);
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

/**
 * @param {string} collection
 * @param {Record<string, string | undefined>} [env]
 */
export function collectionSchema(collection, env) {
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
			{ name: 'public_id', type: 'string', optional: true },
			{ name: 'address', type: 'string', index: false, optional: true },
			{ name: 'url', type: 'string', index: false, optional: true },
			{
				name: 'embedding',
				type: 'float[]',
				num_dim: embedDimensions(env),
				optional: true
			}
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
	for (const collection of searchCollectionNames(env)) {
		const existing = await typesenseFetch(env, `/collections/${collection}`, { admin: true });
		const schema = collectionSchema(collection, env);
		if (existing.status === 404) {
			const created = await typesenseFetch(env, '/collections', {
				method: 'POST',
				admin: true,
				body: JSON.stringify(schema)
			});
			if (!created.ok) {
				throw new Error(`Could not create the ${collection} collection (${created.status})`);
			}
		} else if (!existing.ok) {
			throw new Error(`Could not read the ${collection} collection (${existing.status})`);
		} else {
			const body = await existing.json();
			const names = new Set((body.fields || []).map((field) => field.name));
			const missing = schema.fields.filter((field) => !names.has(field.name));
			if (missing.length) {
				await typesenseFetch(env, `/collections/${collection}`, {
					method: 'PATCH',
					admin: true,
					body: JSON.stringify({ fields: missing })
				});
			}
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
}

/**
 * Returns the scoped key to the host writer. Callers must not log the value.
 * scripts/typesense-keys.mjs stores it. The worker bundle does not import that writer.
 * @param {Record<string, string | undefined>} env
 */
export async function issueSearchOnlyKey(env) {
	const created = await typesenseFetch(env, '/keys', {
		method: 'POST',
		admin: true,
		body: JSON.stringify({
			description: 'BitTasker search',
			actions: ['documents:search'],
			collections: searchCollectionNames(env)
		})
	});
	if (!created.ok) throw new Error(`Could not create a search-only key (${created.status})`);
	const body = await created.json();
	const value = typeof body?.value === 'string' ? body.value.trim() : '';
	if (!value) throw new Error('Typesense did not return a search-only key');
	return value;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {Array<Record<string, any>>} actions
 */
/**
 * Add vectors when QVAC can embed. A failure leaves the keyword document as it was.
 * @param {Record<string, string | undefined>} env
 * @param {Array<Record<string, any>>} actions
 */
async function withEmbeddings(env, actions) {
	const dim = embedDimensions(env);
	const targets = actions.filter(
		(action) =>
			action.op === 'upsert' &&
			action.document &&
			embeddingSource(action.document) &&
			needsEmbedding(action.document, dim)
	);
	if (!targets.length) return actions;
	const vectors = await embedTexts(
		env,
		targets.map((action) => embeddingSource(action.document)),
		fetch,
		20000
	);
	if (!vectors) return actions;
	return actions.map((action) => {
		const index = targets.indexOf(action);
		if (index < 0 || !vectors[index]) return action;
		return { ...action, document: { ...action.document, embedding: vectors[index] } };
	});
}

export async function applyActions(env, actions) {
	const prepared = await withEmbeddings(env, actions);
	const provider = resolveProvider(env);
	if (provider === 'memory') {
		applyMemory(prepared);
		return { provider, applied: prepared.length };
	}
	if (provider !== 'typesense') {
		throw new Error('Indexing writes to Typesense. Meilisearch stays read-only for rollback.');
	}
	let applied = 0;
	for (const action of prepared) {
		const collection = typesenseCollectionName(env, action.collection);
		if (action.op === 'upsert' && action.document) {
			const response = await typesenseFetch(
				env,
				`/collections/${collection}/documents?action=upsert`,
				{ method: 'POST', admin: true, body: JSON.stringify(action.document) }
			);
			if (!response.ok) throw new Error(`Index write failed (${response.status})`);
			applied += 1;
		} else if (action.op === 'remove' && action.id) {
			const response = await typesenseFetch(
				env,
				`/collections/${collection}/documents/${encodeURIComponent(action.id)}`,
				{ method: 'DELETE', admin: true }
			);
			if (!response.ok && response.status !== 404) {
				throw new Error(`Index delete failed (${response.status})`);
			}
			applied += 1;
		} else if (action.op === 'remove-filter' && action.filter) {
			const response = await typesenseFetch(
				env,
				`/collections/${collection}/documents?filter_by=${encodeURIComponent(action.filter)}`,
				{ method: 'DELETE', admin: true }
			);
			if (!response.ok && response.status !== 404) {
				throw new Error(`Index filter delete failed (${response.status})`);
			}
			applied += 1;
		} else if (action.op === 'patch' && action.fields) {
			const response = await typesenseFetch(
				env,
				`/collections/${collection}/documents/${encodeURIComponent(action.id)}`,
				{ method: 'PATCH', admin: true, body: JSON.stringify(action.fields) }
			);
			if (response.status === 404 && action.create) {
				const created = await typesenseFetch(env, `/collections/${collection}/documents`, {
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

/** @param {string} collection @param {Record<string, string | undefined>} [env] */
function collectionType(collection, env) {
	const name = logicalCollection(env, collection);
	if (name === 'services') return 'service';
	if (name === 'profiles') return 'profile';
	if (name === 'shifts') return 'shift';
	if (name === 'listings') return 'listing';
	return 'task';
}

/** @param {string} type */
function collectionsForType(type) {
	if (type === 'profile') return ['profiles'];
	if (type === 'listing') return ['listings'];
	if (type === 'task' || type === 'service' || type === 'shift') return [`${type}s`];
	return SEARCH_COLLECTIONS;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof parseSearchQuery>} query
 */
export async function searchGrouped(env, query) {
	const provider = resolveProvider(env);
	const ready = providerReady(env);
	if (provider === 'memory') return searchByType(env, query);
	if (!ready) {
		if (provider === 'typesense' && meiliConfigured(env)) return searchMeili(env, query);
		return emptyResult(provider, query.q, false, 'Search is not connected yet.');
	}
	if (provider === 'meilisearch') return searchMeili(env, query);
	const typesense = await searchTypesense(env, query);
	if (!typesense.ready && meiliConfigured(env)) {
		const meili = await searchMeili(env, query);
		if (meili.ready) return meili;
	}
	return typesense;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} q
 */
export async function suggest(env, q) {
	const query = parseSearchQuery({ q, perPage: '5' });
	const result = await searchGrouped(env, { ...query, perPage: 5 });
	const titles = [
		...result.tasks,
		...result.services,
		...(result.shifts || []),
		...(result.listings || []),
		...result.profiles
	]
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
		shifts: [],
		listings: [],
		profiles: [],
		categoryCounts: {},
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
	if (query.type === 'shift' && doc.type !== 'shift') return false;
	if (query.type === 'listing' && doc.type !== 'listing') return false;
	if (query.type === 'profile' && doc.type !== 'profile') return false;
	if (query.category) {
		const ids = categoryIds(query.category);
		if (ids.length && !ids.includes(doc.category)) return false;
	}
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
	const logical = collectionsForType(query.type);
	let collections;
	try {
		collections = logical.map((name) => typesenseCollectionName(env, name));
	} catch {
		return emptyResult('typesense', query.q, false, 'Search is unavailable right now.');
	}
	const typos = typoSettings(query.q);
	const filter = typesenseFilter(query);
	let queryVector = null;
	if (query.q && query.q !== '*') {
		const embedded = await embedTexts(env, [query.q], fetch, 8000);
		queryVector = embedded?.[0] || null;
	}
	const buildSearches = (vector) =>
		collections.map((collection) => {
			/** @type {Record<string, unknown>} */
			const search = {
				collection,
				q: query.q || '*',
				query_by: QUERY_BY,
				sort_by: typesenseSort(query),
				per_page: query.perPage,
				page: query.page,
				prefix: true,
				facet_by: 'category',
				max_facet_values: 40,
				exclude_fields: 'embedding',
				...typos
			};
			if (filter) search.filter_by = filter;
			if (vector) search.vector_query = vectorQuery(vector, Math.max(100, query.perPage));
			return search;
		});
	const searches = buildSearches(queryVector);
	let response;
	try {
		response = await typesenseFetch(env, '/multi_search', {
			method: 'POST',
			body: JSON.stringify({ searches })
		});
		if (queryVector && response && !response.ok && response.status !== 404) {
			response = await typesenseFetch(env, '/multi_search', {
				method: 'POST',
				body: JSON.stringify({ searches: buildSearches(null) })
			});
		}
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
	const grouped = { tasks: [], services: [], shifts: [], listings: [], profiles: [] };
	/** @type {Record<string, number>} */
	const categoryCounts = {};
	(body.results || []).forEach((result, index) => {
		const type = collectionType(collections[index], env);
		const bucket =
			type === 'task'
				? 'tasks'
				: type === 'service'
					? 'services'
					: type === 'shift'
						? 'shifts'
						: type === 'listing'
							? 'listings'
							: 'profiles';
		for (const hit of result.hits || []) {
			const document = hit.document || {};
			grouped[bucket].push({
				...document,
				type
			});
		}
		for (const facet of result.facet_counts || []) {
			if (facet.field_name !== 'category') continue;
			for (const count of facet.counts || []) {
				categoryCounts[count.value] = (categoryCounts[count.value] || 0) + (count.count || 0);
			}
		}
	});
	return {
		provider: 'typesense',
		ready: true,
		query: query.q,
		message: '',
		...grouped,
		categoryCounts,
		suggestions: suggestionTitles(
			[
				...grouped.tasks,
				...grouped.services,
				...grouped.shifts,
				...grouped.listings,
				...grouped.profiles
			],
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
		shifts: hits.filter((hit) => hit.type === 'shift'),
		listings: hits.filter((hit) => hit.type === 'listing'),
		profiles: hits.filter((hit) => hit.type === 'profile'),
		categoryCounts: {},
		suggestions: suggestionTitles(hits, query.q)
	};
}

/** @param {Record<string, any>} hit */
function mapMeiliHit(hit) {
	const kind = Number(hit.kind);
	let type = 'task';
	if (kind === 30402 || hit.type === 'service') type = 'service';
	else if (kind === 31150 || hit.type === 'shift') type = 'shift';
	else if (kind === 31160 || hit.type === 'listing') type = 'listing';
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
	const shifts = take('shift');
	const listings = take('listing');
	const profiles = take('profile');
	return {
		provider: 'memory',
		ready: true,
		query: query.q,
		message: '',
		tasks,
		services,
		shifts,
		listings,
		profiles,
		categoryCounts: countCategories(query.type),
		suggestions: suggestionTitles(
			[...tasks, ...services, ...shifts, ...listings, ...profiles],
			query.q
		)
	};
}

/** @param {string} type */
function countCategories(type) {
	/** @type {Record<string, number>} */
	const counts = {};
	for (const doc of memoryDocs.values()) {
		if (type === 'task' && doc.type !== 'task') continue;
		if (type === 'service' && doc.type !== 'service') continue;
		if (type === 'shift' && doc.type !== 'shift') continue;
		if (type === 'listing' && doc.type !== 'listing') continue;
		if (type === 'profile') continue;
		if (!doc.category) continue;
		counts[doc.category] = (counts[doc.category] || 0) + 1;
	}
	return counts;
}

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} type
 */
export async function categoryCounts(env, type) {
	const result = await searchByType(env, parseSearchQuery({ type, q: '', perPage: '1' }));
	return {
		provider: result.provider,
		ready: result.ready,
		counts: result.categoryCounts || {}
	};
}

/**
 * One index document for a detail page. The admin key stays on the server.
 * @param {Record<string, string | undefined>} env
 * @param {string} type
 * @param {string} id
 */
export async function findPreview(env, type, id) {
	const provider = resolveProvider(env);
	const ready = providerReady(env);
	const wanted = String(id || '').trim();
	if (!ready || !wanted) return { provider, ready, hit: null };
	if (provider === 'memory') {
		const hit =
			[...memoryDocs.values()].find(
				(doc) =>
					doc.type ===
						(type === 'service'
							? 'service'
							: type === 'shift'
								? 'shift'
								: type === 'listing'
									? 'listing'
									: 'task') &&
					(doc.public_id === wanted || doc.id === wanted)
			) || null;
		return { provider, ready: true, hit };
	}
	if (provider !== 'typesense') return { provider, ready: false, hit: null };
	let collection;
	try {
		collection = typesenseCollectionName(
			env,
			collectionsForType(type === 'service' || type === 'shift' ? type : 'task')[0]
		);
	} catch {
		return { provider, ready: false, hit: null };
	}
	const filter = `public_id:=\`${wanted.replace(/`/g, '')}\``;
	try {
		const response = await typesenseFetch(
			env,
			`/collections/${collection}/documents/search?q=*&query_by=title&per_page=1&filter_by=${encodeURIComponent(filter)}`
		);
		if (!response.ok) return { provider, ready: false, hit: null };
		const body = await response.json();
		const hit = body.hits?.[0]?.document || null;
		return { provider, ready: true, hit };
	} catch {
		return { provider, ready: false, hit: null };
	}
}
