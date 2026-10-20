import type { NostrProfile } from '$lib/types/profile';

interface ProfileCacheEntry {
	profile: NostrProfile;
	timestamp: number;
	expiresAt: number;
}

export class ProfileCache {
	private cache = new Map<string, ProfileCacheEntry>();
	private readonly MAX_CACHE_SIZE = 100; // profiles
	private readonly CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

	async getProfile(pubkey: string): Promise<NostrProfile | null> {
		const cached = this.cache.get(pubkey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.profile;
		}
		return null;
	}

	setProfile(pubkey: string, profile: NostrProfile) {
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			// Remove the oldest entry
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(pubkey, {
			profile,
			timestamp: Date.now(),
			expiresAt: Date.now() + this.CACHE_DURATION
		});
	}

	// Backwards-compatible alias expected by existing callers
	async cacheProfile(pubkey: string, profile: NostrProfile): Promise<void> {
		this.setProfile(pubkey, profile);
	}

	invalidate(pubkey: string): void {
		this.cache.delete(pubkey);
	}

	clear() {
		this.cache.clear();
	}

	/**
	 * Get the current size of the cache
	 */
	size(): number {
		return this.cache.size;
	}
}

export const profileCache = new ProfileCache();
