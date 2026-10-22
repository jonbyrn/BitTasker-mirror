import { collectionPrefix } from './search-api.js';

/** Listing relay first, then the public relays the indexer always reads. */
export const DEFAULT_SEARCH_RELAYS = [
	'wss://relay2.bittasker.com',
	'wss://nos.lol',
	'wss://relay.primal.net'
];

/** Dev catalog. relay1-dev and relay2-dev, not production relay1 or relay2. */
export const DEV_INDEX_RELAYS = [
	'wss://relay1-dev.bittasker.com',
	'wss://relay2-dev.bittasker.com'
];

/** Sandbox catalog. The rgb_ collections are filled from the same relays the app reads, plus the public relays. */
export const SANDBOX_INDEX_RELAYS = [
	'wss://relay.bittasker.com',
	'wss://relay2.bittasker.com',
	'wss://nos.lol',
	'wss://relay.primal.net'
];

/** Public relays. Kind 0 here is the whole network, so profiles are author-scoped. */
export const PUBLIC_INDEX_RELAYS = ['wss://nos.lol', 'wss://relay.primal.net'];

/** A catalog page waits for EOSE. An 8s timeout used to look like the last page. */
export const INDEX_PAGE_MS = 20_000;

/**
 * NOSTR_RELAY_URLS overrides the default list. A single public relay env
 * (VITE_NOSTR_RELAY_URL) is not used here, because that would drop relay2.
 *
 * @param {Record<string, string | undefined>} env
 * @param {string[] | undefined} [override]
 */
export function searchRelays(env, override) {
	if (Array.isArray(override) && override.length) {
		return override.map((relay) => String(relay).trim()).filter(Boolean);
	}
	const raw = String(env.NOSTR_RELAY_URLS || '').trim();
	if (!raw) return [...DEFAULT_SEARCH_RELAYS];
	return raw
		.split(',')
		.map((relay) => relay.trim())
		.filter(Boolean);
}

/**
 * Prefix selects the catalog when NOSTR_RELAY_URLS is unset.
 * dev_ reads the dev relays unless NOSTR_RELAY_URLS is set.
 * rgb_ always reads the sandbox list, including relay2.
 * @param {Record<string, string | undefined>} env
 */
export function indexerRelays(env) {
	let prefix = '';
	try {
		prefix = collectionPrefix(env);
	} catch {
		prefix = '';
	}
	// An older typesense.env omits relay2. rgb_ must still read it.
	if (prefix === 'rgb_') return [...SANDBOX_INDEX_RELAYS];
	if (String(env.NOSTR_RELAY_URLS || '').trim()) return searchRelays(env);
	if (prefix === 'dev_') return [...DEV_INDEX_RELAYS];
	return searchRelays(env);
}

/**
 * The next `until` for a full page, or null when this page is the end.
 * @param {Array<{ created_at?: number }>} events
 * @param {number} limit
 */
export function nextRelayUntil(events, limit) {
	if (!Array.isArray(events) || events.length < limit) return null;
	let oldest = null;
	for (const event of events) {
		const created = Number(event?.created_at);
		if (!Number.isFinite(created)) continue;
		if (oldest == null || created < oldest) oldest = created;
	}
	if (oldest == null) return null;
	return oldest - 1;
}

/**
 * One relay, newest page first, then that relay's own `until` until its page is short.
 * A shared cursor across relays drops events that were not in the newest merged slice.
 * A timeout that returns a short page is not the end of the relay.
 *
 * @param {string} url
 * @param {number} kind
 * @param {(url: string, filters: Array<Record<string, unknown>>, timeoutMs?: number) => Promise<any>} [query]
 * @param {number} [limit]
 * @param {{ filter?: Record<string, unknown>, timeoutMs?: number, onPage?: (page: { page: number, events: any[], until: number | null, timedOut: boolean }) => Promise<void> | void }} [options]
 */
export async function queryKindUntilExhausted(url, kind, query, limit = 200, options = {}) {
	const read = query || queryRelayPage;
	const timeoutMs = options.timeoutMs ?? INDEX_PAGE_MS;
	/** @type {any[]} */
	const events = [];
	const seen = new Set();
	const cursors = new Set();
	/** @type {number | undefined} */
	let until;
	for (let page = 1; ; page += 1) {
		/** @type {Record<string, unknown>} */
		const filter = { kinds: [kind], limit, ...(options.filter || {}) };
		if (until != null) filter.until = until;
		let current = await readPage(read, url, filter, timeoutMs);
		if (!current.eose && current.events.length < limit) {
			const retry = await readPage(read, url, filter, timeoutMs);
			if (retry.events.length >= current.events.length) current = retry;
		}
		/** @type {any[]} */
		const fresh = [];
		for (const event of current.events) {
			if (!event?.id || seen.has(event.id)) continue;
			seen.add(event.id);
			events.push(event);
			fresh.push(event);
		}
		const timedOut = !current.eose && current.events.length < limit;
		if (options.onPage) {
			await options.onPage({ page, events: fresh, until: until ?? null, timedOut });
		}
		const next = nextRelayUntil(current.events, limit);
		if (
			next == null ||
			fresh.length === 0 ||
			cursors.has(next) ||
			(until != null && next >= until)
		) {
			break;
		}
		cursors.add(next);
		until = next;
	}
	return events;
}

