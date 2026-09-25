import { beforeEach, describe, expect, it, vi } from 'vitest';
import KINDS from '$lib/utils/constants/kinds';

const {
	mockPool,
	mockGetNpub,
	mockGetNostrKeyPair,
	mockDecrypt,
	mockGetConversationKey,
	mockShowErrorToast
} = vi.hoisted(() => {
	const mockPool = {
		querySync: vi.fn(),
		publish: vi.fn(),
		subscribe: vi.fn(),
		close: vi.fn()
	};

	return {
		mockPool,
		mockGetNpub: vi.fn(),
		mockGetNostrKeyPair: vi.fn(),
		mockDecrypt: vi.fn(),
		mockGetConversationKey: vi.fn(),
		mockShowErrorToast: vi.fn()
	};
});

vi.mock('nostr-tools', () => ({
	nip19: {
		decode: vi.fn((value: string) => ({
			type: value.startsWith('nsec') ? 'nsec' : 'npub',
			data: value
		}))
	},
	nip44: {
		decrypt: mockDecrypt,
		encrypt: vi.fn(),
		getConversationKey: mockGetConversationKey
	}
}));

vi.mock('nostr-tools/pure', () => ({
	finalizeEvent: vi.fn(),
	validateEvent: vi.fn(() => true)
}));

vi.mock('@capacitor/preferences', () => ({
	Preferences: {
		get: vi.fn().mockResolvedValue({ value: null })
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: mockGetNpub,
	getNostrKeyPair: mockGetNostrKeyPair
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({
		pool: mockPool
	});

	return {
		appStore: Object.assign(store, {
			showErrorToast: mockShowErrorToast
		})
	};
});

describe('queryNostrEvents', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetNpub.mockResolvedValue('a'.repeat(64));
		mockGetNostrKeyPair.mockResolvedValue({
			nsec: new Uint8Array(32).fill(1)
		});
		mockGetConversationKey.mockResolvedValue(new Uint8Array(32).fill(2));
	});

	it('silently drops undecryptable service quote request events', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mockPool.querySync.mockResolvedValueOnce([
			{
				id: 'request-event-id',
				kind: KINDS.SERVICE_QUOTE_REQUEST,
				pubkey: 'b'.repeat(64),
				created_at: 1_700_000_000,
				tags: [['p', 'a'.repeat(64)]],
				content: JSON.stringify({
					type: 'service-quote-request',
					quoteRequestId: 'qr_valid123'
				}),
				sig: 'sig'
			}
		]);
		mockDecrypt.mockRejectedValueOnce(new Error('invalid MAC'));

		const { queryNostrEvents } = await import('$lib/utils/nostr');
		const result = await queryNostrEvents({
			kinds: [KINDS.SERVICE_QUOTE_REQUEST],
			'#p': ['a'.repeat(64)],
			limit: 25
		});

		expect(result).toEqual([]);
		expect(errorSpy).not.toHaveBeenCalledWith(
			expect.stringContaining('Failed to decrypt event:'),
			expect.anything(),
			expect.anything()
		);
		errorSpy.mockRestore();
	});

	it('silently drops undecryptable encrypted followup events', async () => {
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		mockPool.querySync
			.mockResolvedValueOnce([
				{
					id: 'parent-event-id',
					kind: 1,
					pubkey: 'b'.repeat(64),
					created_at: 1_700_000_000,
					tags: [],
					content: 'plain',
					sig: 'sig'
				}
			])
			.mockResolvedValueOnce([
				{
					id: 'status-event-id',
					kind: KINDS.SERVICE_PROPOSAL_STATUS,
					pubkey: 'b'.repeat(64),
					created_at: 1_700_000_100,
					tags: [
						['e', 'parent-event-id'],
						['p', 'a'.repeat(64)]
					],
					content: JSON.stringify({
						type: 'service-proposal-status',
						proposalId: 'pr_valid123'
					}),
					sig: 'sig'
				}
			]);
		mockDecrypt.mockRejectedValueOnce(new Error('invalid MAC'));

		const { queryNostrEvents } = await import('$lib/utils/nostr');
		const result = await queryNostrEvents(
			{
				kinds: [1],
				limit: 10
			},
			{
				kinds: [KINDS.SERVICE_PROPOSAL_STATUS],
				limit: 20
			},
			{
				attachAs: 'statusEvents'
			}
		);

		expect(result).toEqual([
			expect.objectContaining({
				id: 'parent-event-id'
			})
		]);
		expect((result[0] as Record<string, unknown>).statusEvents).toBeUndefined();
		expect(errorSpy).not.toHaveBeenCalledWith(
			expect.stringContaining('Failed to decrypt followup event:'),
			expect.anything(),
			expect.anything()
		);
		errorSpy.mockRestore();
	});

	it('reads the relay when the pool query does not finish', async () => {
		vi.useFakeTimers();
		mockPool.querySync.mockReturnValue(new Promise(() => undefined));
		const event = {
			id: 'bid-1',
			kind: 1,
			pubkey: 'b'.repeat(64),
			created_at: 1,
			tags: [] as string[][],
			content: 'plain',
			sig: 'sig'
		};

		class FakeSocket {
			onopen: (() => void) | null = null;
			onmessage: ((message: { data: string }) => void) | null = null;
			onerror: (() => void) | null = null;
			readyState = 1;
			constructor() {
				queueMicrotask(() => this.onopen?.());
			}
			send(payload: string) {
				const frame = JSON.parse(payload) as [string, string];
				this.onmessage?.({ data: JSON.stringify(['EVENT', frame[1], event]) });
				this.onmessage?.({ data: JSON.stringify(['EOSE', frame[1]]) });
			}
			close() {
				this.readyState = 3;
			}
		}

		vi.stubGlobal('WebSocket', FakeSocket);
		try {
			const { queryNostrEvents } = await import('$lib/utils/nostr');
			const pending = queryNostrEvents({ kinds: [1], limit: 1 }, undefined, undefined, [
				'wss://nos.lol'
			]);
			await vi.advanceTimersByTimeAsync(4000);
			await expect(pending).resolves.toEqual([expect.objectContaining({ id: 'bid-1' })]);
		} finally {
			vi.useRealTimers();
			vi.unstubAllGlobals();
		}
	});
});
