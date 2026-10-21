import { SEARCH_PROVIDER_MS } from '$lib/nostr/relayQuery';

/** Stop waiting on search and read the relay after this. */
export const INDEX_TIMEOUT_MS = SEARCH_PROVIDER_MS;

/**
 * The search provider is a listing source only when it is Typesense, ready, and it returned rows.
 * An error, a provider that is not ready, or zero hits falls through to the relay.
 */
export function indexSuppliesListings(
	body: Record<string, unknown> | null | undefined,
	hitKey: string
): boolean {
	if (!body || body.provider !== 'typesense' || body.ready === false) return false;
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

export function cacheIndexHit(type: string, id: string, hit: unknown): void {
	if (typeof sessionStorage === 'undefined' || !id) return;
	try {
		sessionStorage.setItem(`bittasker-index:${type}:${id}`, JSON.stringify(hit));
	} catch {
		// A full cache must not block browse.
	}
}

export function readCachedHit(type: string, id: string): Record<string, unknown> | null {
	if (typeof sessionStorage === 'undefined' || !id) return null;
	try {
		const raw = sessionStorage.getItem(`bittasker-index:${type}:${id}`);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

/** Typesense answers through the server route. Anything else falls back to relays. */
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
		if (!body || body.provider !== 'typesense' || body.ready === false) return null;
		return body;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
