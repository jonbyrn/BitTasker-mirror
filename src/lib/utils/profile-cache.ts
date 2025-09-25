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

	async getProfile(pubkey: string): Promise<{ name?: string; picture?: string } | null> {
		const cached = this.cache.get(pubkey);
		if (cached && cached.expiresAt > Date.now()) {
			return cached.profile;
		}
		return null;
	}

	setProfile(pubkey: string, profile: { name?: string; picture?: string }) {
		if (this.cache.size >= this.MAX_CACHE_SIZE) {
			// Remove the oldest entry
			const oldestKey = this.cache.keys().next().value;
			this.cache.delete(oldestKey);
		}

		this.cache.set(pubkey, {
			profile,
			timestamp: Date.now(),
			expiresAt: Date.now() + this.CACHE_DURATION
		});
	}

	// Backwards-compatible alias expected by existing callers
	async cacheProfile(pubkey: string, profile: { name?: string; picture?: string }): Promise<void> {
		this.setProfile(pubkey, profile);
	}

	clear() {
		this.cache.clear();
	}
}

export const profileCache = new ProfileCache();
