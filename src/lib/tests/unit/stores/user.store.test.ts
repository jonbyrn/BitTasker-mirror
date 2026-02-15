import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import KINDS from '$lib/utils/constants/kinds';

const mockPool = vi.hoisted(() => ({ querySync: vi.fn() }));

vi.mock('$lib/stores/app.store', () => {
	const { writable } = require('svelte/store');
	const state = {
		relays: ['wss://relay.test'],
		pool: mockPool
	};
	const store = writable(state);
	return {
		appStore: Object.assign(store, { initializePool: () => mockPool })
	};
});

vi.mock('$lib/utils/nostrKeys', () => ({
	getNpub: vi.fn()
}));

import {
	user,
	getCachedEvent,
	cacheEvent,
	nostrEventCache
} from '$lib/stores/user.store';
import { getNpub } from '$lib/utils/nostrKeys';

const initialProfile = {
	id: 0,
	name: '',
	email: '',
	npub: '',
	picture: ''
};

describe('user.store', () => {
	beforeEach(async () => {
		user.reset();
		nostrEventCache.clear();
		vi.clearAllMocks();
		// Restore appStore relays (in case "empty relays" test left them empty)
		const { appStore } = await import('$lib/stores/app.store');
		appStore.update((s) => ({ ...s, relays: ['wss://relay.test'] }));
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
			const event = { kind: KINDS.PROFILE_METADATA, content: '{}', id: 'e1' } as any;
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(event);
		});

		it('should return null for different kind', () => {
			const event = { kind: KINDS.PROFILE_METADATA, content: '{}' } as any;
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_IMAGES, 'npub1')).toBe(null);
		});

		it('should return null for different npub', () => {
			const event = { kind: KINDS.PROFILE_METADATA, content: '{}' } as any;
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub2')).toBe(null);
		});

		it('should return null when cache entry is expired', () => {
			vi.useFakeTimers();
			const event = { kind: KINDS.PROFILE_METADATA, content: '{}' } as any;
			cacheEvent(KINDS.PROFILE_METADATA, 'npub1', event);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(event);
			// CACHE_TTL is 5 minutes
			vi.advanceTimersByTime(5 * 60 * 1000 + 1);
			expect(getCachedEvent(KINDS.PROFILE_METADATA, 'npub1')).toBe(null);
		});
	});

	describe('getUserData', () => {
		it('should throw when getNpub returns null', async () => {
			vi.mocked(getNpub).mockResolvedValue(null as any);
			await expect(user.getUserData()).rejects.toThrow('No public key found');
		});

		it('should throw when getNpub returns empty string', async () => {
			vi.mocked(getNpub).mockResolvedValue('');
			await expect(user.getUserData()).rejects.toThrow('No public key found');
		});

		it('should throw when relays are empty', async () => {
			const { appStore } = await import('$lib/stores/app.store');
			appStore.update((s) => ({ ...s, relays: [] }));
			vi.mocked(getNpub).mockResolvedValue('npub123');
			await expect(user.getUserData()).rejects.toThrow('No valid relay URLs available');
		});

		it('should update npub and name from metadata when fetch returns profile', async () => {
			vi.mocked(getNpub).mockResolvedValue('npub123');
			mockPool.querySync.mockResolvedValue([
				{
					kind: KINDS.PROFILE_METADATA,
					content: JSON.stringify({
						display_name: 'Alice',
						picture: 'https://example.com/avatar.png'
					})
				}
			]);
			await user.getUserData();
			const state = get(user);
			expect(state.npub).toBe('npub123');
			expect(state.name).toBe('Alice');
			expect(state.picture).toBe('https://example.com/avatar.png');
		});

		it('should use displayName and name as fallbacks for display_name', async () => {
			vi.mocked(getNpub).mockResolvedValue('npub456');
			mockPool.querySync.mockResolvedValue([
				{
					kind: KINDS.PROFILE_METADATA,
					content: JSON.stringify({ displayName: 'Bob', name: 'Bob Alt' })
				}
			]);
			await user.getUserData();
			expect(get(user).name).toBe('Bob');
		});

		it('should skip second fetch when isDataLoaded (call getUserData twice)', async () => {
			vi.mocked(getNpub).mockResolvedValue('npub789');
			mockPool.querySync.mockResolvedValue([
				{
					kind: KINDS.PROFILE_METADATA,
					content: JSON.stringify({ name: 'Once' })
				}
			]);
			await user.getUserData();
			expect(get(user).name).toBe('Once');
			mockPool.querySync.mockClear();
			await user.getUserData();
			// querySync should not be called again (data already loaded)
			expect(mockPool.querySync).not.toHaveBeenCalled();
		});

		it('should fetch again after reset', async () => {
			vi.mocked(getNpub).mockResolvedValue('npubReset');
			// With picture in metadata, no image fetch — so one querySync call per getUserData
			const meta1 = {
				kind: KINDS.PROFILE_METADATA,
				content: JSON.stringify({ name: 'First', picture: 'https://first.png' })
			};
			const meta2 = {
				kind: KINDS.PROFILE_METADATA,
				content: JSON.stringify({ name: 'Second', picture: 'https://second.png' })
			};
			mockPool.querySync.mockResolvedValueOnce([meta1]).mockResolvedValueOnce([meta2]);
			await user.getUserData();
			expect(get(user).name).toBe('First');
			user.reset();
			nostrEventCache.clear();
			await user.getUserData();
			expect(get(user).name).toBe('Second');
		});

		it('should use cached metadata when available', async () => {
			const metaEvent = {
				kind: KINDS.PROFILE_METADATA,
				content: JSON.stringify({
					display_name: 'Cached',
					picture: 'https://example.com/cached.png'
				}),
				id: '',
				pubkey: '',
				created_at: 0,
				sig: '',
				tags: []
			} as import('nostr-tools').NostrEvent;
			cacheEvent(KINDS.PROFILE_METADATA, 'npubCached', metaEvent);
			vi.mocked(getNpub).mockResolvedValue('npubCached');
			await user.getUserData();
			expect(get(user).name).toBe('Cached');
			expect(get(user).picture).toBe('https://example.com/cached.png');
			// Pool should not have been used (metadata from cache, picture in metadata so no image fetch)
			expect(mockPool.querySync).not.toHaveBeenCalled();
		});
	});
});
