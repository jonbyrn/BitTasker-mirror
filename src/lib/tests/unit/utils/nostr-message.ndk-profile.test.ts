import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readable } from 'svelte/store';

// Hoisted mocks - must be before any imports that use them
const mockNdkGetUser = vi.hoisted(() => vi.fn());
const mockNdkFetchProfile = vi.hoisted(() => vi.fn());

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
		getProfile: vi.fn().mockResolvedValue(null),
		cacheProfile: vi.fn().mockResolvedValue(undefined),
		clear: vi.fn()
	}
}));

import { nip19 } from 'nostr-tools';
import { fetchProfileMetadata } from '$lib/utils/nostr-message';

describe('fetchProfileMetadata NDK Integration', () => {
	const pubkey = 'c'.repeat(64);
	const npub = nip19.npubEncode(pubkey);

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('when NDK is configured and returns profile data', () => {
		it('should use NDKUser profile when available', async () => {
			// Setup NDK mock to return a user with profile data
			const mockUser = {
				hexpubkey: pubkey,
				npub: npub,
				profile: {
					displayName: 'NDK Test User',
					name: 'Test User',
					picture: 'https://example.com/avatar.jpg'
				},
				fetchProfile: mockNdkFetchProfile.mockResolvedValue(undefined)
			};
			mockNdkGetUser.mockReturnValue(mockUser);

			const result = await fetchProfileMetadata(npub);

			expect(mockNdkGetUser).toHaveBeenCalledWith({ hexpubkey: pubkey });
			expect(mockNdkFetchProfile).toHaveBeenCalled();
			expect(result.name).toBe('NDK Test User');
			expect(result.picture).toBe('https://example.com/avatar.jpg');
		});

		it('should handle profile with only name field', async () => {
			const mockUser = {
				hexpubkey: pubkey,
				profile: {
					name: 'Only Name Field'
				},
				fetchProfile: mockNdkFetchProfile.mockResolvedValue(undefined)
			};
			mockNdkGetUser.mockReturnValue(mockUser);

			const result = await fetchProfileMetadata(npub);

			expect(result.name).toBe('Only Name Field');
			expect(result.picture).toBeUndefined();
		});

		it('should return empty object when profile is null', async () => {
			const mockUser = {
				hexpubkey: pubkey,
				profile: null,
				fetchProfile: mockNdkFetchProfile.mockResolvedValue(undefined)
			};
			mockNdkGetUser.mockReturnValue(mockUser);

			const result = await fetchProfileMetadata(npub);

			expect(result).toEqual({});
		});

		it('should return empty object when getUser returns null', async () => {
			mockNdkGetUser.mockReturnValue(null);

			const result = await fetchProfileMetadata(npub);

			expect(result).toEqual({});
		});

		it('should handle NDK fetchProfile errors gracefully', async () => {
			const mockUser = {
				hexpubkey: pubkey,
				profile: null,
				fetchProfile: mockNdkFetchProfile.mockRejectedValue(new Error('NDK error'))
			};
			mockNdkGetUser.mockReturnValue(mockUser);

			const result = await fetchProfileMetadata(npub);

			expect(result).toEqual({});
		});

		it('should handle both npub and hex pubkey inputs', async () => {
			const mockUser = {
				hexpubkey: pubkey,
				profile: { displayName: 'Test' },
				fetchProfile: mockNdkFetchProfile.mockResolvedValue(undefined)
			};
			mockNdkGetUser.mockReturnValue(mockUser);

			// Test with npub
			await fetchProfileMetadata(npub);
			expect(mockNdkGetUser).toHaveBeenLastCalledWith({ hexpubkey: pubkey });

			// Test with hex
			await fetchProfileMetadata(pubkey);
			expect(mockNdkGetUser).toHaveBeenLastCalledWith({ hexpubkey: pubkey });
		});
	});
});
