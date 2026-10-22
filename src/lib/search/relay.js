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
 * REQ newest-first, then `until`, until a page is short. No page cap.
 * @param {string} url
 * @param {number} kind
 * @param {(url: string, filters: Array<Record<string, unknown>>) => Promise<any[]>} [query]
 * @param {number} [limit]
 */
export async function queryKindUntilExhausted(url, kind, query = queryRelay, limit = 200) {
	/** @type {any[]} */
	const events = [];
	const seen = new Set();
	/** @type {number | undefined} */
	let until;
	for (;;) {
		/** @type {Record<string, unknown>} */
		const filter = { kinds: [kind], limit };
		if (until != null) filter.until = until;
		const batch = await query(url, [filter]);
		let added = 0;
		for (const event of batch) {
			if (!event?.id || seen.has(event.id)) continue;
			seen.add(event.id);
			events.push(event);
			added += 1;
		}
		const next = nextRelayUntil(batch, limit);
		if (next == null || added === 0 || (until != null && next >= until)) break;
		until = next;
	}
	return events;
}

/**
 * One REQ per call. Used by the backfill route and the long-running indexer.
 * @param {string} url
 * @param {Array<Record<string, unknown>>} filters
 * @param {number} [timeoutMs]
 */
export function queryRelay(url, filters, timeoutMs = 8000) {
	if (typeof WebSocket === 'undefined') return Promise.resolve([]);
	return new Promise((resolve) => {
		/** @type {any[]} */
		const events = [];
		const seen = new Set();
		let settled = false;
		/** @type {WebSocket | null} */
		let socket = null;
		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			try {
				socket?.close();
			} catch {
				// Closing a failed socket is optional.
			}
			resolve(events);
		};
		const timer = setTimeout(finish, timeoutMs);
		try {
			socket = new WebSocket(url);
		} catch {
			finish();
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
			if (data[0] === 'EOSE') finish();
		};
		socket.onerror = () => finish();
	});
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
