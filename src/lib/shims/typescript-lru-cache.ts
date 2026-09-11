type CacheOptions = {
	maxSize?: number;
	entryExpirationTimeInMS?: number | null;
};

type CacheEntry<V> = {
	value: V;
	expiresAt: number | null;
};

export class LRUCache<K, V> {
	private readonly entries = new Map<K, CacheEntry<V>>();
	private readonly maxSize: number;
	private readonly entryExpirationTimeInMS: number | null;

	constructor(options: CacheOptions = {}) {
		this.maxSize = options.maxSize ?? 25;
		this.entryExpirationTimeInMS = options.entryExpirationTimeInMS ?? null;
		if (!Number.isFinite(this.maxSize) || this.maxSize <= 0) {
			throw new Error('maxSize must be greater than 0.');
		}
		if (
			this.entryExpirationTimeInMS !== null &&
			(!Number.isFinite(this.entryExpirationTimeInMS) || this.entryExpirationTimeInMS <= 0)
		) {
			throw new Error('entryExpirationTimeInMS must either be null or greater than 0');
		}
	}

	get(key: K): V | null {
		const entry = this.entries.get(key);
		if (!entry) return null;
		if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
			this.entries.delete(key);
			return null;
		}
		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.value;
	}

	has(key: K): boolean {
		return this.get(key) !== null;
	}

	set(key: K, value: V): this {
		this.entries.delete(key);
		this.entries.set(key, {
			value,
			expiresAt:
				this.entryExpirationTimeInMS === null
					? null
					: Date.now() + this.entryExpirationTimeInMS
		});
		while (this.entries.size > this.maxSize) {
			const oldestKey = this.entries.keys().next().value as K | undefined;
			if (oldestKey === undefined) break;
			this.entries.delete(oldestKey);
		}
		return this;
	}
}

export default LRUCache;
