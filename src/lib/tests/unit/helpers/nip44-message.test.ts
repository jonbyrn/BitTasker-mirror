import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { publishNostrEvent, decryptDM } = vi.hoisted(() => ({
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
	}),
	decryptDM: vi.fn().mockResolvedValue('decrypted_content')
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent,
	decryptDM
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn().mockResolvedValue({
		nsec: new Uint8Array(32),
		npub: 'our-npub'
	})
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
		decryptDM.mockResolvedValue('decrypted_content');
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

		expect(publishNostrEvent).toHaveBeenCalledWith(4, 'Hello World', 'recipient-pubkey-hex', [
			['p', 'recipient-pubkey-hex']
		]);
		expect(event.id).toBe('test-event-id');
	});

	it('sendDirectMessage appends extra tags (e.g. thread root)', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await sendDirectMessage('Reply', 'recipient-pubkey-hex', 'thread-root-id', [
			['e', 'thread-root-id', '', 'root']
		]);

		expect(publishNostrEvent).toHaveBeenCalledWith(4, 'Reply', 'recipient-pubkey-hex', [
			['p', 'recipient-pubkey-hex'],
			['e', 'thread-root-id', '', 'root']
		]);
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

	it('parseDMEvent decrypts content with the sender pubkey', async () => {
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

		expect(decryptDM).toHaveBeenCalledWith(
			expect.any(Uint8Array),
			'encrypted_content',
			'sender-pubkey'
		);
		expect(result.plaintext).toBe('decrypted_content');
		expect(result.senderPubkey).toBe('sender-pubkey');
	});
});
