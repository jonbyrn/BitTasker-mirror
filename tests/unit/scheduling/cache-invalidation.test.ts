import { describe, it, expect, beforeEach } from 'vitest';
import {
	CacheInvalidationManager,
	cacheInvalidationManager,
	invalidateCacheOnEscrowEvent
} from '$lib/utils/cache-invalidation';
import type { CacheEntry } from '$lib/utils/cache-invalidation';

describe('Cache Invalidation', () => {
	let manager: CacheInvalidationManager;
	const now = Date.now();

	beforeEach(() => {
		manager = new CacheInvalidationManager({
			ttl: 5 * 60 * 1000, // 5 minutes
			version: 1
		});
	});

	describe('isExpired', () => {
		it('should detect expired entries', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now - 10 * 60 * 1000, // 10 minutes ago
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'test-key'
			};

			expect(manager.isExpired(entry)).toBe(true);
		});

		it('should detect valid entries', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now - 2 * 60 * 1000, // 2 minutes ago
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'test-key'
			};

			expect(manager.isExpired(entry)).toBe(false);
		});
	});

	describe('isVersionValid', () => {
		it('should detect valid version', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now,
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'test-key'
			};

			expect(manager.isVersionValid(entry)).toBe(true);
		});

		it('should detect invalid version', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now,
				ttl: 5 * 60 * 1000,
				version: 2, // Different version
				key: 'test-key'
			};

			expect(manager.isVersionValid(entry)).toBe(false);
		});
	});

	describe('isValid', () => {
		it('should validate correct entry', () => {
			const entry = manager.createEntry('test-key', 'test-data');
			expect(manager.isValid(entry)).toBe(true);
		});

		it('should reject null entry', () => {
			expect(manager.isValid(null)).toBe(false);
		});

		it('should reject expired entry', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now - 10 * 60 * 1000,
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'test-key'
			};

			expect(manager.isValid(entry)).toBe(false);
		});

		it('should reject entry with wrong version', () => {
			const entry: CacheEntry<string> = {
				data: 'test',
				timestamp: now,
				ttl: 5 * 60 * 1000,
				version: 2,
				key: 'test-key'
			};

			expect(manager.isValid(entry)).toBe(false);
		});
	});

	describe('createEntry', () => {
		it('should create valid entry', () => {
			const entry = manager.createEntry('test-key', 'test-data');
			
			expect(entry.data).toBe('test-data');
			expect(entry.key).toBe('test-key');
			expect(entry.version).toBe(1);
			expect(entry.timestamp).toBeGreaterThan(0);
		});
	});

	describe('invalidateExpired', () => {
		it('should remove expired entries', () => {
			const entries = new Map<string, CacheEntry<string>>();
			
			entries.set('valid', manager.createEntry('valid', 'data'));
			entries.set('expired', {
				data: 'data',
				timestamp: now - 10 * 60 * 1000,
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'expired'
			});

			const invalidated = manager.invalidateExpired(entries);
			
			expect(invalidated).toBe(1);
			expect(entries.has('valid')).toBe(true);
			expect(entries.has('expired')).toBe(false);
		});
	});

	describe('invalidateOldVersions', () => {
		it('should remove entries with old versions', () => {
			const entries = new Map<string, CacheEntry<string>>();
			
			entries.set('current', manager.createEntry('current', 'data'));
			entries.set('old', {
				data: 'data',
				timestamp: now,
				ttl: 5 * 60 * 1000,
				version: 2, // Old version
				key: 'old'
			});

			const invalidated = manager.invalidateOldVersions(entries);
			
			expect(invalidated).toBe(1);
			expect(entries.has('current')).toBe(true);
			expect(entries.has('old')).toBe(false);
		});
	});

	describe('invalidatePattern', () => {
		it('should invalidate entries matching pattern', () => {
			const entries = new Map<string, CacheEntry<string>>();
			
			entries.set('scheduling-request-1', manager.createEntry('scheduling-request-1', 'data'));
			entries.set('scheduling-request-2', manager.createEntry('scheduling-request-2', 'data'));
			entries.set('other-key', manager.createEntry('other-key', 'data'));

			const invalidated = manager.invalidatePattern(/^scheduling-request-/, entries);
			
			expect(invalidated).toBe(2);
			expect(entries.has('scheduling-request-1')).toBe(false);
			expect(entries.has('scheduling-request-2')).toBe(false);
			expect(entries.has('other-key')).toBe(true);
		});
	});

	describe('getStats', () => {
		it('should calculate cache statistics', () => {
			const entries = new Map<string, CacheEntry<string>>();
			
			entries.set('valid', manager.createEntry('valid', 'data'));
			entries.set('expired', {
				data: 'data',
				timestamp: now - 10 * 60 * 1000,
				ttl: 5 * 60 * 1000,
				version: 1,
				key: 'expired'
			});
			entries.set('old-version', {
				data: 'data',
				timestamp: now,
				ttl: 5 * 60 * 1000,
				version: 2,
				key: 'old-version'
			});

			const stats = manager.getStats(entries);
			
			expect(stats.total).toBe(3);
			expect(stats.expired).toBe(1);
			expect(stats.valid).toBe(1);
			expect(stats.oldVersion).toBe(1);
		});
	});

	describe('invalidateCacheOnEscrowEvent', () => {
		it('should trigger cache invalidation', () => {
			// This function logs and triggers invalidation
			// In a real implementation, it would call the cache store
			expect(() => invalidateCacheOnEscrowEvent('created')).not.toThrow();
			expect(() => invalidateCacheOnEscrowEvent('funded')).not.toThrow();
			expect(() => invalidateCacheOnEscrowEvent('completed')).not.toThrow();
			expect(() => invalidateCacheOnEscrowEvent('cancelled')).not.toThrow();
		});
	});
});

