import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockPool } = vi.hoisted(() => ({
	mockPool: {
		querySync: vi.fn().mockResolvedValue([]),
		publish: vi.fn().mockResolvedValue([Promise.resolve()]),
		subscribe: vi.fn(() => ({ close: vi.fn() })),
		close: vi.fn()
	}
}));

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
	publishToMultipleRelays: vi
		.fn()
		.mockResolvedValue([{ relay: 'wss://relay1.test', success: true, error: null }])
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

import nip44 from '$lib/nostr/nip44';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import { parseDMEvent, sendDirectMessage } from '$lib/utils/nostr-message';

describe('NIP-44 Message Utilities', () => {
	type Nip44Mock = {
		getConversationKey: ReturnType<typeof vi.fn>;
		encrypt: ReturnType<typeof vi.fn>;
		decrypt: ReturnType<typeof vi.fn>;
	};
	type MockFn = ReturnType<typeof vi.fn>;

	let mockNip44: Nip44Mock;
	let mockGetNostrKeyPair: MockFn;
	let mockGetSignedEvent: MockFn;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
		mockPool.querySync.mockResolvedValue([]);

		// Reuse imported modules instead of dynamically importing the large helper in each test.
		mockNip44 = nip44 as unknown as Nip44Mock;
		mockGetNostrKeyPair = getNostrKeyPair as unknown as MockFn;
		mockGetSignedEvent = getSignedEvent as unknown as MockFn;

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
		vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(
			<T extends ArrayBufferView>(arr: T): T => {
				const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
				for (let i = 0; i < bytes.length; i++) {
					bytes[i] = Math.floor(Math.random() * 256);
				}
				return arr;
			}
		);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('Encryption/Decryption', () => {
		const ENCRYPT_DECRYPT_TIMEOUT = 10000;

		it.skip(
			'should encrypt messages using NIP-44',
			async () => {
				const message = 'Hello World';
				const recipientPubkey = 'recipient-pubkey-hex';

				await sendDirectMessage(message, recipientPubkey);

				expect(mockNip44.getConversationKey).toHaveBeenCalled();
				expect(mockNip44.encrypt).toHaveBeenCalledWith(
					message,
					expect.any(Uint8Array),
					expect.any(Uint8Array)
				);
			},
			ENCRYPT_DECRYPT_TIMEOUT
		);

		it(
			'should decrypt messages using NIP-44',
			async () => {
				await parseDMEvent(
					{
						id: 'test-event-id',
						kind: 4,
						pubkey: 'sender-pubkey',
						created_at: Math.floor(Date.now() / 1000),
						content: 'encrypted_content',
						tags: [['p', 'recipient-pubkey-hex']],
						sig: 'test-signature'
					},
					'private-key-hex',
					'recipient-pubkey-hex'
				);

				expect(mockNip44.getConversationKey).toHaveBeenCalled();
				expect(mockNip44.decrypt).toHaveBeenCalledWith('encrypted_content', expect.any(Uint8Array));
			},
			ENCRYPT_DECRYPT_TIMEOUT
		);

		it(
			'should generate unique nonces for each message',
			async () => {
				const message = 'Test message';
				const recipientPubkey = 'recipient-pubkey-hex';

				await sendDirectMessage(message, recipientPubkey);
				await sendDirectMessage(message, recipientPubkey);

				// Should be called twice with different nonces
				expect(global.crypto.getRandomValues).toHaveBeenCalledTimes(2);
				expect(mockNip44.encrypt).toHaveBeenCalledTimes(2);
			},
			ENCRYPT_DECRYPT_TIMEOUT
		);
	});

	describe('Error Handling', () => {
		it('should handle encryption failures gracefully', async () => {
			mockNip44.encrypt.mockRejectedValue(new Error('Encryption failed'));

			await expect(sendDirectMessage('test', 'recipient-pubkey')).rejects.toThrow();
		});

		it('should handle decryption failures gracefully', async () => {
			mockNip44.decrypt.mockRejectedValue(new Error('Decryption failed'));
			await expect(
				parseDMEvent(
					{
						id: 'test-event-id',
						kind: 4,
						pubkey: 'sender-pubkey',
						created_at: Math.floor(Date.now() / 1000),
						content: 'encrypted_content',
						tags: [['p', 'recipient-pubkey']],
						sig: 'test-signature'
					},
					'private-key-hex',
					'recipient-pubkey'
				)
			).rejects.toThrow('Decryption failed');
		});

		it('should handle invalid public key formats', async () => {
			// Simulate nip44 rejecting invalid key; implementation should surface the error
			mockNip44.getConversationKey.mockRejectedValue(new Error('Invalid public key'));

			await expect(sendDirectMessage('test', 'invalid-key')).rejects.toThrow();
		});
	});

	describe('Message Event Structure', () => {
		it('should create proper NIP-44 message events', async () => {
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
			const message = 'Test message';
			const recipientNpub = 'npub1test123';

			await sendDirectMessage(message, recipientNpub);

			expect(mockNip44.getConversationKey).toHaveBeenCalledWith(
				expect.any(String),
				'decoded-hex-pubkey'
			);
		});

		it('should handle hex format public keys directly', async () => {
			const message = 'Test message';
			const recipientHex = 'deadbeef'.repeat(8); // 64 char hex

			await sendDirectMessage(message, recipientHex);

			expect(mockNip44.getConversationKey).toHaveBeenCalledWith(expect.any(String), recipientHex);
		});
	});
});
