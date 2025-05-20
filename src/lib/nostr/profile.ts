import type { NostrProfile, NostrProfileImage } from '$lib/types/profile.d';
import type { NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent } from 'nostr-tools/pure';
import { hexToBytes } from '@noble/hashes/utils';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getNpub } from '$lib/utils/nostrKeys';

// Constants
/* const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
]; */

// Create a pool instance for reuse
const pool = new SimplePool();

/**
 * Fetches profile metadata for a given public key
 */
export async function getNostrMetadata(relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<NostrEvent[]> {
    try {
        const npub = await getNpub();

        const filter: Filter = {
            authors: [npub],
            kinds: [0, 1063], // Kind 0 for metadata, 1063 for media metadata (NIP-94)
            limit: 10 // Limit the number of events returned
        };

        const events = await pool.querySync(relays, filter);
        return events;
    } catch (error) {
        console.error('Failed to fetch Nostr profile:', error);
        return [];
    }
}

/**
 * Fetch a user's skills from Nostr
 */
export async function getNostrSkills(pubkey: string): Promise<NostrEvent[]> {
    try {
        const filter: Filter = {
            kinds: [30000],
            authors: [pubkey],
            '#t': ['skill']
        };
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        return events;
    } catch (err) {
        console.error('Failed to fetch Nostr skills:', err);
        return [];
    }
}

/**
 * Fetch a user's portfolio from Nostr
 */
export async function getNostrPortfolio(pubkey: string): Promise<NostrEvent[]> {
    try {
        const filter: Filter = {
            kinds: [30001],
            authors: [pubkey],
            '#t': ['portfolio']
        };
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        return events;
    } catch (err) {
        console.error('Failed to fetch Nostr portfolio:', err);
        return [];
    }
}

/**
 * Fetch a user's profile images from Nostr
 */
export async function getNostrProfileImages(pubkey: string): Promise<NostrEvent[]> {
    try {
        const filter: Filter = {
            kinds: [1063],
            authors: [pubkey],
            '#t': ['profile']
        };
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        return events;
    } catch (err) {
        console.error('Failed to fetch Nostr profile images:', err);
        return [];
    }
}

/**
 * Fetch a user's portfolio images from Nostr
 */
export async function getNostrPortfolioImages(pubkey: string): Promise<NostrEvent[]> {
    try {
        const filter: Filter = {
            kinds: [1063],
            authors: [pubkey],
            '#t': ['portfolio']
        };
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        return events;
    } catch (err) {
        console.error('Failed to fetch Nostr portfolio images:', err);
        return [];
    }
}

/**
 * Fetch a user's certifications from Nostr
 */
export async function getNostrCertifications(pubkey: string): Promise<NostrEvent[]> {
    try {
        const filter: Filter = {
            kinds: [1063],
            authors: [pubkey],
            '#t': ['certification']
        };
        const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
        return events;
    } catch (err) {
        console.error('Failed to fetch Nostr certifications:', err);
        return [];
    }
}

/**
 * Publish a profile metadata event to Nostr
 */
export async function publishProfileMetadata(
    metadata: NostrProfile,
    images: NostrProfileImage[],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<NostrEvent> {
    // Create metadata event
    const event: Partial<NostrEvent> = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(metadata),
        tags: images
            .filter(img => img.url)
            .flatMap(img => [
                ['url', img.url],
                ['m', img.type || 'image/jpeg'],
                ['alt', img.alt || ''],
                ['x', img.key]
            ])
    };

    // Publish to relays
    const pubs = pool.publish(relays, event as NostrEvent);
    await Promise.all(pubs);

    return event as NostrEvent;
}

/**
 * Publish a profile metadata event to Nostr
 */
export async function publishNostrProfile(profile: NostrProfile, privateKeyHex: string): Promise<void> {
    try {
        const privateKey = hexToBytes(privateKeyHex);
        const event = {
            kind: 0,
            created_at: Math.floor(Date.now() / 1000),
            tags: [],
            content: JSON.stringify(profile)
        };

        const signedEvent = finalizeEvent(event, privateKey);
        await pool.publish([PUBLIC_NOSTR_RELAY_URL], signedEvent);
    } catch (error) {
        console.error('Error publishing Nostr profile:', error);
        throw error;
    }
}

/**
 * Publish a profile image event to Nostr
 */
export async function publishNostrProfileImage(image: NostrProfileImage, privateKeyHex: string): Promise<void> {
    const pool = new SimplePool();
    const privateKey = hexToBytes(privateKeyHex);

    try {
        const event = {
            kind: 1063, // NIP-94 image event
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['url', image.url],
                ['m', image.type || 'image/jpeg'],
                ['alt', image.alt || ''],
                ['x', image.key]
            ],
            content: JSON.stringify(image)
        };

        const signedEvent = finalizeEvent(event, privateKey);
        await pool.publish([PUBLIC_NOSTR_RELAY_URL], signedEvent);
    } catch (error) {
        console.error('Error publishing Nostr profile image:', error);
        throw error;
    } finally {
        pool.close([PUBLIC_NOSTR_RELAY_URL]);
    }
}

/**
 * Merge GraphQL and Nostr profile data
 */
export function mergeNostrAndGraphQLData(nostrData: NostrEvent[], graphqlData: any): NostrProfile {
    // Start with GraphQL data as base
    const baseProfile: NostrProfile = {
        name: graphqlData?.name,
        displayName: graphqlData?.displayName,
        about: graphqlData?.about,
        picture: graphqlData?.picture,
        website: graphqlData?.website,
        professionalTitle: graphqlData?.professionalTitle
    };

    // Merge with Nostr data if available
    if (nostrData.length > 0) {
        const metadataEvent = nostrData.find(event => event.kind === 0);
        if (metadataEvent) {
            try {
                const nostrProfile = JSON.parse(metadataEvent.content);
                Object.assign(baseProfile, {
                    ...nostrProfile,
                    // Keep GraphQL data if Nostr data is empty/undefined
                    name: nostrProfile.name || baseProfile.name,
                    displayName: nostrProfile.displayName || baseProfile.displayName,
                    about: nostrProfile.about || baseProfile.about,
                    picture: nostrProfile.picture || baseProfile.picture,
                    website: nostrProfile.website || baseProfile.website,
                    professionalTitle: nostrProfile.professionalTitle || baseProfile.professionalTitle
                });
            } catch (error) {
                console.error('Error parsing Nostr profile data:', error);
            }
        }

        // Handle additional pictures from NIP-94 events
        const imageEvents = nostrData.filter(event => event.kind === 1063);
        if (imageEvents.length > 0) {
            baseProfile.additionalPictures = imageEvents.map(event => {
                const urlTag = event.tags.find(tag => tag[0] === 'url');
                return urlTag ? urlTag[1] : '';
            }).filter(Boolean);
        }
    }

    return baseProfile;
}

// Cleanup function
export function closeNostrPool(): void {
    pool.close([PUBLIC_NOSTR_RELAY_URL]);
} 