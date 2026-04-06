import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { muteStore } from '$lib/stores/mute.store';

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockQuerySync = vi.fn();
const mockPublish = vi.fn();
const mockGetSignedEvent = vi.fn();
const mockRemovePubkeyBids = vi.fn();
const mockRemovePubkeyTasks = vi.fn();

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn((cb) => {
			cb({
				pool: { querySync: mockQuerySync, publish: mockPublish },
				relays: ['wss://relay.test']
			});
			return () => {};
		})
	}
}));

vi.mock('svelte/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/store')>();
	return {
		...actual,
		get: vi.fn((store) => {
			// Return app store mock for appStore, delegate to real store for muteStore
			if (store === muteStore) {
				return actual.get(store);
			}
			return {
				pool: { querySync: mockQuerySync, publish: mockPublish },
				relays: ['wss://relay.test']
			};
		})
	};
});

vi.mock('$lib/stores/bid.store', () => ({
	bidStore: {
		removePubkeyBids: mockRemovePubkeyBids
	}
}));

vi.mock('$lib/stores/task.store', () => ({
	tasksStore: {
		removePubkeyTasks: mockRemovePubkeyTasks
	}
}));

vi.mock('$lib/utils/nostr', () => ({
	getSignedEvent: mockGetSignedEvent
}));

vi.mock('$lib/utils/constants/kinds', () => ({
	default: {
		MUTE_LIST: 10000,
		REPORT: 1984
	}
}));

// ── Helpers ────────────────────────────────────────────────────────────────

const USER_PUBKEY = 'aabbccdd1122334455667788990011223344556677889900aabbccdd11223344';
const OTHER_PUBKEY = '1122334455667788990011223344556677889900aabbccdd1122334455667788';

