import type { Event, Filter } from 'nostr-tools';
import { resolveExplicitRelayUrls } from '$lib/utils/relayUrls';

const RELAY_QUERY_MS = 8000;

export interface RelayOutcome {
	url: string;
	ok: boolean;
	reason: string;
}

export interface RelayQueryReport {
	events: Event[];
	relays: RelayOutcome[];
}

/** Relays that store user chat. The task relay is not one of them. */
export function messageRelayUrls(): string[] {
	return resolveExplicitRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL);
}

/**
 * relay2 (nostr-relay-nestjs) answers every request with NIP-42 AUTH and never
 * sends EOSE unless the client signs that challenge. This app does not.
 * NDK still waits for that relay once a task page has added it to the pool,
 * so a DM read that uses the shared pool never finishes.
 */
export const RELAY_SIGN_IN_REASON = 'asked for a sign-in this app does not send';

export function clarifyDeliveryFailure(message: string, relays: string[]): string {
	const where = relays.length > 0 ? relays.join(', ') : 'the message relay';
	if (/auth/i.test(message) || message.includes(RELAY_SIGN_IN_REASON)) {
		return `Message was not delivered. ${where} ${RELAY_SIGN_IN_REASON}.`;
	}
	if (/timeout/i.test(message)) {
		return `Message was not delivered. ${where} timed out.`;
	}
	if (/could not connect|failed to publish|websocket|econn|network/i.test(message)) {
		return `Message was not delivered. ${where} could not be reached.`;
	}
	return message;
}

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

function outcome(
	url: string,
	opened: boolean,
	sawAuth: boolean,
	sawEose: boolean,
	errored: boolean
): RelayOutcome {
	if (sawAuth && !sawEose) return { url, ok: false, reason: RELAY_SIGN_IN_REASON };
	if (!opened) return { url, ok: false, reason: 'could not connect' };
	if (sawEose) return { url, ok: true, reason: 'ok' };
	if (errored) return { url, ok: false, reason: 'connection failed' };
	return { url, ok: false, reason: 'timed out before the relay finished' };
}

/** One REQ per relay, with a deadline. A relay that never answers does not stall the rest. */
export function queryRelaysDetailed(
	relays: string[],
	filters: Filter[],
	timeoutMs = RELAY_QUERY_MS
): Promise<RelayQueryReport> {
	if (relays.length === 0 || filters.length === 0 || typeof WebSocket === 'undefined') {
		return Promise.resolve({
			events: [],
			relays: relays.map((url) => ({ url, ok: false, reason: 'could not connect' }))
		});
	}

	return new Promise((resolve) => {
		const events: Event[] = [];
		const seen = new Set<string>();
		const results = new Map<string, RelayOutcome>();
		const sockets: WebSocket[] = [];
		let pending = relays.length;
		let settled = false;

		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			for (const url of relays) {
				if (!results.has(url)) {
					results.set(url, { url, ok: false, reason: 'timed out before the relay finished' });
				}
			}
			resolve({ events, relays: relays.map((url) => results.get(url)!) });
			for (const socket of sockets) {
				try {
					if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
						socket.close();
					}
				} catch {
					// Closing a failed socket must not leave the query pending.
				}
			}
		};
		const timer = setTimeout(finish, timeoutMs);

		const finishRelay = (url: string, next: RelayOutcome, socket: WebSocket) => {
			if (results.has(url)) return;
			results.set(url, next);
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
				results.set(url, { url, ok: false, reason: 'could not connect' });
				pending -= 1;
				if (pending <= 0) finish();
				return;
			}

			let opened = false;
			let sawAuth = false;
			let sawEose = false;
			let errored = false;
			const subId = `dm-${index}`;
			socket.onopen = () => {
				opened = true;
				socket.send(JSON.stringify(['REQ', subId, ...filters]));
			};
			socket.onerror = () => {
				errored = true;
				if (!opened) finishRelay(url, outcome(url, opened, sawAuth, sawEose, errored), socket);
			};
			socket.onclose = () => {
				if (!results.has(url)) {
					finishRelay(url, outcome(url, opened, sawAuth, sawEose, errored), socket);
				}
			};
			socket.onmessage = (message: MessageEvent) => {
				if (typeof message.data !== 'string') return;
				let frame: unknown;
				try {
					frame = JSON.parse(message.data);
				} catch {
					return;
				}
				if (!Array.isArray(frame)) return;
				if (frame[0] === 'AUTH') {
					sawAuth = true;
					finishRelay(url, outcome(url, opened, sawAuth, sawEose, errored), socket);
					return;
				}
				if (frame[1] !== subId) return;
				if (frame[0] === 'EVENT' && isRelayEvent(frame[2]) && !seen.has(frame[2].id)) {
					seen.add(frame[2].id);
					events.push(frame[2]);
				}
				if (frame[0] === 'EOSE' || frame[0] === 'CLOSED') {
					sawEose = frame[0] === 'EOSE';
					const reason =
						frame[0] === 'CLOSED' && typeof frame[2] === 'string' && !sawEose
							? frame[2]
							: undefined;
					finishRelay(
						url,
						reason && !sawEose
							? { url, ok: false, reason }
							: outcome(url, opened, sawAuth, sawEose, errored),
						socket
					);
				}
			};
		});
	});
}

/** Live REQ. Calls onFailure once per relay that cannot serve the filter. */
export function subscribeRelayEvents(
	relays: string[],
	filters: Filter[],
	onEvent: (event: Event) => void,
	onFailure?: (url: string, reason: string) => void
): () => void {
	if (relays.length === 0 || filters.length === 0 || typeof WebSocket === 'undefined') {
		if (relays.length === 0) onFailure?.('', 'could not connect');
		return () => undefined;
	}

	const sockets: WebSocket[] = [];
	const failed = new Set<string>();
	let stopped = false;

	const fail = (url: string, reason: string) => {
		if (stopped || failed.has(url)) return;
		failed.add(url);
		onFailure?.(url, reason);
	};

	relays.forEach((url, index) => {
		let socket: WebSocket;
		try {
			socket = new WebSocket(url);
		} catch {
			fail(url, 'could not connect');
			return;
		}
		sockets.push(socket);
		let opened = false;
		const subId = `dm-live-${index}-${Math.random().toString(36).slice(2, 8)}`;
		socket.onopen = () => {
			opened = true;
			if (stopped) {
				socket.close();
				return;
			}
			socket.send(JSON.stringify(['REQ', subId, ...filters]));
		};
		socket.onerror = () => {
			if (!opened) fail(url, 'could not connect');
		};
		socket.onmessage = (message: MessageEvent) => {
			if (typeof message.data !== 'string') return;
			let frame: unknown;
			try {
				frame = JSON.parse(message.data);
			} catch {
				return;
			}
			if (!Array.isArray(frame)) return;
			if (frame[0] === 'AUTH') {
				fail(url, RELAY_SIGN_IN_REASON);
				return;
			}
			if (frame[1] !== subId) return;
			if (frame[0] === 'EVENT' && isRelayEvent(frame[2])) onEvent(frame[2]);
			if (frame[0] === 'CLOSED') {
				fail(url, typeof frame[2] === 'string' ? frame[2] : 'connection failed');
			}
		};
	});

	return () => {
		stopped = true;
		for (const socket of sockets) {
			try {
				if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
					socket.close();
				}
			} catch {
				// Unsubscribe must not throw.
			}
		}
	};
}
