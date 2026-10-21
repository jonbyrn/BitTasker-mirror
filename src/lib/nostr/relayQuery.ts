import type { Event, Filter } from 'nostr-tools';
import { safeSocketSend } from '$lib/utils/relayUrls';

const RELAY_QUERY_MS = 8000;
/** Browse and category listings should paint inside a few seconds. */
export const LISTING_QUERY_MS = 2500;
/** A list that is still empty after this shows a retry instead of spinning. */
export const BROWSE_DEADLINE_MS = LISTING_QUERY_MS;

export type RelayQueryOptions = {
	timeoutMs?: number;
	onEvents?: (events: Event[]) => void;
};

function isRelayEvent(value: unknown): value is Event {
	if (typeof value !== 'object' || value === null) return false;
	const event = value as Partial<Event>;
	return (
		typeof event.id === 'string' &&
		typeof event.pubkey === 'string' &&
		typeof event.created_at === 'number' &&
		typeof event.content === 'string' &&
		Array.isArray(event.tags)
	);
}

/** Read events with one REQ per relay. The shared pool can leave a query open. */
export function queryRelayEvents(
	relays: string[],
	filter: Filter,
	options: RelayQueryOptions = {}
): Promise<Event[]> {
	if (relays.length === 0 || typeof WebSocket === 'undefined') return Promise.resolve([]);

	return new Promise((resolve) => {
		const events: Event[] = [];
		const seen = new Set<string>();
		const sockets: WebSocket[] = [];
		let pending = relays.length;
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(events);
			for (const openSocket of sockets) {
				try {
					if (
						openSocket.readyState === WebSocket.OPEN ||
						openSocket.readyState === WebSocket.CONNECTING
					) {
						openSocket.close();
					}
				} catch {
					// A failed socket close must not leave the query pending.
				}
			}
		};
		const timer = setTimeout(finish, options.timeoutMs ?? RELAY_QUERY_MS);

		const finishedRelay = (socket: WebSocket) => {
			pending -= 1;
			try {
				if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
					socket.close();
				}
			} catch {
				// Ignore close failures and still finish the query.
			}
			if (pending <= 0) finish();
		};

		relays.forEach((url, index) => {
			const subId = `relay-${index}`;
			let closed = false;
			let attempts = 0;
			let generation = 0;

			const connect = () => {
				const mine = ++generation;
				attempts += 1;
				let socket: WebSocket;
				try {
					socket = new WebSocket(url);
					sockets.push(socket);
				} catch {
					if (attempts < 2 && !settled) {
						connect();
						return;
					}
					pending -= 1;
					if (pending <= 0) finish();
					return;
				}

				let subscribed = false;
				let replaced = false;
				const finishRelay = () => {
					if (closed || mine !== generation) return;
					closed = true;
					finishedRelay(socket);
				};
				const retry = () => {
					if (replaced || closed || settled || attempts >= 2) {
						finishRelay();
						return;
					}
					replaced = true;
					connect();
				};

				socket.onopen = () => {
					if (mine !== generation || closed) return;
					subscribed = safeSocketSend(socket, JSON.stringify(['REQ', subId, filter]));
					if (!subscribed) retry();
				};
				socket.onerror = () => {
					if (mine !== generation || replaced || closed || !subscribed) return;
					finishRelay();
				};
				// A relay that drops the socket before the REQ must be tried once more.
				socket.onclose = () => {
					if (mine !== generation || replaced || closed) return;
					if (!subscribed) {
						retry();
						return;
					}
					finishRelay();
				};
				socket.onmessage = (message: MessageEvent) => {
					if (mine !== generation || typeof message.data !== 'string') return;
					let frame: unknown;
					try {
						frame = JSON.parse(message.data);
					} catch {
						return;
					}
					if (!Array.isArray(frame)) return;
					// relay2 sends ["AUTH", challenge] and still streams the catalog.
					// Signing that challenge can open a passkey prompt, so reads ignore it.
					if (frame[0] === 'AUTH') return;
					if (frame[1] !== subId) return;
					if (frame[0] === 'EVENT' && isRelayEvent(frame[2]) && !seen.has(frame[2].id)) {
						seen.add(frame[2].id);
						events.push(frame[2]);
						options.onEvents?.(events.slice());
					}
					if (frame[0] === 'EOSE' || frame[0] === 'CLOSED') finishRelay();
				};
			};
			connect();
		});
	});
}
