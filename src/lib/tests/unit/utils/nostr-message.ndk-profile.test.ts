import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';

const querySync = vi.fn();

vi.mock('$lib/stores/app.store', () => ({
	appStore: readable({
		pool: {
			querySync: (...args: unknown[]) => querySync(...args)
		}
	})
}));

vi.mock('$lib/utils/profile-cache', () => ({
	profileCache: {
		getProfile: vi.fn().mockResolvedValue(null),
		cacheProfile: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn()
	}
}));

import { nip19 } from 'nostr-tools';
import { fetchProfileMetadata } from '$lib/utils/nostr-message';

describe('fetchProfileMetadata (relay pool)', () => {
	const pubkey = 'c'.repeat(64);
	const npub = nip19.npubEncode(pubkey);

	beforeEach(() => {
		vi.clearAllMocks();
		vi.stubEnv('VITE_NOSTR_RELAY_URL', 'wss://relay.example.com');
	});

	it('prefers display_name / displayName over plain name from kind 0', async () => {
		querySync.mockResolvedValue([
			{
				kind: 0,
				content: JSON.stringify({
					displayName: 'NDK Test User',
					name: 'Ignored',
					picture: 'https://example.com/avatar.jpg'
				}),
				created_at: 1_700_000_001
			}
		]);

		const result = await fetchProfileMetadata(npub);

		expect(querySync).toHaveBeenCalled();
		expect(result.name).toBe('NDK Test User');
		expect(result.picture).toBe('https://example.com/avatar.jpg');
	});

	it('uses name when no display fields are present', async () => {
		querySync.mockResolvedValue([
			{
				kind: 0,
				content: JSON.stringify({ name: 'Only Name Field' }),
				created_at: 1_700_000_000
			}
		]);

		const result = await fetchProfileMetadata(npub);

		expect(result.name).toBe('Only Name Field');
		expect(result.picture).toBeUndefined();
	});

	it('returns empty shape when no profile events are returned', async () => {
		querySync.mockResolvedValue([]);

		const result = await fetchProfileMetadata(npub);

		expect(result).toEqual({
			name: undefined,
			picture: undefined,
			createdAt: undefined
		});
	});

	it('normalizes npub and hex pubkey to the same author filter', async () => {
		querySync.mockResolvedValue([
			{
				kind: 0,
				content: JSON.stringify({ name: 'Test' }),
				created_at: 1_700_000_000
			}
		]);

		await fetchProfileMetadata(npub);
		const filterNpub = querySync.mock.calls.at(-1)?.[1] as { authors?: string[] };
		expect(filterNpub?.authors?.[0]).toBe(pubkey);

		await fetchProfileMetadata(pubkey);
		const filterHex = querySync.mock.calls.at(-1)?.[1] as { authors?: string[] };
		expect(filterHex?.authors?.[0]).toBe(pubkey);
	});
});
