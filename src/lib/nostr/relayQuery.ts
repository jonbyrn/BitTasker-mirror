import type { Event, Filter } from 'nostr-tools';

const RELAY_QUERY_MS = 8000;

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
export function queryRelayEvents(relays: string[], filter: Filter): Promise<Event[]> {
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
		const timer = setTimeout(finish, RELAY_QUERY_MS);

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
			let socket: WebSocket;
			try {
				socket = new WebSocket(url);
				sockets.push(socket);
			} catch {
				pending -= 1;
				if (pending <= 0) finish();
				return;
			}

			let closed = false;
			const finishRelay = () => {
				if (closed) return;
				closed = true;
				finishedRelay(socket);
			};
			const subId = `relay-${index}`;
			socket.onopen = () => {
				socket.send(JSON.stringify(['REQ', subId, filter]));
			};
			socket.onerror = () => finishRelay();
			socket.onmessage = (message: MessageEvent) => {
				if (typeof message.data !== 'string') return;
				let frame: unknown;
				try {
					frame = JSON.parse(message.data);
				} catch {
					return;
				}
				if (!Array.isArray(frame) || frame[1] !== subId) return;
				if (frame[0] === 'EVENT' && isRelayEvent(frame[2]) && !seen.has(frame[2].id)) {
					seen.add(frame[2].id);
					events.push(frame[2]);
				}
				if (frame[0] === 'EOSE' || frame[0] === 'CLOSED') finishRelay();
			};
		});
	});
}
