import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockFetchEvents = vi.hoisted(() => vi.fn());
const mockSubscribe = vi.hoisted(() => vi.fn(() => ({ stop: vi.fn() })));
const mockPublishSignedNdkEvent = vi.hoisted(() => vi.fn());
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

vi.mock('$lib/nostr/nip44', () => ({
	default: mockNip44
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNostrKeyPair: mockGetNostrKeyPair,
	getNpub: mockGetNpub
}));

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

	it('sendDirectMessage publishes via NDK', async () => {
		await sendDirectMessage('hello', 'b'.repeat(64));
		expect(mockPublishSignedNdkEvent).toHaveBeenCalled();
	});

	it('does not publish a phone number before escrow', async () => {
		const { ContactBlockedError } = await import('$lib/config/contact-filter');
		await expect(sendDirectMessage('7035550199', 'b'.repeat(64))).rejects.toBeInstanceOf(
			ContactBlockedError
		);
		expect(mockPublishSignedNdkEvent).not.toHaveBeenCalled();
	});

	it('still publishes a protocol location message that contains a url', async () => {
		await sendDirectMessage(
			'123 Main Street\nhttps://maps.example/place',
			'b'.repeat(64),
			undefined,
			[
				['m', 'location'],
				['l', '{}']
			]
		);
		expect(mockPublishSignedNdkEvent).toHaveBeenCalled();
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
