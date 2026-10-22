/** Kinds the dev and rgb catalogs index from GET /api/v1/events. */
export const CATALOG_KINDS = [31000, 30402, 31150];

const PAGE_SIZE = 100;
const MAX_PAGES = 40;

/**
 * @param {string} prefix
 */
export function httpOriginForPrefix(prefix) {
	if (prefix === 'dev_') return 'https://relay2-dev.bittasker.com';
	if (prefix === 'rgb_') return 'https://relay.bittasker.com';
	return '';
}

/**
 * Hand-made sample documents. Relay events never use these ids.
 * @param {string} prefix
 */
export function fixtureRemovals(prefix) {
	const label = prefix === 'rgb_' ? 'rgb' : prefix === 'dev_' ? 'dev' : '';
	if (!label) return [];
	/** @type {Array<Record<string, string>>} */
	const actions = [];
	for (const id of [`test-${label}-tasks-0`, `test-${label}-tasks-1`]) {
		actions.push({ op: 'remove', collection: 'tasks', id });
	}
	for (const id of [`test-${label}-services-0`, `test-${label}-services-1`]) {
		actions.push({ op: 'remove', collection: 'services', id });
	}
	for (const collection of ['tasks', 'services', 'shifts']) {
		actions.push({ op: 'remove-filter', collection, filter: 'pubkey:=`test`' });
	}
	return actions;
}

/**
 * Page a relay HTTP catalog. `until` walks older than the previous page.
 * @param {string} origin
 * @param {number} kind
 * @param {typeof fetch} [fetchImpl]
 */
export async function fetchCatalogEvents(origin, kind, fetchImpl = fetch) {
	const base = String(origin || '').replace(/\/$/, '');
	if (!base) throw new Error('Relay HTTP origin is missing');
	/** @type {any[]} */
	const events = [];
	const seen = new Set();
	/** @type {number | null} */
	let until = null;
	for (let page = 0; page < MAX_PAGES; page += 1) {
		const url = new URL('/api/v1/events', base);
		url.searchParams.set('kinds', String(kind));
		url.searchParams.set('limit', String(PAGE_SIZE));
		if (until != null) url.searchParams.set('until', String(until));
		const response = await fetchImpl(url, {
			headers: {
				Accept: 'application/json',
				'User-Agent': 'BitTaskerIndexer/1.0'
			}
		});
		if (!response.ok) throw new Error(`Relay events kind ${kind} failed (${response.status})`);
		const body = await response.json();
		const batch = Array.isArray(body?.data) ? body.data : [];
		if (!batch.length) break;
		for (const event of batch) {
			if (!event || typeof event !== 'object' || !event.id || seen.has(event.id)) continue;
			seen.add(event.id);
			events.push(event);
		}
		const oldest = Math.min(...batch.map((event) => Number(event.created_at) || 0));
		if (batch.length < PAGE_SIZE || !Number.isFinite(oldest)) break;
		if (until != null && oldest >= until) break;
		until = oldest - 1;
	}
	return events;
}
