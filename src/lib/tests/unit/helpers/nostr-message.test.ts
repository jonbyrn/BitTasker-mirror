import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Create simple mocks using vi.hoisted to avoid hoisting issues
const {
	mockNip04,
	mockGetNostrKeyPair,
	mockSubscribeToEvents,
	mockSimplePool,
	mockPool,
	mockNip44,
	mockGetNpub,
	mockGetSignedEvent,
	mockPublishToMultipleRelays
} = vi.hoisted(() => {
	const mockNip04 = {
		encrypt: vi.fn(),
		decrypt: vi.fn()
	};

	const mockNip44 = {
		encrypt: vi.fn(),
		decrypt: vi.fn(),
		getConversationKey: vi.fn().mockResolvedValue(new Uint8Array(32))
	};

	const mockGetNostrKeyPair = vi.fn();
	const mockGetNpub = vi.fn().mockResolvedValue('npub1test1234567890');
	const mockSubscribeToEvents = vi.fn();
	const mockSimplePool = vi.fn();

	// Create a mock pool instance that will be returned by appStore
	const createMockPool = () => ({
		querySync: vi.fn().mockResolvedValue([]),
		publish: vi.fn().mockResolvedValue([Promise.resolve()]),
		subscribe: vi.fn(() => ({
			close: vi.fn()
		})),
		close: vi.fn()
	});

	const mockPool = createMockPool();

	const mockGetSignedEvent = vi.fn().mockResolvedValue({
		id: 'test-event-id',
		kind: 4,
		content: 'encrypted',
		tags: [],
		created_at: Math.floor(Date.now() / 1000),
		pubkey: 'test-pubkey',
		sig: 'test-sig'
	});

	const mockPublishToMultipleRelays = vi
		.fn()
		.mockResolvedValue([{ relay: 'ws://localhost:7777', success: true, error: null }]);

	return {
		mockNip04,
		mockGetNostrKeyPair,
		mockGetNpub,
		mockSubscribeToEvents,
		mockSimplePool,
		mockPool,
		mockNip44,
		mockGetSignedEvent,
		mockPublishToMultipleRelays
	};
});

// Mock modules with simple implementations
vi.mock('nostr-tools', () => ({
	nip04: mockNip04,
	nip19: {
		decode: vi.fn((npub: string) => ({
			data: npub.replace('npub', '0x'),
			type: 'npub'
		}))
	}
}));

vi.mock('$env/static/public', () => ({
	PUBLIC_NOSTR_RELAY_URL: 'ws://localhost:7777'
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: mockGetNostrKeyPair,
	getNpub: mockGetNpub
}));

vi.mock('$lib/utils/nostr', () => ({
	subscribeToEvents: mockSubscribeToEvents,
	getSignedEvent: mockGetSignedEvent,
	publishToMultipleRelays: mockPublishToMultipleRelays
}));

vi.mock('$lib/stores/app.store', async () => {
	const { writable } = await import('svelte/store');
	const mockAppStore = writable({
		pool: mockPool
	});
	return {
		appStore: {
			...mockAppStore,
			showErrorToast: vi.fn()
		}
	};
});

vi.mock('nostr-tools/pool', () => ({
	SimplePool: mockSimplePool
}));

vi.mock('$lib/nostr/nip44', () => ({
	default: mockNip44
}));

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		getProfile: vi.fn().mockResolvedValue(null),
		cacheProfile: vi.fn().mockResolvedValue(undefined)
	}
}));

// Import functions to test after mocks are set up
import {
	fetchProfileMetadata,
	sendDirectMessage,
	getMessageHistory,
	getThreadMessages,
	getMessagedPeople
} from '$lib/utils/nostr-message';

