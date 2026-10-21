import { afterEach, describe, expect, it, vi } from 'vitest';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { makeAuthEvent } from 'nostr-tools/nip42';
import {
	RELAY_SIGN_IN_REASON,
	inboxRelaysFromEvents,
	messageRelayUrls,
	publishWithRelayAuth,
	queryRelaysDetailed,
	type RelayAuthSigner
} from '$lib/nostr/relaySession';

class FakeSocket {
	static instances: FakeSocket[] = [];
	static OPEN = 1;
	static CONNECTING = 0;
	static CLOSING = 2;
	static CLOSED = 3;

	url: string;
	readyState = FakeSocket.CONNECTING;
	onopen: (() => void) | null = null;
	onmessage: ((event: { data: string }) => void) | null = null;
	onerror: (() => void) | null = null;
	onclose: (() => void) | null = null;
	sent: string[] = [];

	constructor(url: string) {
		this.url = url;
		FakeSocket.instances.push(this);
		queueMicrotask(() => {
			this.readyState = FakeSocket.OPEN;
			this.onopen?.();
		});
	}

	send(data: string): void {
		this.sent.push(data);
	}

	close(): void {
		this.readyState = FakeSocket.CLOSED;
		this.onclose?.();
	}
}

describe('relay session', () => {
	afterEach(() => {
		FakeSocket.instances = [];
		vi.unstubAllGlobals();
	});

	it('reports a relay when the session cannot sign the AUTH challenge', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const signAuth: RelayAuthSigner = async () => {
			throw new Error(RELAY_SIGN_IN_REASON);
		};
		const pending = queryRelaysDetailed(
			['wss://relay2-dev.bittasker.com'],
			[{ kinds: [4] }],
			1000,
			signAuth
		);
		await vi.waitFor(() => {
			expect(FakeSocket.instances[0]?.sent.length).toBeGreaterThan(0);
		});
		FakeSocket.instances[0].onmessage?.({
			data: JSON.stringify(['AUTH', 'challenge-id'])
		});
		const report = await pending;
		expect(report.events).toEqual([]);
		expect(report.relays[0]).toEqual({
			url: 'wss://relay2-dev.bittasker.com',
			ok: false,
			reason: RELAY_SIGN_IN_REASON
		});
	});

	it('answers NIP-42 AUTH with kind 22242 and retries the REQ', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const secret = generateSecretKey();
		const pubkey = getPublicKey(secret);
		const url = 'wss://relay2-dev.bittasker.com';
		const signAuth: RelayAuthSigner = async (relayUrl, challenge) =>
			finalizeEvent(makeAuthEvent(relayUrl, challenge), secret);
		const event = {
			id: 'evt',
			pubkey: 'b'.repeat(64),
			created_at: 10,
			kind: 4,
			tags: [['p', pubkey]],
			content: 'cipher',
			sig: 'sig'
		};
		const pending = queryRelaysDetailed([url], [{ kinds: [4] }], 2000, signAuth);
		await vi.waitFor(() => {
			expect(FakeSocket.instances[0]?.sent.length).toBeGreaterThan(0);
		});
		const socket = FakeSocket.instances[0];
		socket.onmessage?.({ data: JSON.stringify(['AUTH', 'challenge-1']) });
		await vi.waitFor(() => {
			expect(socket.sent.some((frame) => frame.startsWith('["AUTH"'))).toBe(true);
		});
		const authFrame = JSON.parse(socket.sent.find((frame) => frame.startsWith('["AUTH"'))!) as [
			string,
			{ id: string; kind: number; pubkey: string; tags: string[][] }
		];
		expect(authFrame[1].kind).toBe(22242);
		expect(authFrame[1].pubkey).toBe(pubkey);
		expect(authFrame[1].tags).toEqual(
			expect.arrayContaining([
				['relay', url],
				['challenge', 'challenge-1']
			])
		);
		const sentBeforeOk = socket.sent.length;
		socket.onmessage?.({ data: JSON.stringify(['OK', authFrame[1].id, true, '']) });
		await vi.waitFor(() => {
			expect(socket.sent.length).toBeGreaterThan(sentBeforeOk);
		});
		expect(socket.sent.filter((frame) => frame.startsWith('["REQ"')).length).toBeGreaterThanOrEqual(
			2
		);
		socket.onmessage?.({ data: JSON.stringify(['EVENT', 'dm-0', event]) });
		socket.onmessage?.({ data: JSON.stringify(['EOSE', 'dm-0']) });
		const report = await pending;
		expect(report.events).toEqual([event]);
		expect(report.relays[0]?.ok).toBe(true);
	});

	it('retries EVENT after the relay accepts the AUTH signature', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const secret = generateSecretKey();
		const url = 'wss://relay2-dev.bittasker.com';
		const signAuth: RelayAuthSigner = async (relayUrl, challenge) =>
			finalizeEvent(makeAuthEvent(relayUrl, challenge), secret);
		const event = finalizeEvent(
			{
				kind: 4,
				created_at: 20,
				tags: [['p', 'b'.repeat(64)]],
				content: 'cipher'
			},
			secret
		);
		const pending = publishWithRelayAuth(event, [url], 2000, signAuth);
		await vi.waitFor(() => {
			expect(FakeSocket.instances[0]?.sent.some((frame) => frame.startsWith('["EVENT"'))).toBe(
				true
			);
		});
		const socket = FakeSocket.instances[0];
		socket.onmessage?.({ data: JSON.stringify(['AUTH', 'challenge-2']) });
		await vi.waitFor(() => {
			expect(socket.sent.some((frame) => frame.startsWith('["AUTH"'))).toBe(true);
		});
		const authFrame = JSON.parse(socket.sent.find((frame) => frame.startsWith('["AUTH"'))!) as [
			string,
			{ id: string; kind: number }
		];
		expect(authFrame[1].kind).toBe(22242);
		const eventsBefore = socket.sent.filter((frame) => frame.startsWith('["EVENT"')).length;
		socket.onmessage?.({ data: JSON.stringify(['OK', authFrame[1].id, true, '']) });
		await vi.waitFor(() => {
			expect(socket.sent.filter((frame) => frame.startsWith('["EVENT"')).length).toBeGreaterThan(
				eventsBefore
			);
		});
		socket.onmessage?.({ data: JSON.stringify(['OK', event.id, true, '']) });
		const results = await pending;
		expect(results[0]?.success).toBe(true);
	});

	it('keeps a stored EVENT when the relay rejects the AUTH url', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const secret = generateSecretKey();
		const url = 'wss://relay2.bittasker.com';
		const signAuth: RelayAuthSigner = async (relayUrl, challenge) =>
			finalizeEvent(makeAuthEvent(relayUrl, challenge), secret);
		const event = finalizeEvent(
			{
				kind: 31000,
				created_at: 21,
				tags: [['d', 'listing']],
				content: '{"title":"listing"}'
			},
			secret
		);
		const pending = publishWithRelayAuth(event, [url], 2000, signAuth);
		await vi.waitFor(() => {
			expect(FakeSocket.instances[0]?.sent.some((frame) => frame.startsWith('["EVENT"'))).toBe(
				true
			);
		});
		const socket = FakeSocket.instances[0];
		socket.onmessage?.({ data: JSON.stringify(['AUTH', 'challenge-catalog']) });
		await vi.waitFor(() => {
			expect(socket.sent.some((frame) => frame.startsWith('["AUTH"'))).toBe(true);
		});
		const authFrame = JSON.parse(socket.sent.find((frame) => frame.startsWith('["AUTH"'))!) as [
			string,
			{ id: string }
		];
		socket.onmessage?.({
			data: JSON.stringify(['OK', authFrame[1].id, false, 'invalid: the relay url is wrong'])
		});
		socket.onmessage?.({ data: JSON.stringify(['OK', event.id, true, '']) });
		const results = await pending;
		expect(results[0]?.success).toBe(true);
	});

	it('fails when the relay requires auth and rejects the signature', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const secret = generateSecretKey();
		const url = 'wss://relay2.bittasker.com';
		const event = finalizeEvent(
			{
				kind: 31000,
				created_at: 22,
				tags: [['d', 'listing']],
				content: '{"title":"listing"}'
			},
			secret
		);
		const pending = publishWithRelayAuth(event, [url], 2000, async () => {
			throw new Error('auth rejected');
		});
		await vi.waitFor(() => expect(FakeSocket.instances[0]?.sent.length).toBeGreaterThan(0));
		FakeSocket.instances[0].onmessage?.({ data: JSON.stringify(['AUTH', 'challenge-required']) });
		const results = await pending;
		expect(results[0]?.success).toBe(false);
	});

	it('returns events when the relay sends EOSE', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const event = {
			id: 'evt',
			pubkey: 'a'.repeat(64),
			created_at: 10,
			kind: 4,
			tags: [['p', 'b'.repeat(64)]],
			content: 'cipher',
			sig: 'sig'
		};
		const pending = queryRelaysDetailed(['wss://relay.example'], [{ kinds: [4] }], 1000);
		await vi.waitFor(() => {
			expect(FakeSocket.instances[0]?.sent.length).toBeGreaterThan(0);
		});
		const socket = FakeSocket.instances[0];
		socket.onmessage?.({ data: JSON.stringify(['EVENT', 'dm-0', event]) });
		socket.onmessage?.({ data: JSON.stringify(['EOSE', 'dm-0']) });
		const report = await pending;
		expect(report.events).toEqual([event]);
		expect(report.relays[0]?.ok).toBe(true);
	});

	it('uses relay1 as the sandbox DM primary, then nos.lol and damus', () => {
		expect(messageRelayUrls()).toEqual([
			'wss://relay1.bittasker.com',
			'wss://nos.lol',
			'wss://relay.damus.io'
		]);
	});

	it('reads a NIP-17 inbox relay list', () => {
		expect(
			inboxRelaysFromEvents([
				{
					tags: [
						['relay', 'wss://inbox.example/'],
						['p', 'ab']
					]
				},
				{ tags: [['relay', 'wss://inbox.example']] }
			])
		).toEqual(['wss://inbox.example']);
	});

	it('counts a message delivered when one relay accepts', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const secret = generateSecretKey();
		const event = finalizeEvent(
			{
				kind: 4,
				created_at: 30,
				tags: [['p', 'b'.repeat(64)]],
				content: 'cipher'
			},
			secret
		);
		const pending = publishWithRelayAuth(
			event,
			['wss://relay.damus.io', 'wss://nos.lol'],
			5000,
			async () => {
				throw new Error('no auth');
			}
		);
		await vi.waitFor(() => expect(FakeSocket.instances).toHaveLength(2));
		FakeSocket.instances[0].onmessage?.({
			data: JSON.stringify(['OK', event.id, true, ''])
		});
		const results = await pending;
		expect(results.find((item) => item.relay === 'wss://relay.damus.io')?.success).toBe(true);
		expect(results.find((item) => item.relay === 'wss://nos.lol')?.success).toBe(false);
	});

	it('says the relay could not connect when the socket cannot open', async () => {
		vi.stubGlobal(
			'WebSocket',
			class {
				static OPEN = 1;
				static CONNECTING = 0;
				constructor() {
					throw new Error('offline');
				}
			}
		);
		const report = await queryRelaysDetailed(['wss://relay.example'], [{ kinds: [4] }], 200);
		expect(report.relays[0]?.reason).toBe('could not connect');
	});
});