/**
 * @param {(url: string, filters: Array<Record<string, unknown>>, timeoutMs?: number) => Promise<any>} query
 * @param {string} url
 * @param {Record<string, unknown>} filter
 * @param {number} timeoutMs
 */
async function readPage(query, url, filter, timeoutMs) {
	const result = await query(url, [filter], timeoutMs);
	if (
		result &&
		typeof result === 'object' &&
		!Array.isArray(result) &&
		Array.isArray(result.events)
	) {
		return { events: result.events, eose: result.eose !== false };
	}
	return { events: Array.isArray(result) ? result : [], eose: true };
}

/**
 * One REQ per call. Resolves with whether the relay sent EOSE.
 * A timeout is `eose: false` so the caller does not treat a short page as the end.
 * @param {string} url
 * @param {Array<Record<string, unknown>>} filters
 * @param {number} [timeoutMs]
 */
export function queryRelayPage(url, filters, timeoutMs = INDEX_PAGE_MS) {
	if (typeof WebSocket === 'undefined') return Promise.resolve({ events: [], eose: true });
	return new Promise((resolve) => {
		/** @type {any[]} */
		const events = [];
		const seen = new Set();
		let settled = false;
		/** @type {WebSocket | null} */
		let socket = null;
		const finish = (eose) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				socket?.close();
			} catch {
				// Closing a failed socket is optional.
			}
			resolve({ events, eose });
		};
		const timer = setTimeout(() => finish(false), timeoutMs);
		try {
			socket = new WebSocket(url);
		} catch {
			finish(true);
			return;
		}
		socket.onopen = () => {
			if (socket?.readyState !== WebSocket.OPEN) return;
			try {
				socket.send(JSON.stringify(['REQ', 'bittasker-search', ...filters]));
			} catch {
				// The socket can close between OPEN and send.
			}
		};
		socket.onmessage = (message) => {
			let data;
			try {
				data = JSON.parse(String(message.data));
			} catch {
				return;
			}
			if (data[0] === 'EVENT' && data[2]?.id && !seen.has(data[2].id)) {
				seen.add(data[2].id);
				events.push(data[2]);
			}
			if (data[0] === 'EOSE' || data[0] === 'CLOSED') finish(true);
		};
		socket.onerror = () => finish(false);
	});
}

/**
 * One REQ per call. Used by the backfill route and the long-running indexer.
 * @param {string} url
 * @param {Array<Record<string, unknown>>} filters
 * @param {number} [timeoutMs]
 */
export function queryRelay(url, filters, timeoutMs = INDEX_PAGE_MS) {
	return queryRelayPage(url, filters, timeoutMs).then((page) => page.events);
}

/**
 * Keep a subscription open and reconnect. Returns a stop function.
 * @param {string} url
 * @param {Array<Record<string, unknown>>} filters
 * @param {(event: any) => void} onEvent
 */
export function subscribeRelay(url, filters, onEvent) {
	let stopped = false;
	/** @type {WebSocket | null} */
	let socket = null;
	/** @type {ReturnType<typeof setTimeout> | null} */
	let retry = null;

	const connect = () => {
		if (stopped || typeof WebSocket === 'undefined') return;
		try {
			socket = new WebSocket(url);
		} catch {
			retry = setTimeout(connect, 3000);
			return;
		}
		socket.onopen = () => {
			if (socket?.readyState !== WebSocket.OPEN) return;
			try {
				socket.send(JSON.stringify(['REQ', 'bittasker-live', ...filters]));
			} catch {
				// The socket can close between OPEN and send.
			}
		};
		socket.onmessage = (message) => {
			let data;
			try {
				data = JSON.parse(String(message.data));
			} catch {
				return;
			}
			if (data[0] === 'EVENT' && data[2]) onEvent(data[2]);
		};
		socket.onclose = () => {
			if (!stopped) retry = setTimeout(connect, 3000);
		};
		socket.onerror = () => {
			try {
				socket?.close();
			} catch {
				// The close handler reconnects.
			}
		};
	};

	connect();
	return () => {
		stopped = true;
		if (retry) clearTimeout(retry);
		try {
			socket?.close();
		} catch {
			// Already closed.
		}
	};
}
