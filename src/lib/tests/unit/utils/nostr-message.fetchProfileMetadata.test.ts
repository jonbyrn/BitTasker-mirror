import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';

const mockQuerySync = vi.hoisted(() => vi.fn());
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

vi.mock('$lib/stores/app.store', () => ({
	appStore: readable({
		pool: {
			querySync: (...args: Parameters<typeof mockQuerySync>) => mockQuerySync(...args)
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
	});

	it('does not cache empty profile lookups, allowing later retries to succeed', async () => {
		mockQuerySync.mockResolvedValueOnce([]).mockResolvedValueOnce([
			{
				kind: 0,
				pubkey,
				created_at: 1_700_000_000,
				content: JSON.stringify({ display_name: 'Recovered Name' }),
				tags: []
			}
		]);

		const firstResult = await fetchProfileMetadata(npub);
		expect(firstResult).toEqual({});
		expect(mockCacheProfile).not.toHaveBeenCalledWith(expect.any(String), {});

		const secondResult = await fetchProfileMetadata(npub);
		expect(secondResult).toEqual(
			expect.objectContaining({
				name: 'Recovered Name'
			})
		);
		expect(mockQuerySync).toHaveBeenCalledTimes(2);
	});

	it('uses a canonical cache key so npub and hex lookups share the same cached profile', async () => {
		mockQuerySync.mockResolvedValueOnce([
			{
				kind: 0,
				pubkey,
				created_at: 1_700_000_001,
				content: JSON.stringify({ display_name: 'Canonical User' }),
				tags: []
			}
		]);

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
		expect(mockQuerySync).toHaveBeenCalledTimes(1);
	});
});
