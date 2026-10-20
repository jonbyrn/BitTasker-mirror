import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchEvents = vi.hoisted(() => vi.fn());
const mockSubscribe = vi.hoisted(() => vi.fn(() => ({ stop: vi.fn() })));
const mockPublishSignedNdkEvent = vi.hoisted(() => vi.fn());
const mockPublishNostrEvent = vi.hoisted(() =>
	vi.fn().mockResolvedValue({
		event: {
			id: 'event-id',
			kind: 4,
			content: 'encrypted',
			tags: [],
			created_at: 1,
			pubkey: 'a'.repeat(64),
			sig: 'sig'
		}
	})
);
const mockNip44 = vi.hoisted(() => ({
	encrypt: vi.fn().mockResolvedValue('encrypted'),
	decrypt: vi.fn().mockResolvedValue('plaintext'),
	getConversationKey: vi.fn().mockResolvedValue(new Uint8Array(32))
}));
const mockGetNostrKeyPair = vi.hoisted(() =>
	vi.fn().mockResolvedValue({
		nsec: new Uint8Array(32).fill(1),
		npub: 'a'.repeat(64)
	})
);
const mockGetNpub = vi.hoisted(() => vi.fn().mockResolvedValue('a'.repeat(64)));
const mockQueryRelaysDetailed = vi.hoisted(() =>
	vi.fn().mockResolvedValue({
		events: [],
		relays: [{ url: 'wss://relay.example', ok: true, reason: 'ok' }]
	})
);
const mockAssertChatAllowed = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		fetchEvents: (...args: Parameters<typeof mockFetchEvents>) => mockFetchEvents(...args),
		subscribe: (...args: Parameters<typeof mockSubscribe>) => mockSubscribe(...args),
		signer: {}
	}
}));

vi.mock('@nostr-dev-kit/ndk', () => ({
	NDKRelaySet: {
		fromRelayUrls: vi.fn(() => ({}))
	}
}));

vi.mock('$lib/nostr/profile/ndk', () => ({
	publishSignedNdkEvent: (...args: Parameters<typeof mockPublishSignedNdkEvent>) =>
		mockPublishSignedNdkEvent(...args)
}));

vi.mock('$lib/utils/nostr', () => ({
	publishNostrEvent: (...args: Parameters<typeof mockPublishNostrEvent>) =>
		mockPublishNostrEvent(...args)
}));

vi.mock('$lib/nostr/nip44', () => ({
	default: mockNip44
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: mockGetNostrKeyPair,
	getNpub: mockGetNpub
}));

vi.mock('$lib/nostr/relaySession', () => ({
	messageRelayUrls: () => ['wss://relay.example'],
	queryRelaysDetailed: (...args: unknown[]) => mockQueryRelaysDetailed(...args),
	subscribeRelayEvents: vi.fn(() => () => undefined),
	clarifyDeliveryFailure: (message: string) => message,
	RELAY_SIGN_IN_REASON: 'asked for a sign-in this app does not send'
}));

vi.mock('$lib/nostr/messaging-policy', async () => {
	const actual = await vi.importActual<typeof import('$lib/nostr/messaging-policy')>(
		'$lib/nostr/messaging-policy'
	);
	return {
		...actual,
		assertChatAllowed: (...args: unknown[]) => mockAssertChatAllowed(...args)
	};
});

vi.mock('$lib/stores/app.store', async () => {
	const { writable, get } = await import('svelte/store');
	const store = writable({
		relays: ['wss://relay.test'],
		pool: { querySync: vi.fn(() => []), subscribe: vi.fn(() => ({ close: vi.fn() })) }
	});
	return {
		appStore: Object.assign(store, {
			showErrorToast: vi.fn(),
			get: () => get(store)
		})
	};
});

vi.mock('$lib/nostr/profile/display-profile', () => ({
	fetchProfilesBatch: vi.fn().mockResolvedValue(new Map())
}));

vi.mock('$lib/utils/session', () => ({
	destroySession: vi.fn()
}));

vi.mock('$lib/stores/task.store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/stores/task.store')>();
	return {
		...actual,
		tasksStore: {
			subscribe: vi.fn(() => () => {}),
			update: vi.fn(),
			set: vi.fn(),
			reset: vi.fn(),
			pool: { querySync: vi.fn(() => []), subscribe: vi.fn(() => ({ close: vi.fn() })) }
		},
		myTasksStore: {
			subscribe: vi.fn(() => () => {}),
			update: vi.fn(),
			set: vi.fn(),
			reset: vi.fn()
		}
	};
});

import {
	sendDirectMessage,
	getMessageHistory,
	getMessagedPeople,
	listenForIncomingMessages
} from '$lib/nostr/direct-messages';

describe('direct-messages', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetNostrKeyPair.mockResolvedValue({
			nsec: new Uint8Array(32).fill(1),
			npub: 'a'.repeat(64)
		});
		mockGetNpub.mockResolvedValue('a'.repeat(64));
		mockFetchEvents.mockResolvedValue(new Set());
		mockAssertChatAllowed.mockResolvedValue(undefined);
		mockQueryRelaysDetailed.mockResolvedValue({
			events: [],
			relays: [{ url: 'wss://relay.example', ok: true, reason: 'ok' }]
		});
		mockPublishSignedNdkEvent.mockResolvedValue({
			id: 'event-id',
			kind: 4,
			content: 'encrypted',
			tags: [],
			created_at: 1,
			pubkey: 'a'.repeat(64),
			sig: 'sig'
		});
	});

	it('exports DM helpers', () => {
		expect(sendDirectMessage).toBeDefined();
		expect(getMessageHistory).toBeDefined();
		expect(getMessagedPeople).toBeDefined();
		expect(listenForIncomingMessages).toBeDefined();
	});

	it('sendDirectMessage publishes an encrypted kind-4 DM', async () => {
		await sendDirectMessage('hello', 'b'.repeat(64));
		expect(mockPublishNostrEvent).toHaveBeenCalledWith(
			4,
			'hello',
			'b'.repeat(64),
			[
				['p', 'b'.repeat(64)],
				['m', 'direct-message']
			],
			['wss://relay.example']
		);
	});

	it('getMessagedPeople reports a relay that asks for a sign-in', async () => {
		mockQueryRelaysDetailed.mockResolvedValueOnce({
			events: [],
			relays: [
				{
					url: 'wss://relay2-dev.bittasker.com',
					ok: false,
					reason: 'asked for a sign-in this app does not send'
				}
			]
		});
		await expect(getMessagedPeople()).rejects.toThrow(/sign-in/);
	});

	it('getMessageHistory returns an array', async () => {
		const result = await getMessageHistory('b'.repeat(64));
		expect(Array.isArray(result)).toBe(true);
	});

	it('getMessagedPeople returns an array when no messages exist', async () => {
		const result = await getMessagedPeople();
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(0);
	});
});
