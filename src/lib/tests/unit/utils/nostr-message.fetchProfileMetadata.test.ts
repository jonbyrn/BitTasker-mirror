import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';

// Hoisted mocks - must be before any imports that use them
const mockNdkGetUser = vi.hoisted(() => vi.fn());
const mockNdkFetchProfile = vi.hoisted(() => vi.fn());
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
		getUser: mockNdkGetUser
	}
}));

vi.mock('$lib/stores/app.store', () => ({
	appStore: readable({
		pool: {
			querySync: vi.fn()
		}
	})
}));

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		getProfile: (...args: Parameters<typeof mockGetProfile>) => mockGetProfile(...args),
		cacheProfile: (...args: Parameters<typeof mockCacheProfile>) => mockCacheProfile(...args),
		clear: () => mockProfileCacheStore.clear()
	}
}));

import { nip19 } from 'nostr-tools';
import { fetchProfileMetadata } from '$lib/utils/nostr-message';

describe('fetchProfileMetadata', () => {
	const pubkey = 'c'.repeat(64);
	const npub = nip19.npubEncode(pubkey);

	beforeEach(() => {
		vi.clearAllMocks();
		mockProfileCacheStore.clear();
		mockNdkFetchProfile.mockReset();
	});

	it('does not cache empty profile lookups, allowing later retries to succeed', async () => {
		// First call returns no profile, second call returns profile
		const mockUserNoProfile = {
			hexpubkey: pubkey,
			npub: npub,
			profile: null,
			fetchProfile: mockNdkFetchProfile
				.mockResolvedValueOnce(undefined)
				.mockResolvedValueOnce(undefined)
		};
		const mockUserWithProfile = {
			hexpubkey: pubkey,
			npub: npub,
			profile: {
				displayName: 'Recovered Name',
				name: undefined,
				picture: undefined
			},
			fetchProfile: mockNdkFetchProfile.mockResolvedValueOnce(undefined)
		};

		mockNdkGetUser.mockReturnValueOnce(mockUserNoProfile).mockReturnValueOnce(mockUserWithProfile);

		const firstResult = await fetchProfileMetadata(npub);
		expect(firstResult).toEqual({});
		expect(mockCacheProfile).not.toHaveBeenCalled();

		const secondResult = await fetchProfileMetadata(npub);
		expect(secondResult).toEqual(
			expect.objectContaining({
				name: 'Recovered Name'
			})
		);
		expect(mockNdkFetchProfile).toHaveBeenCalledTimes(2);
	});

	it('uses a canonical cache key so npub and hex lookups share the same cached profile', async () => {
		const mockUser = {
			hexpubkey: pubkey,
			npub: npub,
			profile: {
				displayName: 'Canonical User',
				name: undefined,
				picture: undefined
			},
			fetchProfile: mockNdkFetchProfile.mockResolvedValue(undefined)
		};
		mockNdkGetUser.mockReturnValue(mockUser);

		const firstResult = await fetchProfileMetadata(npub);
		expect(firstResult).toEqual(
			expect.objectContaining({
				name: 'Canonical User'
			})
		);

		// Second call with hex pubkey should use cached result
		const secondResult = await fetchProfileMetadata(pubkey);
		expect(secondResult).toEqual(
			expect.objectContaining({
				name: 'Canonical User'
			})
		);
		// Should only fetch once since second call uses cache
		expect(mockNdkFetchProfile).toHaveBeenCalledTimes(1);
	});
});