function makeMuteListEvent(pubkeys: string[], eventIds: string[], created_at = 1700000000) {
	return {
		id: 'mute-event-id',
		kind: 10000,
		pubkey: USER_PUBKEY,
		created_at,
		content: '',
		tags: [...pubkeys.map((pk) => ['p', pk]), ...eventIds.map((id) => ['e', id])],
		sig: 'sig'
	};
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('muteList', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		muteStore.reset();
		mockGetSignedEvent.mockResolvedValue({ id: 'signed-event', kind: 10000 });
		mockRemovePubkeyTasks.mockReturnValue(0);
	});

	describe('fetchMuteList()', () => {
		it('should load an empty mute list when the relay returns no events', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			mockQuerySync.mockResolvedValue([]);

			await fetchMuteList(USER_PUBKEY);

			const state = get(muteStore);
			expect(state.isLoaded).toBe(true);
			expect(state.mutedPubkeys.size).toBe(0);
			expect(state.mutedEventIds.size).toBe(0);
		});

		it('should populate mutedPubkeys from p-tags in the relay event', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			mockQuerySync.mockResolvedValue([makeMuteListEvent([OTHER_PUBKEY], [])]);

			await fetchMuteList(USER_PUBKEY);

			expect(get(muteStore).mutedPubkeys.has(OTHER_PUBKEY)).toBe(true);
		});

		it('should populate mutedEventIds from e-tags in the relay event', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			const eventId = 'deadbeef1234567890abcdef1234567890abcdef1234567890abcdef12345678';
			mockQuerySync.mockResolvedValue([makeMuteListEvent([], [eventId])]);

			await fetchMuteList(USER_PUBKEY);

			expect(get(muteStore).mutedEventIds.has(eventId)).toBe(true);
		});

		it('should use the most recent event when the relay returns multiple', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			const older = makeMuteListEvent(['old-pubkey'], [], 1000);
			const newer = makeMuteListEvent(['new-pubkey'], [], 2000);
			mockQuerySync.mockResolvedValue([older, newer]);

			await fetchMuteList(USER_PUBKEY);

			const state = get(muteStore);
			expect(state.mutedPubkeys.has('new-pubkey')).toBe(true);
			expect(state.mutedPubkeys.has('old-pubkey')).toBe(false);
		});

		it('should set isLoaded to true even when the relay throws', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			mockQuerySync.mockRejectedValue(new Error('relay error'));

			await fetchMuteList(USER_PUBKEY);

			expect(get(muteStore).isLoaded).toBe(true);
		});

		it('should query with kind 10000 and the user pubkey', async () => {
			const { fetchMuteList } = await import('$lib/nostr/muteList');
			mockQuerySync.mockResolvedValue([]);

			await fetchMuteList(USER_PUBKEY);

			expect(mockQuerySync).toHaveBeenCalledWith(
				['wss://relay.test'],
				expect.objectContaining({ kinds: [10000], authors: [USER_PUBKEY] })
			);
		});
	});

	describe('mutePubkey()', () => {
		it('should add the pubkey to the mute store', async () => {
			const { mutePubkey } = await import('$lib/nostr/muteList');

			await mutePubkey(OTHER_PUBKEY);

			expect(get(muteStore).mutedPubkeys.has(OTHER_PUBKEY)).toBe(true);
		});

		it('should call bidStore.removePubkeyBids with the pubkey', async () => {
			const { mutePubkey } = await import('$lib/nostr/muteList');

			await mutePubkey(OTHER_PUBKEY);

			expect(mockRemovePubkeyBids).toHaveBeenCalledWith(OTHER_PUBKEY);
		});

		it('should call tasksStore.removePubkeyTasks and return the count', async () => {
			const { mutePubkey } = await import('$lib/nostr/muteList');
			mockRemovePubkeyTasks.mockReturnValue(3);

			const removed = await mutePubkey(OTHER_PUBKEY);

			expect(mockRemovePubkeyTasks).toHaveBeenCalledWith(OTHER_PUBKEY);
			expect(removed).toBe(3);
		});

		it('should publish the updated mute list to the relay', async () => {
			const { mutePubkey } = await import('$lib/nostr/muteList');

			await mutePubkey(OTHER_PUBKEY);

			expect(mockPublish).toHaveBeenCalled();
		});

		it('should include the new pubkey in the published tags', async () => {
			const { mutePubkey } = await import('$lib/nostr/muteList');

			await mutePubkey(OTHER_PUBKEY);

			const publishedTags: string[][] = mockGetSignedEvent.mock.calls[0][0].tags;
			const pTags = publishedTags.filter((t) => t[0] === 'p').map((t) => t[1]);
			expect(pTags).toContain(OTHER_PUBKEY);
		});
	});

	describe('unmutePubkey()', () => {
		it('should remove the pubkey from the mute store', async () => {
			const { unmutePubkey } = await import('$lib/nostr/muteList');
			muteStore.load([OTHER_PUBKEY], []);

			await unmutePubkey(OTHER_PUBKEY);

			expect(get(muteStore).mutedPubkeys.has(OTHER_PUBKEY)).toBe(false);
		});

		it('should publish the updated (smaller) mute list', async () => {
			const { unmutePubkey } = await import('$lib/nostr/muteList');
			muteStore.load([OTHER_PUBKEY], []);

			await unmutePubkey(OTHER_PUBKEY);

			expect(mockPublish).toHaveBeenCalled();
		});
	});

	describe('muteEventId()', () => {
		it('should add the event ID to the mute store', async () => {
			const { muteEventId } = await import('$lib/nostr/muteList');
			const eventId = 'cafebabe1234567890abcdef1234567890abcdef1234567890abcdef12345678';

			await muteEventId(eventId);

			expect(get(muteStore).mutedEventIds.has(eventId)).toBe(true);
		});

		it('should publish the updated mute list', async () => {
			const { muteEventId } = await import('$lib/nostr/muteList');

			await muteEventId('some-event-id');

			expect(mockPublish).toHaveBeenCalled();
		});
	});

	describe('unmuteEventId()', () => {
		it('should remove the event ID from the mute store', async () => {
			const { unmuteEventId } = await import('$lib/nostr/muteList');
			const eventId = 'cafebabe1234567890abcdef1234567890abcdef1234567890abcdef12345678';
			muteStore.load([], [eventId]);

			await unmuteEventId(eventId);

			expect(get(muteStore).mutedEventIds.has(eventId)).toBe(false);
		});
	});

	describe('isPubkeyMuted()', () => {
		it('should return true when the pubkey is in the mute store', async () => {
			const { isPubkeyMuted } = await import('$lib/nostr/muteList');
			muteStore.load([OTHER_PUBKEY], []);

			expect(isPubkeyMuted(OTHER_PUBKEY)).toBe(true);
		});

		it('should return false when the pubkey is not muted', async () => {
			const { isPubkeyMuted } = await import('$lib/nostr/muteList');
			muteStore.load([], []);

			expect(isPubkeyMuted(OTHER_PUBKEY)).toBe(false);
		});
	});
});
