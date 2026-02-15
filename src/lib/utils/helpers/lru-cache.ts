/**
 * Simple LRU (Least Recently Used) Cache implementation
 * Maintains a maximum size and evicts least recently used entries
 */
export class LRUCache<K, V> {
	private cache: Map<K, V>;
	private maxSize: number;

	constructor(maxSize: number = 1000) {
		this.cache = new Map();
		this.maxSize = maxSize;
	}

	/**
	 * Get value from cache, moving it to the end (most recently used)
	 */
	get(key: K): V | undefined {
		if (!this.cache.has(key)) {
			return undefined;
		}

		// Move to end (most recently used)
		const value = this.cache.get(key)!;
		this.cache.delete(key);
		this.cache.set(key, value);

		return value;
	}

	/**
	 * Set value in cache, evicting least recently used if at capacity
	 */
	set(key: K, value: V): void {
		// If key exists, remove it first (will be re-added at end)
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Evict least recently used (first entry)
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}

		// Add to end (most recently used)
		this.cache.set(key, value);
	}

	/**
	 * Check if key exists in cache
	 */
	has(key: K): boolean {
		return this.cache.has(key);
	}

	/**
	 * Clear all entries from cache
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get current cache size
	 */
	get size(): number {
		return this.cache.size;
	}
}
