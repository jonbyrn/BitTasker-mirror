/**
 * Cache invalidation utilities for IndexedDB caching
 * Handles TTL expiration, versioning, event-based invalidation, and corruption recovery
 */

export interface CacheEntry<T> {
	data: T;
	timestamp: number;
	ttl: number; // Time to live in milliseconds
	version: number;
	key: string;
}

export interface CacheVersion {
	version: number;
	schema: string;
	timestamp: number;
}

export interface CacheInvalidationOptions {
	ttl?: number; // Default TTL in milliseconds
	version?: number; // Current cache version
	onCorruption?: (key: string, error: Error) => void; // Handler for cache corruption
}

const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
const CURRENT_CACHE_VERSION = 1;

/**
 * Cache invalidation manager
 */
export class CacheInvalidationManager {
	private ttl: number;
	private version: number;
	private onCorruption?: (key: string, error: Error) => void;

	constructor(options: CacheInvalidationOptions = {}) {
		this.ttl = options.ttl || DEFAULT_TTL;
		this.version = options.version || CURRENT_CACHE_VERSION;
		this.onCorruption = options.onCorruption;
	}

	/**
	 * Check if cache entry is expired
	 */
	isExpired<T>(entry: CacheEntry<T>): boolean {
		const now = Date.now();
		return now - entry.timestamp > entry.ttl;
	}

	/**
	 * Check if cache entry version matches current version
	 */
	isVersionValid<T>(entry: CacheEntry<T>): boolean {
		return entry.version === this.version;
	}

	/**
	 * Validate cache entry (not expired, version matches, data exists)
	 */
	isValid<T>(entry: CacheEntry<T> | null | undefined): entry is CacheEntry<T> {
		if (!entry) return false;
		if (!entry.data) return false;
		if (this.isExpired(entry)) return false;
		if (!this.isVersionValid(entry)) return false;
		return true;
	}

	/**
	 * Create cache entry with TTL and version
	 */
	createEntry<T>(key: string, data: T, customTtl?: number): CacheEntry<T> {
		return {
			data,
			timestamp: Date.now(),
			ttl: customTtl || this.ttl,
			version: this.version,
			key
		};
	}

	/**
	 * Handle cache corruption gracefully
	 */
	handleCorruption(key: string, error: Error): void {
		console.warn(`[Cache] Corruption detected for key: ${key}`, error);
		
		if (this.onCorruption) {
			this.onCorruption(key, error);
		}

		// Try to recover by clearing corrupted entry
		try {
			this.clearEntry(key);
		} catch (clearError) {
			console.error(`[Cache] Failed to clear corrupted entry: ${key}`, clearError);
		}
	}

	/**
	 * Clear a specific cache entry (to be implemented by cache store)
	 */
	clearEntry(key: string): void {
		// This should be overridden by the actual cache implementation
		console.warn(`[Cache] clearEntry not implemented for key: ${key}`);
	}

	/**
	 * Invalidate entries matching a pattern
	 */
	invalidatePattern(pattern: RegExp | string, entries: Map<string, CacheEntry<any>>): number {
		let invalidated = 0;
		const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;

		for (const [key, entry] of entries.entries()) {
			if (regex.test(key)) {
				entries.delete(key);
				invalidated++;
			}
		}

		return invalidated;
	}

	/**
	 * Invalidate expired entries
	 */
	invalidateExpired<T>(entries: Map<string, CacheEntry<T>>): number {
		let invalidated = 0;

		for (const [key, entry] of entries.entries()) {
			if (this.isExpired(entry)) {
				entries.delete(key);
				invalidated++;
			}
		}

		return invalidated;
	}

	/**
	 * Invalidate entries with old versions
	 */
	invalidateOldVersions<T>(entries: Map<string, CacheEntry<T>>): number {
		let invalidated = 0;

		for (const [key, entry] of entries.entries()) {
			if (!this.isVersionValid(entry)) {
				entries.delete(key);
				invalidated++;
			}
		}

		return invalidated;
	}

	/**
	 * Invalidate all entries
	 */
	invalidateAll<T>(entries: Map<string, CacheEntry<T>>): number {
		const count = entries.size;
		entries.clear();
		return count;
	}

	/**
	 * Get cache statistics
	 */
	getStats<T>(entries: Map<string, CacheEntry<T>>): {
		total: number;
		expired: number;
		valid: number;
		oldVersion: number;
	} {
		let expired = 0;
		let valid = 0;
		let oldVersion = 0;

		for (const entry of entries.values()) {
			if (this.isExpired(entry)) {
				expired++;
			} else if (!this.isVersionValid(entry)) {
				oldVersion++;
			} else {
				valid++;
			}
		}

		return {
			total: entries.size,
			expired,
			valid,
			oldVersion
		};
	}
}

// Global cache invalidation manager
export const cacheInvalidationManager = new CacheInvalidationManager({
	ttl: DEFAULT_TTL,
	version: CURRENT_CACHE_VERSION,
	onCorruption: (key, error) => {
		console.error(`[Cache] Corruption detected for ${key}:`, error);
	}
});

/**
 * Invalidate cache on escrow events
 */
export function invalidateCacheOnEscrowEvent(eventType: 'created' | 'funded' | 'completed' | 'cancelled'): void {
	// Invalidate scheduling-related cache entries
	const patterns = [
		/^scheduling-request-/,
		/^scheduling-availability-/,
		/^scheduling-queue-/
	];

	console.log(`[Cache] Invalidating cache due to escrow event: ${eventType}`);
	
	// This will be called by the cache store implementation
	// For now, just log the invalidation trigger
}

