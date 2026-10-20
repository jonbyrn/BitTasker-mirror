import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const recipient = 'c'.repeat(64);

const { publishNostrEvent, decryptDM, assertChatAllowed } = vi.hoisted(() => ({
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
	decryptDM: vi.fn().mockResolvedValue('decrypted_content'),
	assertChatAllowed: vi.fn().mockResolvedValue(undefined)
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

vi.mock('$lib/nostr/relaySession', () => ({
	messageRelayUrls: () => ['wss://relay.example'],
	clarifyDeliveryFailure: (message: string) => message,
	queryRelaysDetailed: vi.fn(),
	subscribeRelayEvents: vi.fn(() => () => undefined),
	RELAY_SIGN_IN_REASON: 'asked for a sign-in this app does not send'
}));

vi.mock('$lib/nostr/messaging-policy', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/messaging-policy')>(
		'$lib/nostr/messaging-policy'
	);
	return {
		...actual,
		assertChatAllowed
	};
});

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
		assertChatAllowed.mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('sendDirectMessage publishes an encrypted kind-4 DM addressed to the recipient', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		const event = await sendDirectMessage('Hello World', recipient);

		expect(publishNostrEvent).toHaveBeenCalledWith(
			4,
			'Hello World',
			recipient,
			[
				['p', recipient],
				['m', 'direct-message']
			],
			['wss://relay.example']
		);
		expect(event.id).toBe('test-event-id');
	});

	it('sendDirectMessage appends extra tags (e.g. thread root)', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await sendDirectMessage('Reply', recipient, 'thread-root-id', [
			['e', 'thread-root-id', '', 'root']
		]);

		expect(publishNostrEvent).toHaveBeenCalledWith(
			4,
			'Reply',
			recipient,
			[
				['p', recipient],
				['m', 'direct-message'],
				['e', 'thread-root-id', '', 'root']
			],
			['wss://relay.example']
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

		await expect(sendDirectMessage('test', recipient)).rejects.toThrow(
			'No relay accepted the event'
		);
	});

	it('sendDirectMessage publishes a clean chat before escrow', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');

		await sendDirectMessage('hello', recipient);

		expect(assertChatAllowed).not.toHaveBeenCalled();
		expect(publishNostrEvent).toHaveBeenCalled();
	});

	it('sendDirectMessage does not publish a phone number before escrow', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');
		const { ContactBlockedError } = await import('$lib/config/contact-filter');

		await expect(sendDirectMessage('7035550199', recipient)).rejects.toBeInstanceOf(
			ContactBlockedError
		);
		expect(publishNostrEvent).not.toHaveBeenCalled();
	});

	it('protocol messages allow a maps url and still block app names', async () => {
		const { sendDirectMessage } = await import('$lib/nostr/direct-messages');
		const { ContactBlockedError } = await import('$lib/config/contact-filter');

		await sendDirectMessage(
			'123 Main Street\nhttps://maps.example/place',
			recipient,
			undefined,
			[['m', 'location']],
			'protocol'
		);
		expect(assertChatAllowed).not.toHaveBeenCalled();
		expect(publishNostrEvent).toHaveBeenCalled();

		publishNostrEvent.mockClear();
		await expect(
			sendDirectMessage('ping me on whatsapp', recipient, undefined, [['t', 'swap']], 'protocol')
		).rejects.toBeInstanceOf(ContactBlockedError);
		expect(publishNostrEvent).not.toHaveBeenCalled();
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
