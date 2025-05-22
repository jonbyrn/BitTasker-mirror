import type { NostrProfile, NostrProfileImage, Skill, SkillCertification, PortfolioItem } from '$lib/types/profile.d';
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
 * @param kinds Event kinds to subscribe to
 * @param relays Relay URLs to subscribe to
 * @returns Cleanup function to unsubscribe
 */
export async function _subscribeToProfileUpdates(callback: (event: NostrEvent) => void, kinds: number[], relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<() => void> {
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
                kinds,
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

        // Check if we already have a subscription for this pubkey
        if (!profileSubscriptions.has(npub)) {
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
                pool.subscribe(relays, filter, {
                    onevent(event: NostrEvent) {
                        callback(event);
                    }
                })
            );

            // Store all subscriptions
            profileSubscriptions.set(npub, {
                sub: {
                    close: () => subs.forEach(sub => sub.close())
                },
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
 * @param identifier 
 * @param relays 
 * @returns 
 */
export async function publishMultipleImages(images: NostrProfileImage[], eventId: string | null, identifier: string, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<string[]> {
    try {
        let event: Partial<NostrEvent>;
        if (eventId) {
            event = {
                kind: 30063, // Replaceable event for profile images
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', identifier] // Identifier for this replaceable event
                ],
                content: JSON.stringify(images)
            };
        } else {
            event = {
                kind: 1063,
                created_at: Math.floor(Date.now() / 1000),
                tags: [
                    ['d', identifier]
                ],
                content: JSON.stringify(images)
            };
        }

        if (!event) {
            throw new Error('Event is undefined');
        }

        const signedEvent = await getSignedEvent(event);
        console.log('signedEvent', signedEvent);
        
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
 */
export async function subscribeToSkillsUpdates(callback: (skills: Skill[]) => void, relays = [PUBLIC_NOSTR_RELAY_URL]): Promise<() => void> {
    try {
        // Subscribe to both skills and certification events
        const filter = {
            kinds: [30000, 1063], // 30000 for skills, 1063 for certifications
            '#t': ['skill', 'certification'],
            limit: 50 // Increased limit to accommodate both types
        };

        let currentSkills: Skill[] = [];
        let certifications: { [key: string]: SkillCertification } = {};

        const sub = pool.subscribe(relays, filter, {
            onevent(event) {
                try {
                    if (event.kind === 30000) {
                        // Handle skills update
                        const skillsData = JSON.parse(event.content);
                        if (Array.isArray(skillsData)) {
                            currentSkills = skillsData;
                            // Merge with existing certifications
                            const mergedSkills = mergeCertificationsWithSkills(currentSkills, certifications);
                            callback(mergedSkills);
                        }
                    } else if (event.kind === 1063 && event.tags.find(t => t[0] === 't' && t[1] === 'certification')) {
                        // Handle certification event
                        const certData = JSON.parse(event.content);
                        const cert: SkillCertification = {
                            eventId: event.id,
                            skillName: event.tags.find(t => t[0] === 'skill')?.[1] || '',
                            name: certData.name,
                            issuer: certData.issuer,
                            date: certData.date,
                            fileUrl: certData.fileUrl,
                            verified: certData.verified
                        };
                        certifications[event.id] = cert;

                        // Merge with current skills
                        const mergedSkills = mergeCertificationsWithSkills(currentSkills, certifications);
                        callback(mergedSkills);
                    }
                } catch (err) {
                    console.error('Failed to process event:', err);
                }
            }
        });

        // TODO: Check usability of this
        // Also fetch initial state
        const events = await pool.querySync(relays, filter);
        if (events.length > 0) {
            // Process events in chronological order
            events.sort((a, b) => a.created_at - b.created_at).forEach(event => {
                try {
                    if (event.kind === 30000) {
                        const skillsData = JSON.parse(event.content);
                        if (Array.isArray(skillsData)) {
                            currentSkills = skillsData;
                        }
                    } else if (event.kind === 1063) {
                        const certData = JSON.parse(event.content);
                        const cert: SkillCertification = {
                            eventId: event.id,
                            skillName: event.tags.find(t => t[0] === 'skill')?.[1] || '',
                            name: certData.name,
                            issuer: certData.issuer,
                            date: certData.date,
                            fileUrl: certData.fileUrl,
                            verified: certData.verified
                        };
                        certifications[event.id] = cert;
                    }
                } catch (err) {
                    console.error('Failed to parse event:', err);
                }
            });

            // Send merged data to callback
            const mergedSkills = mergeCertificationsWithSkills(currentSkills, certifications);
            callback(mergedSkills);
        }

        return () => {
            sub.close();
        };
    } catch (err) {
        console.error('Failed to setup skills subscription:', err);
        return () => { };
    }
}

/**
 * Helper function to merge certifications with skills
 */
function mergeCertificationsWithSkills(
    skills: Skill[],
    certifications: { [key: string]: SkillCertification }
): Skill[] {
    return skills.map(skill => ({
        ...skill,
        certifications: Object.values(certifications)
            .filter(cert => cert.skillName === skill.name)
    }));
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
            tags: [['t', 'skill']],
            content: JSON.stringify(skills)
        };

        const signedSkillsEvent = await getSignedEvent(skillsEvent);

        // Publish event
        await Promise.all(
            relays.map(relay => pool.publish([relay], signedSkillsEvent))
        );
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
        skillName: string,
        name: string,
        issuer: string,
        date: string,
        file: File
    },
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<SkillCertification> {
    try {
        // Upload file
        const uploadResult = await uploadService.uploadSingleFile(certification.file, 'certifications');

        // Create certification file event (kind 1063 for file metadata)
        const certEvent = {
            kind: 1063,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'certifications'],
                ['x', uploadResult.key],
                ['m', certification.file.type],
                ['alt', certification.file.name],
                ['t', 'certification'],
                ['skill', certification.skillName]
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
        pool.publish(relays, signedCertEvent)

        return {
            eventId: signedCertEvent.id,
            name: certification.name,
            issuer: certification.issuer,
            date: certification.date,
            skillName: certification.skillName,
            fileUrl: uploadResult.url,
            verified: false
        };
    } catch (error) {
        console.error('Failed to upload certification:', error);
        throw error;
    }
}

/**
 * Subscribe to portfolio updates
 */
export async function subscribeToPortfolioUpdates(
    callback: (portfolio: PortfolioItem[]) => void,
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<() => void> {
    try {
        const npub = await getNpub();
        if (!npub) {
            console.error('No public key found');
            return () => { };
        }

        // Subscribe to both portfolio and image events
        const filter = {
            authors: [npub],
            kinds: [30001, 1063, 30000], // 30001 for portfolio items, 1063 for images, 30000 for skills
            '#t': ['portfolio', 'skill'],
            limit: 50
        };

        let currentPortfolio: PortfolioItem[] = [];
        let portfolioImages: { [key: string]: NostrProfileImage } = {};

        const sub = pool.subscribe(relays, filter, {
            onevent(event) {
                try {
                    if (event.kind === 30001) {
                        // Handle portfolio item update
                        const itemData = JSON.parse(event.content);
                        const itemId = event.tags.find(t => t[0] === 'd')?.[1];
                        if (itemId) {
                            // Update or add item
                            const index = currentPortfolio.findIndex(item => item.id === itemId);
                            if (index >= 0) {
                                currentPortfolio[index] = itemData;
                            } else {
                                currentPortfolio.push(itemData);
                            }
                            callback(currentPortfolio);
                        }
                    } else if (event.kind === 1063) {
                        // Handle portfolio image
                        const imageUrl = event.tags.find(t => t[0] === 'url')?.[1];
                        const imageAlt = event.tags.find(t => t[0] === 'alt')?.[1] || 'portfolio';
                        const imageType = event.tags.find(t => t[0] === 'm')?.[1] || 'image/jpeg';

                        if (imageUrl) {
                            portfolioImages[event.id] = {
                                url: imageUrl,
                                key: event.id,
                                alt: imageAlt,
                                type: imageType,
                                isPrimary: false
                            };

                            // Update portfolio items that reference this image
                            currentPortfolio = currentPortfolio.map(item => ({
                                ...item,
                                imageEventId: event.id,
                                /* images: item.images.map(img =>
                                    img.key === event.id ? portfolioImages[event.id] : img
                                ) */
                            }));
                            callback(currentPortfolio);
                        }
                    }
                } catch (err) {
                    console.error('Failed to process portfolio event:', err);
                }
            }
        });

        // Fetch initial state
        /* const events = await pool.querySync(relays, filter);
        if (events.length > 0) {
            events.sort((a, b) => a.created_at - b.created_at).forEach(event => {
                try {
                    if (event.kind === 30001) {
                        const itemData = JSON.parse(event.content);
                        const itemId = event.tags.find(t => t[0] === 'd')?.[1];
                        if (itemId) {
                            const index = currentPortfolio.findIndex(item => item.id === itemId);
                            if (index >= 0) {
                                currentPortfolio[index] = itemData;
                            } else {
                                currentPortfolio.push(itemData);
                            }
                        }
                    } else if (event.kind === 1063) {
                        const imageUrl = event.tags.find(t => t[0] === 'url')?.[1];
                        const imageAlt = event.tags.find(t => t[0] === 'alt')?.[1] || 'Portfolio image';
                        const imageType = event.tags.find(t => t[0] === 'm')?.[1] || 'image/jpeg';
                        
                        if (imageUrl) {
                            portfolioImages[event.id] = {
                                url: imageUrl,
                                key: event.id,
                                alt: imageAlt,
                                type: imageType,
                                isPrimary: false
                            };
                        }
                    }
                } catch (err) {
                    console.error('Failed to parse portfolio event:', err);
                }
            });

            // Update portfolio items with image data
            currentPortfolio = currentPortfolio.map(item => ({
                ...item,
                images: item.images.map(img => 
                    portfolioImages[img.key] ? portfolioImages[img.key] : img
                )
            }));
            callback(currentPortfolio);
        } */

        return () => {
            sub.close();
        };
    } catch (err) {
        console.error('Failed to setup portfolio subscription:', err);
        return () => { };
    }
}

/**
 * Publish a portfolio item
 */
export async function publishPortfolioItem(
    items: PortfolioItem,
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // Create portfolio item event
        const itemEvent = {
            kind: 30001,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', `portfolio`],
                // ...item.images.map(img => ['e', img.key, 'image']),
                ...items.skills.map(skill => ['t', skill])
            ],
            content: JSON.stringify(items)
        };
        console.log('itemEvent', itemEvent);

        const signedEvent = await getSignedEvent(itemEvent);
        console.log('signedEvent', signedEvent);
        await Promise.all(pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Failed to publish portfolio item:', error);
        throw error;
    }
}

/**
 * Upload portfolio images and create Nostr events
 */
/* export async function uploadPortfolioImages(
    files: File[],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<NostrProfileImage[]> {
    try {
        // Upload files
        const uploadPromises = files.map(file => uploadService.uploadSingleFile(file, 'portfolio'));
        const uploadedFiles = await Promise.all(uploadPromises);

        // Create NostrProfileImage objects
        const portfolioImages: NostrProfileImage[] = uploadedFiles.map((file, index) => ({
            url: file.url,
            key: file.key,
            alt: 'Portfolio image',
            type: 'image/jpeg',
            isPrimary: index === 0
        }));

        // Publish all images in a single replaceable event
        await publishMultipleImages(portfolioImages, null, 'portfolio-images');

        return portfolioImages;
    } catch (error) {
        console.error('Failed to upload portfolio images:', error);
        throw error;
    }
} */

/**
 * Delete a portfolio item
 */
export async function deletePortfolioItem(
    itemId: string,
    imageKeys: string[],
    relays = [PUBLIC_NOSTR_RELAY_URL]
): Promise<void> {
    try {
        // Create deletion event for portfolio item
        const deleteEvent = {
            kind: 5,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', `portfolio-${itemId}`],
                ['t', 'portfolio'],
                ...imageKeys.map(key => ['e', key])
            ],
            content: 'Delete portfolio item'
        };

        const signedEvent = await getSignedEvent(deleteEvent);
        await Promise.all(pool.publish(relays, signedEvent));
    } catch (error) {
        console.error('Failed to delete portfolio item:', error);
        throw error;
    }
}