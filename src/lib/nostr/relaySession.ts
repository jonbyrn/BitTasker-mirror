import type { Event, EventTemplate, Filter } from 'nostr-tools';
import { sanitizeRelayUrls } from '$lib/utils/relayUrls';

const RELAY_QUERY_MS = 8000;
/** NIP-17 inbox relay list. Kind 10050, with `relay` tags. */
export const NIP17_INBOX_KIND = 10050;

/**
 * Relays that actually carry direct messages on the environments where chat works.
 * Confirmed from the live bundles (DEFAULT_RELAYS = VITE_NOSTR_RELAY_URL):
 * dev.bittasker.com uses wss://relay1-dev.bittasker.com,
 * staging.bittasker.com and bittasker.com use wss://relay1.bittasker.com.
 * Task and catalog relays (relay2, relay2-dev) are not in that list.
 */
const WORKING_DM_RELAYS = ['wss://relay1.bittasker.com', 'wss://relay1-dev.bittasker.com'];
/** Used when a BitTasker relay is down. One acceptance is still enough. */
const PUBLIC_DM_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];

function uniqueRelays(urls: string[]): string[] {
	const seen = new Set<string>();
	const list: string[] = [];
	for (const url of urls) {
		const key = url.replace(/\/$/, '');
		if (seen.has(key)) continue;
		seen.add(key);
		list.push(key);
	}
	return list;
}

export interface RelayOutcome {
	url: string;
	ok: boolean;
	reason: string;
}

export interface RelayQueryReport {
	events: Event[];
	relays: RelayOutcome[];
}

/**
 * Relays that store user chat. Sandbox uses the same relays as dev, staging,
 * and production, then public relays if those do not answer.
 * The task catalog still publishes on its own relay. This list is only for DMs.
 */
export function messageRelayUrls(): string[] {
	return uniqueRelays([...WORKING_DM_RELAYS, ...PUBLIC_DM_RELAYS]);
}

/** Relay URLs advertised on a NIP-17 kind 10050 inbox event. */
export function inboxRelaysFromEvents(events: { tags?: string[][] }[]): string[] {
	const urls: string[] = [];
	for (const event of events) {
		for (const tag of event.tags ?? []) {
			if (tag[0] !== 'relay' || !tag[1]) continue;
			urls.push(...sanitizeRelayUrls(tag[1]));
		}
	}
	return uniqueRelays(urls);
}

/** Static DM relays plus each pubkey's NIP-17 inbox relays. A lookup miss keeps the static list. */
export async function relaysForDirectMessages(pubkeys: string[]): Promise<string[]> {
	const base = messageRelayUrls();
	const authors = [
		...new Set(pubkeys.map((pubkey) => pubkey.trim().toLowerCase()).filter((pubkey) => /^[a-f0-9]{64}$/.test(pubkey)))
	];
	if (authors.length === 0 || base.length === 0) return base;
	try {
		const report = await queryRelaysDetailed(
			base,
			[{ kinds: [NIP17_INBOX_KIND], authors, limit: 10 }],
			4000
		);
		return uniqueRelays([...base, ...inboxRelaysFromEvents(report.events)]);
	} catch (error: unknown) {
		console.warn(
			'[messages] inbox relay lookup failed',
			error instanceof Error ? error.message : error
		);
		return base;
	}
}

/**
 * relay2 (nostr-relay-nestjs) answers with NIP-42 AUTH and does not serve a REQ
 * or EVENT until the client signs that challenge. The signature is kind 22242
 * from the logged-in session key. It does not open a passkey prompt.
 */
export const RELAY_SIGN_IN_REASON = 'asked for a sign-in this app does not send';

export type RelayAuthSigner = (relayUrl: string, challenge: string) => Promise<Event>;

function isSignerLocked(error: unknown): error is Error {
	return error instanceof Error && error.name === 'SignerLockedError';
}

/** Kind 22242 for the relay that just sent ["AUTH", challenge]. Session key only. */
export async function signRelayAuth(relayUrl: string, challenge: string): Promise<Event> {
	const [{ makeAuthEvent }, { finalizeEvent }, { getNostrKeyPair }] = await Promise.all([
		import('nostr-tools/nip42'),
		import('nostr-tools/pure'),
		import('$lib/utils/nostrKeys')
	]);
	const { nsec } = await getNostrKeyPair();
	const template: EventTemplate = makeAuthEvent(relayUrl, challenge);
	return finalizeEvent(template, nsec);
}

