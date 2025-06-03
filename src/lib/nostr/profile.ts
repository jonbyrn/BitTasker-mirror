import type { NostrProfile, NostrProfileImage, Skill, PortfolioItem, Availability, NostrStandardServices } from '$lib/types/profile.d';
import type { NostrEvent, Filter } from 'nostr-tools';
import { profileStore } from '$lib/stores/profile.store';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getNpub } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import uploadService from '$lib/api/services/upload.service';

// Subscription store for profile updates
let profileSubscriptions = new Map<string, {
    sub: any;
    callbacks: Set<(event: NostrEvent) => void>;
    relays: string[];
}>();

// Helper function to create subscription key
export function createSubscriptionKey(npub: string, kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined }): string {
    if (!kindFilters) {
        return `${npub}:default`;
    }
    const kinds = Object.keys(kindFilters).sort().join(',');
    const tags = Object.entries(kindFilters)
        .map(([kind, tagFilters]) => {
            if (!tagFilters) return '';
            return Object.entries(tagFilters)
                .map(([tag, value]) => `${tag}:${value}`)
                .sort()
                .join(';');
        })
        .filter(Boolean)
        .join('|');
    return `${npub}:${kinds}:${tags}`;
}

/**
 * Subscribe to profile updates for a given public key
 * @param callback Function to call when profile is updated
 * @param kindFilters Map of event kinds to their tag filters (e.g. {30001: {'d': 'portfolio', 't': 'portfolio'}, 1063: {'d': 'portfolio-images'}})
 * @param relays Relay URLs to subscribe to
 * @returns Cleanup function to unsubscribe
 */
