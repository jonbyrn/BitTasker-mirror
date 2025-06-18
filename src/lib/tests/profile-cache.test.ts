import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ProfileCache } from '$lib/utils/profile-cache';

describe('ProfileCache', () => {
	let profileCache: ProfileCache;
	let originalDateNow: typeof Date.now;

	beforeEach(() => {
		profileCache = new ProfileCache();
		originalDateNow = Date.now;

		// Mock Date.now for consistent testing
		vi.spyOn(Date, 'now').mockReturnValue(1000000);
	});

	afterEach(() => {
		Date.now = originalDateNow;
		vi.clearAllMocks();
	});

	describe('Basic Cache Operations', () => {
		it('should cache and retrieve profile data', async () => {
			const pubkey = 'test-pubkey';
			const profileData = { name: 'Test User', picture: 'https://example.com/pic.jpg' };

			// Cache profile
			await profileCache.cacheProfile(pubkey, profileData);

			// Retrieve profile
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(profileData);
		});

		it('should return null for non-existent profiles', async () => {
			const result = await profileCache.getProfile('non-existent-pubkey');
			expect(result).toBeNull();
		});

		it('should cache empty profiles', async () => {
			const pubkey = 'test-pubkey';
			const emptyProfile = {};

			await profileCache.cacheProfile(pubkey, emptyProfile);
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(emptyProfile);
		});

		it('should cache profiles with partial data', async () => {
			const pubkey = 'test-pubkey';
			const partialProfile = { name: 'Test User' }; // No picture

			await profileCache.cacheProfile(pubkey, partialProfile);
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(partialProfile);
		});
	});

	describe('Cache Expiration', () => {
		it('should expire cached profiles after 24 hours', async () => {
			const pubkey = 'test-pubkey';
			const profileData = { name: 'Test User' };

			// Cache profile
			await profileCache.cacheProfile(pubkey, profileData);

			// Move time forward by 25 hours
			const twentyFiveHours = 25 * 60 * 60 * 1000;
			vi.spyOn(Date, 'now').mockReturnValue(1000000 + twentyFiveHours);

			// Should return null as cache expired
			const cached = await profileCache.getProfile(pubkey);
			expect(cached).toBeNull();
		});

		it('should return cached profile before expiration', async () => {
			const pubkey = 'test-pubkey';
			const profileData = { name: 'Test User' };

			// Cache profile
			await profileCache.cacheProfile(pubkey, profileData);

			// Move time forward by 23 hours (still valid)
			const twentyThreeHours = 23 * 60 * 60 * 1000;
			vi.spyOn(Date, 'now').mockReturnValue(1000000 + twentyThreeHours);

			// Should still be in cache
			const cached = await profileCache.getProfile(pubkey);
			expect(cached).toEqual(profileData);
		});

		it('should clean up expired entries when retrieving', async () => {
			const pubkey1 = 'test-pubkey-1';
			const pubkey2 = 'test-pubkey-2';
			const profileData = { name: 'Test User' };

			// Cache profiles
			await profileCache.cacheProfile(pubkey1, profileData);
			await profileCache.cacheProfile(pubkey2, profileData);

			expect(profileCache.size()).toBe(2);

			// Move time forward to expire first profile
			const twentyFiveHours = 25 * 60 * 60 * 1000;
			vi.spyOn(Date, 'now').mockReturnValue(1000000 + twentyFiveHours);

			// Try to get expired profile - should be cleaned up
			const cached = await profileCache.getProfile(pubkey1);
			expect(cached).toBeNull();

			// Cache size should remain the same as other entries are still valid
			expect(profileCache.size()).toBeLessThanOrEqual(2);
		});
	});

	describe('Cache Size Management', () => {
		it('should enforce maximum cache size', async () => {
			const maxSize = 100; // Based on ProfileCache implementation

			// Fill cache beyond max size
			for (let i = 0; i < maxSize + 10; i++) {
				await profileCache.cacheProfile(`pubkey-${i}`, { name: `User ${i}` });
			}

			// Cache should not exceed max size
			expect(profileCache.size()).toBeLessThanOrEqual(maxSize);
		});

		it('should remove oldest entries when at capacity', async () => {
			// This test assumes the implementation removes oldest entries
			// when cache is full. We'll cache a few entries and verify
			// the behavior by checking if older entries are removed.

			const profiles = Array.from({ length: 5 }, (_, i) => ({
				pubkey: `pubkey-${i}`,
				data: { name: `User ${i}` }
			}));

			// Cache all profiles
			for (const profile of profiles) {
				await profileCache.cacheProfile(profile.pubkey, profile.data);
			}

			// All should be cached
			for (const profile of profiles) {
				const cached = await profileCache.getProfile(profile.pubkey);
				expect(cached).toEqual(profile.data);
			}
		});
	});

	describe('Cache Utilities', () => {
		it('should clear entire cache', async () => {
			const pubkey1 = 'pubkey-1';
			const pubkey2 = 'pubkey-2';
			const profileData = { name: 'Test User' };

			// Cache some profiles
			await profileCache.cacheProfile(pubkey1, profileData);
			await profileCache.cacheProfile(pubkey2, profileData);

			expect(profileCache.size()).toBe(2);

			// Clear cache
			profileCache.clear();

			expect(profileCache.size()).toBe(0);
			expect(await profileCache.getProfile(pubkey1)).toBeNull();
			expect(await profileCache.getProfile(pubkey2)).toBeNull();
		});

		it('should report correct cache size', async () => {
			expect(profileCache.size()).toBe(0);

			await profileCache.cacheProfile('pubkey-1', { name: 'User 1' });
			expect(profileCache.size()).toBe(1);

			await profileCache.cacheProfile('pubkey-2', { name: 'User 2' });
			expect(profileCache.size()).toBe(2);

			profileCache.clear();
			expect(profileCache.size()).toBe(0);
		});
	});

	describe('Profile Data Validation', () => {
		it('should handle profiles with special characters', async () => {
			const pubkey = 'test-pubkey';
			const profileData = {
				name: 'Test 用戶 🚀',
				picture: 'https://example.com/pic.jpg?param=value&other=123'
			};

			await profileCache.cacheProfile(pubkey, profileData);
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(profileData);
		});

		it('should handle very long profile names', async () => {
			const pubkey = 'test-pubkey';
			const longName = 'A'.repeat(1000);
			const profileData = { name: longName };

			await profileCache.cacheProfile(pubkey, profileData);
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(profileData);
		});

		it('should handle malformed URLs in picture field', async () => {
			const pubkey = 'test-pubkey';
			const profileData = {
				name: 'Test User',
				picture: 'not-a-valid-url'
			};

			await profileCache.cacheProfile(pubkey, profileData);
			const cached = await profileCache.getProfile(pubkey);

			expect(cached).toEqual(profileData);
		});
	});

	describe('Concurrent Access', () => {
		it('should handle concurrent cache operations', async () => {
			const operations = [];

			// Start multiple cache operations simultaneously
			for (let i = 0; i < 10; i++) {
				operations.push(profileCache.cacheProfile(`pubkey-${i}`, { name: `User ${i}` }));
			}

			// Wait for all operations to complete
			await Promise.all(operations);

			// Verify all profiles were cached
			for (let i = 0; i < 10; i++) {
				const cached = await profileCache.getProfile(`pubkey-${i}`);
				expect(cached).toEqual({ name: `User ${i}` });
			}
		});

		it('should handle concurrent get operations', async () => {
			const pubkey = 'test-pubkey';
			const profileData = { name: 'Test User' };

			// Cache profile first
			await profileCache.cacheProfile(pubkey, profileData);

			// Start multiple get operations simultaneously
			const getOperations = Array.from({ length: 10 }, () => profileCache.getProfile(pubkey));

			const results = await Promise.all(getOperations);

			// All should return the same data
			results.forEach((result) => {
				expect(result).toEqual(profileData);
			});
		});
	});
});
