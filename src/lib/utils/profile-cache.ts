interface ProfileData {
	name?: string;
	picture?: string;
}

interface ProfileCacheEntry {
	data: ProfileData;
	timestamp: number;
	expiresAt: number;
}

export class ProfileCache {
	private cache = new Map<string, ProfileCacheEntry>();
	private readonly MAX_CACHE_SIZE = 100; // profiles
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

	async getProfile(pubkey: string): Promise<ProfileData | null> {
		// Check if profile is in cache and still valid
		const cached = this.cache.get(pubkey);
		if (cached && this.isCacheValid(cached)) {
			return cached.data;
		}

		// Remove expired entry if it exists
		if (cached) {
			this.cache.delete(pubkey);
		}

		return null;
	}

	async cacheProfile(pubkey: string, profileData: ProfileData): Promise<void> {
		// Enforce cache size limit
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			this.evictOldestEntry();
		}

		const now = Date.now();
		const entry: ProfileCacheEntry = {
			data: profileData,
			timestamp: now,
			expiresAt: now + this.CACHE_DURATION
		};

		this.cache.set(pubkey, entry);
	}

	private isCacheValid(entry: ProfileCacheEntry): boolean {
		return Date.now() < entry.expiresAt;
	}

	private evictOldestEntry(): void {
		let oldestKey: string | null = null;
		let oldestTimestamp = Date.now();

		for (const [key, entry] of this.cache.entries()) {
			if (entry.timestamp < oldestTimestamp) {
				oldestTimestamp = entry.timestamp;
				oldestKey = key;
			}
		}

		if (oldestKey) {
			this.cache.delete(oldestKey);
		}
	}

	clear(): void {
		this.cache.clear();
	}

	size(): number {
		return this.cache.size;
	}
}

// Export singleton instance
export const profileCache = new ProfileCache();
