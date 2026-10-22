import { SEARCH_PROVIDER_MS } from '$lib/nostr/relayQuery';

/** Stop waiting on search and read the relay after this. */
export const INDEX_TIMEOUT_MS = SEARCH_PROVIDER_MS;

function readySearchProvider(provider: unknown): boolean {
	return provider === 'typesense' || provider === 'meilisearch';
}

/**
 * Typesense is the listing source when it is ready and returned rows.
 * A ready Meilisearch response is the fallback when Typesense errors or is unset.
 * An error, a provider that is not ready, or zero hits falls through to the relay.
 */
export function indexSuppliesListings(
	body: Record<string, unknown> | null | undefined,
	hitKey: string
): boolean {
	if (!body || !readySearchProvider(body.provider) || body.ready === false) return false;
	const hits = body[hitKey];
	return Array.isArray(hits) && hits.length > 0;
}

export function countsFromRows(rows: Array<{ categoryId: string }>): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const row of rows) {
		if (!row.categoryId) continue;
		counts[row.categoryId] = (counts[row.categoryId] || 0) + 1;
	}
	return counts;
}

export function categoriesWithListings<T extends { id: string }>(
	categories: readonly T[],
	counts: Record<string, number>
): T[] {
	return categories.filter((category) => (counts[category.id] || 0) > 0);
}

/** Task and service rails list every category. Staff keeps roles that have listings. */
export function browseTiles<T extends { id: string }>(
	categories: readonly T[],
	counts: Record<string, number>,
	showEveryCategory: boolean
): T[] {
	if (showEveryCategory) return [...categories];
	return categoriesWithListings(categories, counts);
}

const memoryHits = new Map<string, Record<string, unknown>>();

function asHit(hit: unknown): Record<string, unknown> | null {
	return hit && typeof hit === 'object' ? (hit as Record<string, unknown>) : null;
}

function hitStorageKey(type: string, id: string): string {
	return `bittasker-index:${type}:${id}`;
}

/** Keep a list row so the detail page can paint before the relay answers. */
export function cacheIndexHit(type: string, id: string, hit: unknown): void {
	const record = asHit(hit);
	if (!id || !record) return;
	memoryHits.set(hitStorageKey(type, id), record);
	if (typeof sessionStorage === 'undefined') return;
	try {
		sessionStorage.setItem(hitStorageKey(type, id), JSON.stringify(record));
	} catch {
		// A full cache must not block browse.
	}
}

export function readCachedHit(type: string, id: string): Record<string, unknown> | null {
	if (!id) return null;
	const memory = memoryHits.get(hitStorageKey(type, id));
	if (memory) return memory;
	if (typeof sessionStorage === 'undefined') return null;
	try {
		const raw = sessionStorage.getItem(hitStorageKey(type, id));
		if (!raw) return null;
		const parsed = asHit(JSON.parse(raw) as unknown);
		if (parsed) memoryHits.set(hitStorageKey(type, id), parsed);
		return parsed;
	} catch {
		return null;
	}
}

/** Search answers through the server route. Anything else falls back to relays. */
export async function fetchTypesenseJson(
	path: string,
	timeoutMs = INDEX_TIMEOUT_MS
): Promise<Record<string, unknown> | null> {
	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const response = await fetch(path, { signal: controller.signal });
		if (!response.ok) return null;
		const body = (await response.json()) as Record<string, unknown>;
		if (!body || !readySearchProvider(body.provider) || body.ready === false) return null;
		return body;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
