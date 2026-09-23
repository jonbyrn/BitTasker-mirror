import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nip19 } from 'nostr-tools';

const mockFetchEvents = vi.hoisted(() => vi.fn());
const mockProfileCacheStore = vi.hoisted(
	() => new Map<string, { name?: string; picture?: string; createdAt?: string }>()
);
const mockGetProfile = vi.hoisted(() =>
	vi.fn(async (pubkey: string) => mockProfileCacheStore.get(pubkey) ?? null)
);
const mockCacheProfile = vi.hoisted(() =>
	vi.fn(
		async (pubkey: string, profile: { name?: string; picture?: string; createdAt?: string }) => {
			mockProfileCacheStore.set(pubkey, profile);
		}
	)
);

vi.mock('$lib/nostr/ndk', () => ({
	ndk: {
		fetchEvents: (...args: Parameters<typeof mockFetchEvents>) => mockFetchEvents(...args),
		// profile/ndk.ts uses ndk.fetchEvent (singular) — resolve to the first Set entry.
		fetchEvent: async (...args: Parameters<typeof mockFetchEvents>) => {
			const set = (await mockFetchEvents(...args)) as Set<unknown> | null | undefined;
			return set && set.size > 0 ? [...set][0] : null;
		}
	}
}));

vi.mock('@nostr-dev-kit/ndk', () => ({
	NDKRelaySet: {
		fromRelayUrls: vi.fn(() => ({}))
	}
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

vi.mock('$lib/stores/app.store', () => ({
	appStore: {
		subscribe: vi.fn(),
		set: vi.fn(),
		update: vi.fn()
	},
	get: vi.fn(() => ({ relays: ['wss://relay.example'] }))
}));

vi.mock('svelte/store', async (importOriginal) => {
	const actual = await importOriginal<typeof import('svelte/store')>();
	return {
		...actual,
		get: vi.fn(() => ({ relays: ['wss://relay.example'] }))
	};
});

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		getProfile: (...args: Parameters<typeof mockGetProfile>) => mockGetProfile(...args),
		cacheProfile: (...args: Parameters<typeof mockCacheProfile>) => mockCacheProfile(...args),
		clear: () => mockProfileCacheStore.clear()
	}
}));

import { fetchProfileMetadata } from '$lib/nostr/profile/display-profile';

function mockNdkProfileEvent(
	pubkey: string,
	content: Record<string, unknown>,
	createdAt = 1_700_000_000
) {
	return {
		toNostrEvent: vi.fn().mockResolvedValue({
			kind: 0,
			pubkey,
			created_at: createdAt,
			content: JSON.stringify(content),
			tags: [],
			id: 'id',
			sig: 'sig'
		})
	};
}

describe('fetchProfileMetadata', () => {
	const pubkey = 'c'.repeat(64);
	const npub = nip19.npubEncode(pubkey);

	beforeEach(() => {
		vi.clearAllMocks();
		mockProfileCacheStore.clear();
	});

	it('does not cache empty profile lookups, allowing later retries to succeed', async () => {
		mockFetchEvents
			.mockResolvedValueOnce(new Set())
			.mockResolvedValueOnce(
				new Set([mockNdkProfileEvent(pubkey, { display_name: 'Recovered Name' })])
			);

		const firstResult = await fetchProfileMetadata(npub);
		expect(firstResult).toEqual({});
		expect(mockCacheProfile).not.toHaveBeenCalledWith(expect.any(String), {});

		const secondResult = await fetchProfileMetadata(npub);
		expect(secondResult).toEqual(
			expect.objectContaining({
				name: 'Recovered Name'
			})
		);
		expect(mockFetchEvents).toHaveBeenCalledTimes(2);
	});

	it('uses a canonical cache key so npub and hex lookups share the same cached profile', async () => {
		mockFetchEvents.mockResolvedValueOnce(
			new Set([mockNdkProfileEvent(pubkey, { display_name: 'Canonical User' })])
		);

		const firstResult = await fetchProfileMetadata(npub);
		expect(firstResult).toEqual(
			expect.objectContaining({
				name: 'Canonical User'
			})
		);

		const secondResult = await fetchProfileMetadata(pubkey);
		expect(secondResult).toEqual(
			expect.objectContaining({
				name: 'Canonical User'
			})
		);
		expect(mockFetchEvents).toHaveBeenCalledTimes(1);
	});
});
