import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Event as NostrEvent } from 'nostr-tools';

// Hoisted mocks so they can be used in vi.mock and in tests
const mockPool = {
	querySync: vi.fn().mockResolvedValue([]),
	publish: vi.fn().mockResolvedValue([Promise.resolve()]),
	subscribe: vi.fn(() => ({ close: vi.fn() })),
	close: vi.fn()
};

// Mock the dependencies
vi.mock('$lib/nostr/nip44', () => ({
	default: {
		getConversationKey: vi.fn(),
		encrypt: vi.fn(),
		decrypt: vi.fn()
	}
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: vi.fn()
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: vi.fn(),
	subscribeToEvents: vi.fn(),
	publishToMultipleRelays: vi.fn().mockResolvedValue([{ relay: 'wss://relay1.test', success: true, error: null }])
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const store = writable({ pool: mockPool });
	return {
		appStore: Object.assign(store, { showErrorToast: vi.fn() })
	};
});

// Mock nip19.decode so npub strings don't trigger real bech32 (which requires valid format)
vi.mock('nostr-tools', async (importOriginal) => {
	const actual = await importOriginal<typeof import('nostr-tools')>();
	return {
		...actual,
		nip19: {
			...actual.nip19,
			decode: vi.fn((code: string) => {
				if (code.startsWith('npub')) {
					return { data: 'decoded-hex-pubkey', type: 'npub' };
				}
				return actual.nip19.decode(code);
			})
		}
	};
});

vi.mock('$env/static/public', () => ({
	PUBLIC_NOSTR_RELAY_URL: 'wss://relay1.test',
	PUBLIC_NOSTR_RELAY_URL_MOCK4: 'wss://relay2.test'
}));

describe('NIP-44 Message Utilities', () => {
	let mockNip44: any;
	let mockGetNostrKeyPair: any;
	let mockGetSignedEvent: any;

	beforeEach(async () => {
		// Reset all mocks
		vi.clearAllMocks();
		mockPool.querySync.mockResolvedValue([]);

		// Get mocked modules
		mockNip44 = (await import('$lib/nostr/nip44')).default;
		mockGetNostrKeyPair = (await import('$lib/utils/nostrKeys')).getNostrKeyPair;
		mockGetSignedEvent = (await import('$lib/utils/nostr')).getSignedEvent;

		// Setup default mock implementations
		mockNip44.getConversationKey.mockResolvedValue(new Uint8Array(32));
		mockNip44.encrypt.mockResolvedValue('encrypted_content');
		mockNip44.decrypt.mockResolvedValue('decrypted_content');

		mockGetNostrKeyPair.mockResolvedValue({
			nsec: new Uint8Array(32),
			npub: 'npub1test'
		});

		mockGetSignedEvent.mockResolvedValue({
			id: 'test-event-id',
			kind: 4,
			pubkey: 'sender-pubkey',
			created_at: Math.floor(Date.now() / 1000),
			content: 'encrypted_content',
			tags: [['p', 'recipient-pubkey']],
			sig: 'test-signature'
		});

		// Spy on crypto.getRandomValues (should be available from global setup)
		if (global.crypto && global.crypto.getRandomValues) {
			vi.spyOn(global.crypto, 'getRandomValues').mockImplementation((arr: Uint8Array) => {
				for (let i = 0; i < arr.length; i++) {
					arr[i] = Math.floor(Math.random() * 256);
				}
				return arr;
			});
		}
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Encryption/Decryption', () => {
		it('should encrypt messages using NIP-44', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Hello World';
			const recipientPubkey = 'recipient-pubkey-hex';

			await sendDirectMessage(message, recipientPubkey);

			expect(mockNip44.getConversationKey).toHaveBeenCalled();
			expect(mockNip44.encrypt).toHaveBeenCalledWith(
				message,
				expect.any(Uint8Array),
				expect.any(Uint8Array)
			);
		});

		it('should decrypt messages using NIP-44', async () => {
			const { getMessageHistory } = await import('$lib/utils/nostr-message');

			const recipientPubkey = 'recipient-pubkey-hex';

			// Mock relay response via appStore pool
			const mockEvents: NostrEvent[] = [
				{
					id: 'test-event-id',
					kind: 4,
					pubkey: 'sender-pubkey',
					created_at: Math.floor(Date.now() / 1000),
					content: 'encrypted_content',
					tags: [['p', recipientPubkey]],
					sig: 'test-signature'
				}
			];
			mockPool.querySync.mockResolvedValue(mockEvents);

			const messages = await getMessageHistory(recipientPubkey);

			expect(mockNip44.getConversationKey).toHaveBeenCalled();
			expect(mockNip44.decrypt).toHaveBeenCalledWith('encrypted_content', expect.any(Uint8Array));
		});

		it('should generate unique nonces for each message', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Test message';
			const recipientPubkey = 'recipient-pubkey-hex';

			await sendDirectMessage(message, recipientPubkey);
			await sendDirectMessage(message, recipientPubkey);

			// Should be called twice with different nonces
			expect(global.crypto.getRandomValues).toHaveBeenCalledTimes(2);
			expect(mockNip44.encrypt).toHaveBeenCalledTimes(2);
		});
	});

	describe('Error Handling', () => {
		it('should handle encryption failures gracefully', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			mockNip44.encrypt.mockRejectedValue(new Error('Encryption failed'));

			await expect(sendDirectMessage('test', 'recipient-pubkey')).rejects.toThrow();
		});

		it('should handle decryption failures gracefully', async () => {
			const { getMessageHistory } = await import('$lib/utils/nostr-message');

			mockNip44.decrypt.mockRejectedValue(new Error('Decryption failed'));

			// Mock relay response via appStore pool
			const mockEvents: NostrEvent[] = [
				{
					id: 'test-event-id',
					kind: 4,
					pubkey: 'sender-pubkey',
					created_at: Math.floor(Date.now() / 1000),
					content: 'encrypted_content',
					tags: [['p', 'recipient-pubkey']],
					sig: 'test-signature'
				}
			];
			mockPool.querySync.mockResolvedValue(mockEvents);

			const messages = await getMessageHistory('recipient-pubkey');

			// Should return empty array when decryption fails
			expect(messages).toEqual([]);
		});

		it('should handle invalid public key formats', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			// Simulate nip44 rejecting invalid key; implementation should surface the error
			mockNip44.getConversationKey.mockRejectedValue(new Error('Invalid public key'));

			await expect(sendDirectMessage('test', 'invalid-key')).rejects.toThrow();
		});
	});

	describe('Message Event Structure', () => {
		it('should create proper NIP-44 message events', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Test message';
			const recipientPubkey = 'recipient-pubkey-hex';

			await sendDirectMessage(message, recipientPubkey);

			expect(mockGetSignedEvent).toHaveBeenCalledWith({
				kind: 4,
				content: 'encrypted_content',
				tags: [
					['p', recipientPubkey],
					['m', 'direct-message']
				],
				created_at: expect.any(Number)
			});
		});

		it('should include thread root tag when specified', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Reply message';
			const recipientPubkey = 'recipient-pubkey-hex';
			const threadRootId = 'thread-root-id';

			await sendDirectMessage(message, recipientPubkey, threadRootId);

			expect(mockGetSignedEvent).toHaveBeenCalledWith({
				kind: 4,
				content: 'encrypted_content',
				tags: [
					['p', recipientPubkey],
					['m', 'direct-message'],
					['e', threadRootId, '', 'root']
				],
				created_at: expect.any(Number)
			});
		});
	});

	describe('Pubkey Format Handling', () => {
		it('should handle npub format public keys', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Test message';
			const recipientNpub = 'npub1test123';

			await sendDirectMessage(message, recipientNpub);

			expect(mockNip44.getConversationKey).toHaveBeenCalledWith(
				expect.any(String),
				'decoded-hex-pubkey'
			);
		});

		it('should handle hex format public keys directly', async () => {
			const { sendDirectMessage } = await import('$lib/utils/nostr-message');

			const message = 'Test message';
			const recipientHex = 'deadbeef'.repeat(8); // 64 char hex

			await sendDirectMessage(message, recipientHex);

			expect(mockNip44.getConversationKey).toHaveBeenCalledWith(expect.any(String), recipientHex);
		});
	});
});
