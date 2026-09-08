import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { publishNostrEvent } = vi.hoisted(() => ({
	publishNostrEvent: vi.fn().mockResolvedValue({
		event: {
			id: 'test-event-id',
			kind: 4,
			pubkey: 'sender-pubkey',
			created_at: Math.floor(Date.now() / 1000),
			content: 'encrypted_content',
			tags: [['p', 'recipient-pubkey']],
			sig: 'test-signature'
		}
	})
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent
}));

const { decryptMock } = vi.hoisted(() => ({ decryptMock: vi.fn() }));

vi.mock('@nostr-dev-kit/ndk', () => ({
	NDKUser: class {
		constructor(public opts: { pubkey: string }) {}
	},
	NDKEvent: class {
		content: string;
		constructor(
			_ndk: unknown,
			public event: { pubkey: string; content: string }
		) {
			this.content = event.content;
		}
		decrypt = decryptMock;
	}
}));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		subscribe: vi.fn(() => ({ stop: vi.fn() })),
		signer: {}
	}
}));

describe('direct-messages (NIP-44 via NDK signer)', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		publishNostrEvent.mockResolvedValue({
			event: {
				id: 'test-event-id',
				kind: 4,
				pubkey: 'sender-pubkey',
				created_at: Math.floor(Date.now() / 1000),
				content: 'encrypted_content',
				tags: [['p', 'recipient-pubkey']],
				sig: 'test-signature'
			}
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('sendDirectMessage publishes an encrypted kind-4 DM addressed to the recipient', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		const event = await sendDirectMessage('Hello World', 'recipient-pubkey-hex');

		expect(publishNostrEvent).toHaveBeenCalledWith(
			4,
			'Hello World',
			'recipient-pubkey-hex',
			[['p', 'recipient-pubkey-hex']]
		);
		expect(event.id).toBe('test-event-id');
	});

	it('sendDirectMessage appends extra tags (e.g. thread root)', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await sendDirectMessage('Reply', 'recipient-pubkey-hex', 'thread-root-id', [
			['e', 'thread-root-id', '', 'root']
		]);

		expect(publishNostrEvent).toHaveBeenCalledWith(
			4,
			'Reply',
			'recipient-pubkey-hex',
			[
				['p', 'recipient-pubkey-hex'],
				['e', 'thread-root-id', '', 'root']
			]
		);
	});

	it('sendDirectMessage rejects empty messages before publishing', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await expect(sendDirectMessage('   ', 'recipient-pubkey-hex')).rejects.toThrow(
			'Message cannot be empty'
		);
		expect(publishNostrEvent).not.toHaveBeenCalled();
	});

	it('sendDirectMessage surfaces publish failures', async () => {
		publishNostrEvent.mockRejectedValueOnce(new Error('No relay accepted the event'));
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await expect(sendDirectMessage('test', 'recipient-pubkey-hex')).rejects.toThrow(
			'No relay accepted the event'
		);
	});

	it('parseDMEvent decrypts content via NDK NIP-44 with the sender pubkey', async () => {
		decryptMock.mockImplementation(async function (this: { content: string }) {
			this.content = 'decrypted_content';
		});
		const { parseDMEvent } = await import('$lib/nostr/direct-messages');

		const result = await parseDMEvent(
			{
				id: 'evt-1',
				kind: 4,
				pubkey: 'sender-pubkey',
				created_at: Math.floor(Date.now() / 1000),
				content: 'encrypted_content',
				tags: [],
				sig: 'sig'
			},
			new Uint8Array(32)
		);

		expect(decryptMock).toHaveBeenCalled();
		const [senderArg, , scheme] = decryptMock.mock.calls[0];
		expect((senderArg as { opts: { pubkey: string } }).opts.pubkey).toBe('sender-pubkey');
		expect(scheme).toBe('nip44');
		expect(result.plaintext).toBe('decrypted_content');
		expect(result.senderPubkey).toBe('sender-pubkey');
	});
});
