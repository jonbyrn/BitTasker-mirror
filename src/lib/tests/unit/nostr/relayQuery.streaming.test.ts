import { afterEach, describe, expect, it, vi } from 'vitest';
import { queryRelayEvents } from '$lib/nostr/relayQuery';

describe('queryRelayEvents streaming', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reports events as they arrive and stops at the timeout', async () => {
		const seen: number[] = [];
		class HangSocket {
			onopen: (() => void) | null = null;
			onmessage: ((message: { data: string }) => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 1;
			constructor(_url: string) {
				queueMicrotask(() => this.onopen?.());
			}
			send(payload: string) {
				const frame = JSON.parse(payload) as [string, string, unknown];
				this.onmessage?.({
					data: JSON.stringify([
						'EVENT',
						frame[1],
						{
							id: 'a'.repeat(64),
							pubkey: 'b'.repeat(64),
							created_at: 10,
							kind: 30402,
							tags: [],
							content: '{}',
							sig: 'c'.repeat(128)
						}
					])
				});
			}
			close() {
				this.readyState = 3;
			}
		}

		vi.stubGlobal('WebSocket', HangSocket);
		const events = await queryRelayEvents(
			['wss://relay.example'],
			{ kinds: [30402], limit: 1 },
			{
				timeoutMs: 30,
				onEvents: (batch) => seen.push(batch.length)
			}
		);

		expect(seen).toEqual([1]);
		expect(events).toHaveLength(1);
	});

	it('keeps events when the relay sends AUTH and then closes without EOSE', async () => {
		class CloseSocket {
			onopen: (() => void) | null = null;
			onmessage: ((message: { data: string }) => void) | null = null;
			onclose: (() => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 1;
			constructor(_url: string) {
				queueMicrotask(() => this.onopen?.());
			}
			send(payload: string) {
				const frame = JSON.parse(payload) as [string, string, unknown];
				this.onmessage?.({ data: JSON.stringify(['AUTH', 'challenge-1']) });
				this.onmessage?.({
					data: JSON.stringify([
						'EVENT',
						frame[1],
						{
							id: 'd'.repeat(64),
							pubkey: 'e'.repeat(64),
							created_at: 11,
							kind: 31000,
							tags: [],
							content: '{}',
							sig: 'f'.repeat(128)
						}
					])
				});
				this.readyState = 3;
				this.onclose?.();
			}
			close() {
				this.readyState = 3;
			}
		}

		vi.stubGlobal('WebSocket', CloseSocket);
		const events = await queryRelayEvents(
			['wss://relay.example'],
			{ kinds: [31000], limit: 1 },
			{ timeoutMs: 5000 }
		);
		expect(events).toHaveLength(1);
		expect(events[0]?.kind).toBe(31000);
	});
});