function authChallenge(frame: unknown[]): string {
	return typeof frame[1] === 'string' ? frame[1] : '';
}

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

function sendJson(socket: WebSocket, frame: unknown[]): void {
	if (socket.readyState !== WebSocket.OPEN) return;
	socket.send(JSON.stringify(frame));
}

/**
 * Sign the challenge and send ["AUTH", event]. Returns the auth event id.
 * A locked session rejects with SignerLockedError and does not prompt.
 */
function beginRelayAuth(
	socket: WebSocket,
	url: string,
	challenge: string,
	signAuth: RelayAuthSigner,
	onSigned: (eventId: string) => void,
	onFailed: (error: unknown) => void
): void {
	void signAuth(url, challenge).then(
		(signed) => {
			onSigned(signed.id);
			sendJson(socket, ['AUTH', signed]);
		},
		(error: unknown) => onFailed(error)
	);
}

/** One REQ per relay, with a deadline. A relay that never answers does not stall the rest. */
export function queryRelaysDetailed(
	relays: string[],
	filters: Filter[],
	timeoutMs = RELAY_QUERY_MS,
	signAuth: RelayAuthSigner = signRelayAuth
): Promise<RelayQueryReport> {
	if (relays.length === 0 || filters.length === 0 || typeof WebSocket === 'undefined') {
		return Promise.resolve({
			events: [],
			relays: relays.map((url) => ({ url, ok: false, reason: 'could not connect' }))
		});
	}

	return new Promise((resolve, reject) => {
		const events: Event[] = [];
		const seen = new Set<string>();
		const results = new Map<string, RelayOutcome>();
		const sockets: WebSocket[] = [];
		let pending = relays.length;
		let settled = false;
		let signerLock: Error | null = null;

		const finish = () => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			for (const url of relays) {
				if (!results.has(url)) {
					results.set(url, { url, ok: false, reason: 'timed out before the relay finished' });
				}
			}
			const report = { events, relays: relays.map((url) => results.get(url)!) };
			if (signerLock && report.relays.every((relay) => !relay.ok)) reject(signerLock);
			else resolve(report);
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
			let authEventId = '';
			const subId = `dm-${index}`;
			const sendReq = () => sendJson(socket, ['REQ', subId, ...filters]);
			socket.onopen = () => {
				opened = true;
				sendReq();
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
					if (authEventId || sawAuth) return;
					sawAuth = true;
					beginRelayAuth(
						socket,
						url,
						authChallenge(frame),
						signAuth,
						(eventId) => {
							authEventId = eventId;
						},
						(error) => {
							if (isSignerLocked(error)) signerLock = error;
							const reason = isSignerLocked(error)
								? error.message
								: error instanceof Error && error.message
									? error.message
									: RELAY_SIGN_IN_REASON;
							finishRelay(url, { url, ok: false, reason }, socket);
						}
					);
					return;
				}
				if (frame[0] === 'OK' && authEventId && frame[1] === authEventId) {
					if (frame[2] === true) {
						sendReq();
						return;
					}
					const reason = typeof frame[3] === 'string' ? frame[3] : RELAY_SIGN_IN_REASON;
					finishRelay(url, { url, ok: false, reason }, socket);
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
	onFailure?: (url: string, reason: string) => void,
	signAuth: RelayAuthSigner = signRelayAuth
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
		let authEventId = '';
		let authStarted = false;
		const subId = `dm-live-${index}-${Math.random().toString(36).slice(2, 8)}`;
		const sendReq = () => sendJson(socket, ['REQ', subId, ...filters]);
		socket.onopen = () => {
			opened = true;
			if (stopped) {
				socket.close();
				return;
			}
			sendReq();
		};
		socket.onerror = () => {
			if (!opened) fail(url, 'could not connect');
		};
		socket.onmessage = (message: MessageEvent) => {
			if (stopped || typeof message.data !== 'string') return;
			let frame: unknown;
			try {
				frame = JSON.parse(message.data);
			} catch {
				return;
			}
			if (!Array.isArray(frame)) return;
			if (frame[0] === 'AUTH') {
				if (authStarted) return;
				authStarted = true;
				beginRelayAuth(
					socket,
					url,
					authChallenge(frame),
					signAuth,
					(eventId) => {
						authEventId = eventId;
					},
					(error) => {
						fail(
							url,
							error instanceof Error && error.message ? error.message : RELAY_SIGN_IN_REASON
						);
					}
				);
				return;
			}
			if (frame[0] === 'OK' && authEventId && frame[1] === authEventId) {
				if (frame[2] === true) sendReq();
				else fail(url, typeof frame[3] === 'string' ? frame[3] : RELAY_SIGN_IN_REASON);
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

/** Publish one event. If the relay sends AUTH, sign it and send the EVENT again. */
export function publishWithRelayAuth(
	event: Event,
	relays: string[],
	timeoutMs = 15000,
	signAuth: RelayAuthSigner = signRelayAuth
): Promise<{ relay: string; success: boolean; error?: string }[]> {
	if (relays.length === 0 || typeof WebSocket === 'undefined') {
		return Promise.resolve(
			relays.map((relay) => ({ relay, success: false, error: 'could not connect' }))
		);
	}

	return new Promise((resolve, reject) => {
		const results = new Map<string, { relay: string; success: boolean; error?: string }>();
		let pending = relays.length;
		let settled = false;
		let signerLock: Error | null = null;
		const sockets: WebSocket[] = [];

		const closeSockets = () => {
			for (const socket of sockets) {
				try {
					if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
						socket.close();
					}
				} catch {
					// A failed close still returns the publish result.
				}
			}
		};

		let timer: ReturnType<typeof setTimeout>;
		const settle = (done: boolean) => {
			if (settled) return;
			settled = true;
			if (done) {
				clearTimeout(timer);
				for (const relay of relays) {
					if (!results.has(relay)) {
						results.set(relay, {
							relay,
							success: false,
							error: 'timed out before the relay finished'
						});
					}
				}
				closeSockets();
			}
			const report = relays.map(
				(relay) =>
					results.get(relay) ?? {
						relay,
						success: false,
						error: 'still publishing'
					}
			);
			if (signerLock && report.every((item) => !item.success)) reject(signerLock);
			else resolve(report);
		};
		timer = setTimeout(() => {
			closeSockets();
			settle(true);
		}, timeoutMs);

		const finishRelay = (
			relay: string,
			next: { relay: string; success: boolean; error?: string },
			socket: WebSocket
		) => {
			if (results.has(relay)) return;
			results.set(relay, next);
			pending -= 1;
			try {
				if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
					socket.close();
				}
			} catch {
				// Ignore close failures and still finish the publish.
			}
			// One acceptance is a delivered message. The other relays keep trying until the deadline.
			if (pending <= 0) settle(true);
			else if (next.success) settle(false);
		};

		relays.forEach((relay) => {
			let socket: WebSocket;
			try {
				socket = new WebSocket(relay);
				sockets.push(socket);
			} catch {
				results.set(relay, { relay, success: false, error: 'could not connect' });
				pending -= 1;
				if (pending <= 0) finish();
				return;
			}

			let accepted = false;
			let authStarted = false;
			let authEventId = '';
			const sendEvent = () => sendJson(socket, ['EVENT', event]);
			socket.onopen = () => sendEvent();
			socket.onerror = () => {
				if (socket.readyState !== WebSocket.OPEN) {
					finishRelay(relay, { relay, success: false, error: 'could not connect' }, socket);
				}
			};
			socket.onclose = () => {
				if (!results.has(relay)) {
					finishRelay(relay, { relay, success: false, error: 'could not connect' }, socket);
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
					if (authStarted) return;
					authStarted = true;
					beginRelayAuth(
						socket,
						relay,
						authChallenge(frame),
						signAuth,
						(eventId) => {
							authEventId = eventId;
						},
						(error) => {
							if (isSignerLocked(error)) signerLock = error;
							finishRelay(
								relay,
								{
									relay,
									success: false,
									error: error instanceof Error ? error.message : RELAY_SIGN_IN_REASON
								},
								socket
							);
						}
					);
					return;
				}
				if (frame[0] !== 'OK') return;
				if (authEventId && frame[1] === authEventId) {
					if (frame[2] === true) {
						if (!accepted) sendEvent();
						return;
					}
					finishRelay(
						relay,
						{
							relay,
							success: false,
							error: typeof frame[3] === 'string' ? frame[3] : RELAY_SIGN_IN_REASON
						},
						socket
					);
					return;
				}
				if (frame[1] !== event.id) return;
				if (frame[2] === true) {
					accepted = true;
					finishRelay(relay, { relay, success: true }, socket);
					return;
				}
				const reason = typeof frame[3] === 'string' ? frame[3] : 'rejected';
				if (/auth/i.test(reason) && !authEventId) return;
				finishRelay(relay, { relay, success: false, error: reason }, socket);
			};
		});
	});
}
