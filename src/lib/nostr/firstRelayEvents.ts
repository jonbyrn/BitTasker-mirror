import type { Event, Filter } from 'nostr-tools';

const FAST_RELAY_TIMEOUT_MS = 2500;

/** Unit tests must not open relay sockets. Production and dev do. */
export function fastRelayQueriesEnabled(): boolean {
	if (typeof process !== 'undefined' && process.env?.VITEST) return false;
	const vitest = import.meta.env.VITEST;
	if (vitest === true || vitest === 'true') return false;
	if (import.meta.env.MODE === 'test') return false;
	return true;
}

export function relayToHttpBase(relayUrl: string): string | null {
	const trimmed = relayUrl.trim().replace(/\/$/, '');
	if (!trimmed) return null;
	if (trimmed.startsWith('wss://')) return `https://${trimmed.slice('wss://'.length)}`;
	if (trimmed.startsWith('ws://')) return `http://${trimmed.slice('ws://'.length)}`;
	if (trimmed.startsWith('https://') || trimmed.startsWith('http://')) return trimmed;
	return null;
}

export function eventsQueryString(filter: Filter): string {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(filter)) {
		if (value == null) continue;
		if (Array.isArray(value)) {
			for (const item of value) {
				if (item == null) continue;
				params.append(`${key}[]`, String(item));
			}
			continue;
		}
		params.set(key, String(value));
	}
	return params.toString();
}

/**
 * Ask each relay's HTTP API at once and return the first non-empty page.
 * Slower relays are aborted. An empty or failed relay does not hold up the list.
 */
export async function firstRelayEvents(
	relayUrls: readonly string[],
	filter: Filter,
	fetchImpl: typeof fetch = fetch,
	signal?: AbortSignal,
	timeoutMs = FAST_RELAY_TIMEOUT_MS
): Promise<Event[] | null> {
	const bases = [...new Set(relayUrls.map(relayToHttpBase).filter((url): url is string => !!url))];
	if (bases.length === 0) return null;

	const query = eventsQueryString(filter);
	const controller = new AbortController();
	const onAbort = () => controller.abort();
	if (signal) {
		if (signal.aborted) controller.abort();
		else signal.addEventListener('abort', onAbort, { once: true });
	}
	const timer = setTimeout(() => controller.abort(), timeoutMs);

	try {
		const winner = await Promise.any(
			bases.map(async (base) => {
				const response = await fetchImpl(`${base}/api/v1/events?${query}`, {
					signal: controller.signal,
					headers: { Accept: 'application/json' }
				});
				if (!response.ok) throw new Error(`relay ${response.status}`);
				const body = (await response.json()) as { data?: Event[] } | Event[];
				const events = Array.isArray(body) ? body : body?.data;
				if (!Array.isArray(events) || events.length === 0) throw new Error('empty');
				return events;
			})
		);
		return winner;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
		controller.abort();
		signal?.removeEventListener('abort', onAbort);
	}
}