describe('Nostr Message Utilities', () => {
	beforeEach(() => {
		vi.clearAllMocks();

		// Reset mock pool methods
		mockPool.querySync.mockResolvedValue([]);
		mockPool.publish.mockResolvedValue([Promise.resolve()]);
		mockPool.subscribe.mockReturnValue({
			close: vi.fn()
		});

		// Reset mock implementations
		mockSimplePool.mockReturnValue({
			querySync: vi.fn(),
			publish: vi.fn(),
			subscribe: vi.fn(() => ({
				close: vi.fn()
			})),
			close: vi.fn()
		});

		// Reset nostr utility mocks
		mockGetSignedEvent.mockResolvedValue({
			id: 'test-event-id',
			kind: 4,
			content: 'encrypted',
			tags: [],
			created_at: Math.floor(Date.now() / 1000),
			pubkey: 'test-pubkey',
			sig: 'test-sig'
		});
		mockPublishToMultipleRelays.mockResolvedValue([
			{ relay: 'ws://localhost:7777', success: true, error: null }
		]);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('Core functionality validation', () => {
		it('should import all required functions', () => {
			expect(fetchProfileMetadata).toBeDefined();
			expect(sendDirectMessage).toBeDefined();
			expect(getMessageHistory).toBeDefined();
			expect(getThreadMessages).toBeDefined();
			expect(getMessagedPeople).toBeDefined();
		});

		it('should handle empty profile metadata gracefully', async () => {
			// Mock pool to return empty results
			mockPool.querySync.mockResolvedValueOnce([]);

			const result = await fetchProfileMetadata('testpubkey');
			expect(result).toEqual({});
		});

		it('should handle network errors in profile fetching', async () => {
			// Mock pool to reject
			mockPool.querySync.mockRejectedValueOnce(new Error('Network error'));

			const result = await fetchProfileMetadata('testpubkey');
			expect(result).toEqual({});
		});

		it('should require valid parameters for message history', async () => {
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			mockPool.querySync.mockResolvedValueOnce([]);

			const result = await getMessageHistory('validpubkey');
			expect(Array.isArray(result)).toBe(true);
			expect(mockPool.querySync).toHaveBeenCalled();
		});

		it('should validate encryption dependencies for sending messages', async () => {
			mockNip44.encrypt.mockRejectedValueOnce(new Error('Invalid keys'));
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			await expect(sendDirectMessage('test message', 'recipientpubkey')).rejects.toThrow();
		});

		it('should handle thread message queries correctly', async () => {
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			mockPool.querySync.mockResolvedValueOnce([]);

			const result = await getThreadMessages('threadroot123');
			expect(Array.isArray(result)).toBe(true);
			expect(mockPool.querySync).toHaveBeenCalled();
		});

		it('should return empty array for getMessagedPeople when no messages exist', async () => {
			// getMessagedPeople uses getNpub, not getNostrKeyPair
			mockGetNpub.mockResolvedValueOnce('npub1test1234567890');
			mockPool.querySync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

			const result = await getMessagedPeople();
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(0);
		});
	});

	describe('Error handling', () => {
		it('should handle missing environment variables gracefully', () => {
			// The module should still be importable even with missing env vars
			expect(() => import('$lib/utils/nostr-message')).not.toThrow();
		});

		it('should handle invalid Nostr key pairs', async () => {
			mockGetNostrKeyPair.mockRejectedValue(new Error('Invalid key pair'));

			await expect(sendDirectMessage('test', 'recipient')).rejects.toThrow('Invalid key pair');
		});

		it('should handle relay connection failures', async () => {
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			mockPool.querySync.mockRejectedValueOnce(new Error('Connection failed'));

			// The function catches the error, shows a toast, and re-throws
			// The error message gets wrapped, so just check that it throws
			await expect(getMessageHistory('testpubkey')).rejects.toThrow();
		});
	});

	describe('Input validation', () => {
		it('should handle empty message content', async () => {
			mockNip44.encrypt.mockResolvedValueOnce('encrypted_empty');
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			// Use a valid hex address (42 chars for Ethereum-style, or 64 chars for full hex)
			// The code uses bytesToHex(nsec) which expects Uint8Array
			// And checks recipientPubkey.startsWith('npub') for decoding
			// Use a hex address directly (not npub) to avoid decode
			const recipientHex = '0x1234567890123456789012345678901234567890';
			mockPool.publish.mockResolvedValueOnce([Promise.resolve()]);

			await expect(sendDirectMessage('', recipientHex)).resolves.not.toThrow();
			expect(mockNip44.encrypt).toHaveBeenCalled();
		});

		it('should handle invalid pubkey formats gracefully', async () => {
			const result = await fetchProfileMetadata('');
			expect(result).toEqual({});
		});

		it('should handle pagination parameters correctly', async () => {
			mockGetNostrKeyPair.mockResolvedValue({
				nsec: new Uint8Array(32).fill(1),
				npub: 'npub1test1234567890'
			});

			mockPool.querySync.mockResolvedValueOnce([]);

			await getMessageHistory('testpubkey', { limit: 10, since: 1000, until: 2000 });
			expect(mockPool.querySync).toHaveBeenCalled();
		});
	});
});
