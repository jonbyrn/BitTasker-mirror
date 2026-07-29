import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import KINDS from '$lib/utils/constants/kinds';

const mockFetchProfileMetadata = vi.hoisted(() => vi.fn());

vi.mock('$lib/nostr/profile/display-profile', () => ({
	fetchProfileMetadata: (...args: Parameters<typeof mockFetchProfileMetadata>) =>
		mockFetchProfileMetadata(...args)
}));

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

import { user, getCachedEvent, cacheEvent, nostrEventCache } from '$lib/stores/user.store';
import { getNpub } from '$lib/utils/nostrKeys';

const initialProfile = {
	id: 0,
	name: '',
	email: '',
	npub: '',
	picture: ''
};

describe('user.store', () => {
	beforeEach(() => {
		user.reset();
		nostrEventCache.clear();
		vi.clearAllMocks();
		mockFetchProfileMetadata.mockResolvedValue({});
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('initial state', () => {
		it('should have correct initial profile shape', () => {
			const state = get(user);
			expect(state).toEqual(initialProfile);
		});
	});

	describe('updateProfile', () => {
		it('should merge partial data into profile', () => {
			user.updateProfile({ name: 'Alice' });
			expect(get(user).name).toBe('Alice');
			expect(get(user).email).toBe('');
			expect(get(user).npub).toBe('');
		});

		it('should allow updating multiple fields', () => {
			user.updateProfile({
				name: 'Bob',
				email: 'bob@example.com',
				picture: 'https://example.com/avatar.png'
			});
			const state = get(user);
			expect(state.name).toBe('Bob');
			expect(state.email).toBe('bob@example.com');
			expect(state.picture).toBe('https://example.com/avatar.png');
		});

		it('should preserve existing fields when updating one', () => {
			user.updateProfile({ name: 'Carol', email: 'carol@example.com' });
			user.updateProfile({ picture: 'https://example.com/pic.png' });
			const state = get(user);
			expect(state.name).toBe('Carol');
			expect(state.email).toBe('carol@example.com');
			expect(state.picture).toBe('https://example.com/pic.png');
		});
	});

	describe('reset', () => {
		it('should restore initial profile', () => {
			user.updateProfile({ name: 'Dave', npub: 'npub123' });
			user.reset();
			expect(get(user)).toEqual(initialProfile);
		});
	});

	describe('cache helpers (getCachedEvent, cacheEvent)', () => {
		it('should return null when cache is empty', () => {
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(null);
		});

		it('should return cached event after cacheEvent', () => {
			const event = {
				kind: KINDS.PROFILE_METADATA,
				content: '{}',
				id: 'e1',
				pubkey: 'pk1',
				created_at: 1000,
				sig: '',
				tags: [] as string[][]
			};
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(event);
		});

		it('should return null for different kind', () => {
			const event = {
				kind: KINDS.PROFILE_METADATA,
				content: '{}',
				id: 'e2',
				pubkey: 'pk1',
				created_at: 1000,
				sig: '',
				tags: [] as string[][]
			};
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_IMAGES, 'npub1')).toBe(null);
		});

		it('should return null for different npub', () => {
			const event = {
				kind: KINDS.PROFILE_METADATA,
				content: '{}',
				id: 'e3',
				pubkey: 'pk1',
				created_at: 1000,
				sig: '',
				tags: [] as string[][]
			};
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub2')).toBe(null);
		});

		it('should return null when cache entry is expired', () => {
			vi.useFakeTimers();
			const event = {
				kind: KINDS.PROFILE_METADATA,
				content: '{}',
				id: 'e4',
				pubkey: 'pk1',
				created_at: 1000,
				sig: '',
				tags: [] as string[][]
			};
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(event);
			// CACHE_TTL is 5 minutes
			vi.advanceTimersByTime(5 * 60 * 1000 + 1);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(null);
		});
	});

	describe('getUserData', () => {
		it('should throw when getNpub returns null', async () => {
			vi.mocked(getNpub).mockResolvedValue(null as unknown as string);
			await expect(user.getUserData()).rejects.toThrow('No public key found');
		});

		it('should throw when getNpub returns empty string', async () => {
			vi.mocked(getNpub).mockResolvedValue('');
			await expect(user.getUserData()).rejects.toThrow('No public key found');
		});

		it('should update npub and name from NDK profile fetch', async () => {
			vi.mocked(getNpub).mockResolvedValue('npub123');
			mockFetchProfileMetadata.mockResolvedValue({
				name: 'Alice',
				picture: 'https://example.com/avatar.png'
			});
			await user.getUserData();
			const state = get(user);
			expect(state.npub).toBe('npub123');
			expect(state.name).toBe('Alice');
			expect(state.picture).toBe('https://example.com/avatar.png');
			expect(mockFetchProfileMetadata).toHaveBeenCalledWith('npub123');
		});

		it('should skip second fetch when isDataLoaded (call getUserData twice)', async () => {
			vi.mocked(getNpub).mockResolvedValue('npub789');
			mockFetchProfileMetadata.mockResolvedValue({ name: 'Once' });
			await user.getUserData();
			expect(get(user).name).toBe('Once');
			mockFetchProfileMetadata.mockClear();
			await user.getUserData();
			expect(mockFetchProfileMetadata).not.toHaveBeenCalled();
		});

		it('should fetch again after reset', async () => {
			vi.mocked(getNpub).mockResolvedValue('npubReset');
			mockFetchProfileMetadata
				.mockResolvedValueOnce({ name: 'First', picture: 'https://first.png' })
				.mockResolvedValueOnce({ name: 'Second', picture: 'https://second.png' });
			await user.getUserData();
			expect(get(user).name).toBe('First');
			user.reset();
			await user.getUserData();
			expect(get(user).name).toBe('Second');
			expect(mockFetchProfileMetadata).toHaveBeenCalledTimes(2);
		});
	});
});