export async function subscribeToProfileUpdates(
    callback: (event: NostrEvent) => void,
    kindFilters?: { [kind: number]: { [tag: string]: string } | null | undefined },
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<() => void> {
    let npub: string;

    try {
        // Wait for the public key
        npub = await getNpub();
        if (!npub) {
            console.error('No public key found');
            return () => { };
        }

        // Create a unique subscription key based on npub and filters
        const subscriptionKey = createSubscriptionKey(npub, kindFilters);

        // Check if we already have a subscription for this specific combination
        if (!profileSubscriptions.has(subscriptionKey)) {
            // Create separate filters for each kind
            const filters: Filter[] = [];

            if (kindFilters) {
                Object.entries(kindFilters).forEach(([kindStr, tagFilters]) => {
                    const kind = parseInt(kindStr);
                    const filter: Filter & { [key: `#${string}`]: string[] } = {
                        authors: [npub],
                        kinds: [kind],
                        limit: 10
                    };

                    // Add tag filters if they exist
                    if (tagFilters) {
                        Object.entries(tagFilters).forEach(([tag, value]) => {
                            const tagKey = `#${tag}` as `#${string}`;
                            filter[tagKey] = [value];
                        });
                    }

                    filters.push(filter);
                });
            } else {
                // If no kind filters specified, create a default filter
                filters.push({
                    authors: [npub],
                    limit: 10
                });
            }

            // Create separate subscriptions for each filter
            const subs = filters.map(filter =>
                profileStore.pool.subscribe(relays, filter, {
                    onevent(event: NostrEvent) {
                        const subs = profileSubscriptions.get(subscriptionKey);
                        if (subs) {
                            for (const cb of subs.callbacks) {
                                cb(event);
                            }
                        }
                    }
                })
            );

            // Store all subscriptions
            profileSubscriptions.set(subscriptionKey, {
                sub: {
                    close: () => subs.forEach(sub => sub.close())
                },
                callbacks: new Set([callback]),
                relays
            });
        } else {
            // Add callback to existing subscription
            profileSubscriptions.get(subscriptionKey)?.callbacks.add(callback);
        }

        // Return cleanup function
        return () => {
            const subs = profileSubscriptions.get(subscriptionKey);
            if (subs) {
                subs.callbacks.delete(callback);
                if (subs.callbacks.size === 0) {
                    subs.sub.close();
                    profileSubscriptions.delete(subscriptionKey);
                }
            }
        };
    } catch (err) {
        console.error('Failed to get public key:', err);
        return () => { };
    }
}

/**
 * Publish a profile metadata event to Nostr with improved error handling and retries
 */
export async function publishProfileMetadata(
    metadata: NostrProfile,
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<NostrEvent> {
    // Create metadata event
    const event: Partial<NostrEvent> = {
        kind: 0,
        created_at: Math.floor(Date.now() / 1000),
        content: JSON.stringify(metadata),
        tags: []
    };

    const signedEvent = await getSignedEvent(event);

    try {
        // Publish with timeout and retry logic
        const maxRetries = 3;
        const timeout = 5000; // 5 seconds

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const publishPromises = relays.map(relay =>
                    new Promise<void>((resolve, reject) => {
                        const pub = profileStore.pool.publish([relay], signedEvent);
                        const timeoutId = setTimeout(() => {
                            reject(new Error(`Publish to ${relay} timed out`));
                        }, timeout);

                        Promise.all(pub)
                            .then(() => {
                                clearTimeout(timeoutId);
                                resolve();
                            })
                            .catch(reject);
                    })
                );

                await Promise.all(publishPromises);
                return signedEvent;
            } catch (err) {
                if (attempt === maxRetries) throw err;
                console.warn(`Retry ${attempt} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        throw new Error('Failed to publish after all retries');
    } catch (error) {
        console.error('Error publishing to relays:', error);
        throw error;
    }
}

/**
 * Publish mutliple profile images
 * @param images 
 * @param eventId 
 * @param identifier 
 * @param relays 
 * @returns 
 */
export async function publishMultipleImages(images: NostrProfileImage[], eventId: string | null, identifier: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<string[]> {
    try {
        // Always use kind 30063 for replaceable events
        const event: Partial<NostrEvent> = {
            kind: 30063, // Replaceable event for profile images
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', identifier] // Identifier for this replaceable event
            ],
            content: JSON.stringify(images)
        };

        if (!event) {
            throw new Error('Event is undefined');
        }

        const signedEvent = await getSignedEvent(event);
        const pub = await Promise.all(profileStore.pool.publish(relays, signedEvent));

        return pub;
    } catch (error) {
        console.error('Error publishing multiple images:', error);
        throw error;
    }
}

/**
 * Delete a Nostr event by its ID
 * @param eventId The ID of the event to delete
 * @param relays Optional array of relay URLs
 */
export async function deleteNostrEvent(eventId: string, eventKind?: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<void> {
    try {
        const npub = await getNpub();
        if (!npub) {
            console.error('No public key found');
            return;
        }

        const event: Partial<NostrEvent> = {
            kind: 5, // Event deletion (NIP-09)
            created_at: Math.floor(Date.now() / 1000),
            tags: [['e', eventId], ['k', eventKind || '']], // Reference to the event being deleted
            content: 'Delete previous profile images',
            pubkey: npub
        };

        const signedEvent = await getSignedEvent(event);
        await Promise.all(profileStore.pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Error deleting Nostr event:', error);
        throw error;
    }
}

/**
 * Cleanup function - only use when completely shutting down
 */
export function closeNostrPool(): void {
    if (profileSubscriptions.size === 0) return;

    // Close all subscriptions
    for (const [_, subs] of profileSubscriptions) {
        subs.sub.close();
    }
    profileSubscriptions.clear();

    // Close pool
    profileStore.pool.close([PUBLIC_NOSTR_RELAY_URL]);
}

/**
 * Publish skills update to Nostr
 */
export async function publishSkillsUpdate(
    skills: Skill[],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // Create skills event (kind 30000 is replaceable)
        const skillsEvent = {
            kind: 30000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'skills']],
            content: JSON.stringify(skills)
        };

        const signedSkillsEvent = await getSignedEvent(skillsEvent);

        profileStore.pool.publish(relays, signedSkillsEvent);
    } catch (error) {
        console.error('Failed to publish skills update:', error);
        throw error;
    }
}

/**
 * Upload a certification file and create a Nostr event for it
 */
export async function uploadCertification(
    certification: {
        skillId: string,
        name: string,
        issuer: string,
        date: string,
        file: File
    },
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<string> {
    try {
        // Upload file
        const uploadResult = await uploadService.uploadSingleFile(certification.file, 'certifications');

        // Create certification file event (kind 1063 for file metadata)
        const certEvent = {
            kind: 1063,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'certification'],
                ['x', uploadResult.key],
                ['m', certification.file.type],
                ['alt', certification.file.name],
                ['skill', certification.skillId]
            ],
            content: JSON.stringify({
                name: certification.name,
                issuer: certification.issuer,
                date: certification.date,
                fileUrl: uploadResult.url,
                verified: false
            })
        };

        const signedCertEvent = await getSignedEvent(certEvent);

        // Publish event
        profileStore.pool.publish(relays, signedCertEvent)

        return signedCertEvent.id;
    } catch (error) {
        console.error('Failed to upload certification:', error);
        throw error;
    }
}

/**
 * Publish a portfolio item
 */
export async function publishPortfolioItem(
    item: PortfolioItem,
    tags: string[][],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // Create portfolio item event
        const itemEvent = {
            kind: 30001,
            created_at: Math.floor(Date.now() / 1000),
            tags,
            content: JSON.stringify(item)
        };

        const signedEvent = await getSignedEvent(itemEvent);
        await Promise.all(profileStore.pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Failed to publish portfolio item:', error);
        throw error;
    }
}

/**
 * Delete a portfolio item
 */
export async function deletePortfolioItem(
    id: string,
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // Create deletion event according to NIP-09
        const deleteEvent = {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['e', id], // Event being deleted
                ['k', '30001'] // Kind of event being deleted
            ],
            content: 'Portfolio item deleted' // Optional reason
        };

        const signedEvent = await getSignedEvent(deleteEvent);
        await Promise.all(profileStore.pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Error deleting portfolio item:', error);
        throw error;
    }
}

/**
 * Publishes user availability update to Nostr
 * Uses kind 30002 (parameterized replaceable event) with 'd' tag for 'availability'
 */
export async function publishAvailabilityUpdate(availability: Availability): Promise<void> {
    try {
        const event = {
            kind: 30002, // Changed from 31000 to follow our kind numbering convention
            created_at: Math.floor(Date.now() / 1000),
            tags: [['d', 'availability']],
            content: JSON.stringify(availability)
        };

        const signedEvent = await getSignedEvent(event);
        await Promise.all(profileStore.pool.publish([PUBLIC_NOSTR_RELAY_URL], signedEvent));
    } catch (error) {
        console.error('Failed to publish availability update:', error);
        throw error;
    }
}

/**
 * Publishes standard services data to Nostr
 * @param servicesData The services data to publish
 * @param tags Additional tags to include
 */
export async function publishStandardServices(servicesData: NostrStandardServices, tags: string[][], relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<void> {
    try {
        const event = {
            kind: 30003,
            created_at: Math.floor(Date.now() / 1000),
            content: JSON.stringify(servicesData),
            tags: [...tags]
        };

        const signedEvent = await getSignedEvent(event);
        await Promise.all(profileStore.pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Failed to publish standard services:', error);
        throw error;
    }
}

/**
 * Deletes a standard service event from Nostr
 * @param eventId The ID of the event to delete
 */
export async function deleteStandardService(eventId: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<void> {
    try {
        const event = {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['e', eventId],
                ['k', '30003']
            ],
            content: 'Standard service deleted'
        };

        const signedEvent = await getSignedEvent(event);
        await Promise.all(profileStore.pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Failed to delete standard service:', error);
        throw error;
    }
}

/**
 * Get a Nostr event by its ID
 * @param eventId The ID of the event to fetch
 * @param relays Optional array of relay URLs
 * @returns Promise resolving to the event or null if not found
 */
export async function getEventById(eventId: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<NostrEvent | null> {
    try {
        const filter: Filter = {
            ids: [eventId]
        };

        // Use get method instead of list
        const event = await profileStore.pool.get(relays, filter);
        return event || null;
    } catch (error) {
        console.error('Error fetching event by ID:', error);
        throw error;
    }
}
