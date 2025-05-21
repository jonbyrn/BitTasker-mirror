import type { NostrProfile, NostrProfileImage, Skill } from '$lib/types/profile.d';
import type { NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { getNpub } from '$lib/utils/nostrKeys';
import { getSignedEvent } from '$lib/utils/nostr';
import uploadService from '$lib/api/services/upload.service';

// Constants
/* const DEFAULT_RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.nostr.band',
    'wss://nos.lol'
]; */

// Create a pool instance for reuse
const pool = new SimplePool();

// Subscription store for profile updates
let profileSubscriptions = new Map<string, {
    sub: any;
    callbacks: Set<(event: NostrEvent) => void>;
}>();

/**
 * Subscribe to profile updates for a given public key
 * @param callback Function to call when profile is updated
 * @param relays Relay URLs to subscribe to
 * @returns Cleanup function to unsubscribe
 */
export async function subscribeToProfileUpdates(callback: (event: NostrEvent) => void, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<() => void> {
    let npub: string;

    try {
        // Wait for the public key
        npub = await getNpub();
        if (!npub) {
            console.error('No public key found');
            return () => { };
        }

        // Check if we already have a subscription for this pubkey
        if (!profileSubscriptions.has(npub)) {
            const filter: Filter = {
                authors: [npub],
                kinds: [0, 1063], // Kind 0 for metadata, 1063 for media metadata
                limit: 10
            };

            const sub = pool.subscribe(relays, filter, {
                onevent(event: NostrEvent) {
                    const subs = profileSubscriptions.get(npub);
                    if (subs) {
                        for (const cb of subs.callbacks) {
                            cb(event);
                        }
                    }
                }
            });

            profileSubscriptions.set(npub, {
                sub,
                callbacks: new Set([callback])
            });
        } else {
            // Add callback to existing subscription
            profileSubscriptions.get(npub)?.callbacks.add(callback);
        }

        // Return cleanup function
        return () => {
            const subs = profileSubscriptions.get(npub);
            if (subs) {
                subs.callbacks.delete(callback);
                if (subs.callbacks.size === 0) {
                    subs.sub.close();
                    profileSubscriptions.delete(npub);
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
    images: NostrProfileImage[],
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
                        const pub = pool.publish([relay], signedEvent);
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
 * @param relays 
 * @returns 
 */
export async function publishMultipleImages(images: NostrProfileImage[], eventId: string | null, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<string[]> {
    try {
        let event: Partial<NostrEvent>;
        if (eventId) {
            event = {
                kind: 30063, // Replaceable event for profile images
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', 'profile-images'] // Identifier for this replaceable event
                ],
                content: JSON.stringify(images)
            };
        } else {
            event = {
                kind: 1063,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', 'profile-images']
                ],
                content: JSON.stringify(images)
            };
        }

        if (!event) {
            throw new Error('Event is undefined');
        }

        const signedEvent = await getSignedEvent(event);
        const pub = await Promise.all(pool.publish(relays, signedEvent));

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
        console.log({ signedEvent });
        await Promise.all(pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Error deleting Nostr event:', error);
        throw error;
    }
}

/**
 * Cleanup function
 */
export function closeNostrPool(): void {
    // Close all subscriptions
    for (const [_, subs] of profileSubscriptions) {
        subs.sub.close();
    }
    profileSubscriptions.clear();

    // Close pool
    pool.close([PUBLIC_NOSTR_RELAY_URL]);
}

/**
 * Subscribe to skills updates
 * @param callback Callback function to handle skills updates
 * @param relays Array of relay URLs
 * @returns Cleanup function
 */
export async function subscribeToSkillsUpdates(callback: (skills: Skill[]) => void, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<() => void> {
    try {
        // Subscribe to skills events
        const filter = {
            kinds: [30000], // Replaceable event for skills
            '#t': ['skill'],
            limit: 10
        };

        const sub = pool.subscribe(relays, filter, {
            onevent(event) {
                try {
                    if (event.kind === 30000) {
                        const skillsData = JSON.parse(event.content);
                        if (Array.isArray(skillsData)) {
                            callback(skillsData);
                        }
                    }
                } catch (err) {
                    console.error('Failed to process skills update:', err);
                }
            }
        });

        // Also fetch initial state
        // const events = await pool.querySync(relays, filter);
        // if (events.length > 0) {
        //     const latestEvent = events.sort((a, b) => b.created_at - a.created_at)[0];
        //     try {
        //         const skillsData = JSON.parse(latestEvent.content);
        //         if (Array.isArray(skillsData)) {
        //             callback(skillsData);
        //         }
        //     } catch (err) {
        //         console.error('Failed to parse initial skills:', err);
        //     }
        // }

        return () => {
            sub.close();
        };
    } catch (err) {
        console.error('Failed to setup skills subscription:', err);
        return () => { };
    }
}

/**
 * Publish skills update to Nostr
 */
export async function publishSkillsUpdate(
    skills: Skill[],
    certificationFiles: { file: File; skillName: string }[] = [],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // 1. Upload certification files if any
        const certificationUploads = await Promise.all(
            certificationFiles.map(async ({ file, skillName }) => {
                const uploadResult = await uploadService.uploadSingleFile(file, 'certifications');

                // Create certification file event
                const certEvent = {
                    kind: 1063,
                    created_at: Math.floor(Date.now() / 1000),
                    tags: [
                        ['url', uploadResult.url],
                        ['x', uploadResult.key],
                        ['m', file.type],
                        ['alt', 'Certification document'],
                        ['t', 'certification'],
                        ['skill', skillName]
                    ],
                    content: JSON.stringify({
                        skillName,
                        fileName: file.name
                    })
                };

                const signedCertEvent = await getSignedEvent(certEvent);
                return { event: signedCertEvent, url: uploadResult.url };
            })
        );

        // 2. Create skills event
        const skillsEvent = {
            kind: 30000,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'skills'], // Identifier for replaceable event
                ['t', 'skill']
            ],
            content: JSON.stringify(skills)
        };

        const signedSkillsEvent = await getSignedEvent(skillsEvent);

        // 3. Publish all events
        const allEvents = [
            signedSkillsEvent,
            ...certificationUploads.map(upload => upload.event)
        ];

        await Promise.all(
            allEvents.flatMap(event =>
                pool.publish(relays, event)
            )
        );
    } catch (error) {
        console.error('Failed to publish skills update:', error);
        throw error;
    }
}