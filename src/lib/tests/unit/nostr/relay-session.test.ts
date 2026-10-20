import { afterEach, describe, expect, it, vi } from 'vitest';
import { RELAY_SIGN_IN_REASON, queryRelaysDetailed } from '$lib/nostr/relaySession';

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

	it('reports a relay that asks for a sign-in and does not wait on it', async () => {
		vi.stubGlobal('WebSocket', FakeSocket);
		const pending = queryRelaysDetailed(['wss://relay2-dev.bittasker.com'], [{ kinds: [4] }], 1000);
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
