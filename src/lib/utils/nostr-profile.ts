import type { Filter } from 'nostr-tools';
import { profileCache } from '$lib/utils/profile-cache';
import { formatStandardDateShort } from '$lib/utils/helpers/dateFormatter';
import KINDS from '$lib/utils/constants/kinds';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { DEFAULT_RELAYS } from '$lib/utils/nostr';

/**
 * Get the centralized pool instance from appStore
 * This ensures we use a single pool across the entire application
 */
function getPool() {
    const pool = get(appStore)?.pool;
    if (!pool) {
        throw new Error('Pool not found');
    }
    return pool;
}

export type ContractProfile = {
    name?: string;
    picture?: string;
    createdAt?: string;
    reviews?: Array<{ id: string; from: string; rating: number; text: string; date: string }>;
    averageRating?: number;
    tasksCompleted?: number;
};

/**
 * Lightweight profile fetching for contract panels
 * Only fetches name, picture, and reviews (for rating calculation)
 * Much faster than fetchComprehensiveProfile
 * TODO: Add array of kinds and filter presets to make the function more dynamic
 */
export async function fetchContractProfile(pubkey: string): Promise<ContractProfile> {
    try {
        // First check cache
        const cachedProfile = await profileCache.getProfile(pubkey);
        if (
            cachedProfile &&
            'reviews' in cachedProfile &&
            'averageRating' in cachedProfile &&
            Array.isArray(cachedProfile.reviews)
        ) {
            // Cache has full contract profile data - safe to return
            return cachedProfile as ContractProfile;
        }

        // Fetch only what we need: metadata and reviews
        const pool = getPool();
        const filter: Filter = {
            kinds: [KINDS.PROFILE_METADATA, KINDS.PROFILE_IMAGES, KINDS.PROFILE_REVIEWS],
            authors: [pubkey],
            limit: 15
        };

        const events = await pool.querySync(DEFAULT_RELAYS, filter);

        let name: string | undefined = undefined;
        let picture: string | undefined = undefined;
        let createdAt: string | undefined = undefined;
        let reviews: Array<{ id: string; from: string; rating: number; text: string; date: string }> = [];

        // Sort events by created_at (newest first)
        const sortedEvents = events.sort((a, b) => b.created_at - a.created_at);

        for (const event of sortedEvents) {
            try {
                if (event.kind === KINDS.PROFILE_METADATA && event.content) {
                    const content = JSON.parse(event.content);
                    name = content?.display_name || content?.displayName || content?.name;
                    picture = picture || content.picture || content.avatar || content.image;
                    createdAt = formatStandardDateShort(new Date(event.created_at * 1000));
                } else if (event.kind === KINDS.PROFILE_IMAGES && !picture) {
                    const dTag = event.tags.find((t) => t[0] === 'd');
                    if (dTag && dTag[1] === 'profile-images') {
                        const images = JSON.parse(event.content);
                        if (Array.isArray(images) && images.length > 0) {
                            picture = images[0].url;
                        }
                    }
                } else if (event.kind === KINDS.PROFILE_REVIEWS) {
                    const content = JSON.parse(event.content);
                    if (Array.isArray(content)) {
                        reviews = content.map((review: any) => ({
                            id: review.id,
                            from: review.from,
                            rating: review.rating,
                            text: review.text,
                            date: review.date
                        }));
                    }
                }
            } catch (e) {
                console.error('Failed to parse event:', e);
            }
        }

        // Calculate rating
        const averageRating = reviews.length > 0
            ? reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
            : 0;

        const profile = {
            name,
            picture,
            createdAt,
            reviews,
            averageRating,
            tasksCompleted: reviews.length
        };

        // Cache the result
        await profileCache.cacheProfile(pubkey, profile);

        return profile;
    } catch (error) {
        console.error('💥 Failed to fetch contract profile for', pubkey, ':', error);
        await profileCache.cacheProfile(pubkey, {});
        return {};
    }
}