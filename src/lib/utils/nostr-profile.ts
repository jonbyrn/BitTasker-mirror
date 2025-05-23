import type { NostrEvent } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';

// Initialize Nostr pool
const pool = new SimplePool();

/**
 * Fetches a user's profile metadata from Nostr
 * @param pubkey User's public key
 * @returns The profile metadata event or null if not found
 */
export async function getNostrProfileMetadata(pubkey: string): Promise<NostrEvent | null> {
	try {
		const events = await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [0],
			authors: [pubkey]
		}]);

		return events[0] || null;
	} catch (err) {
		console.error('Failed to fetch Nostr profile:', err);
		return null;
	}
}

/**
 * Fetches a user's skills from Nostr
 * @param pubkey User's public key
 * @returns Array of skill events
 */
/* export async function getNostrSkills(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [30000],
			authors: [pubkey],
			'#t': ['skill']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr skills:', err);
		return [];
	}
} */

/**
 * Fetches a user's portfolio items from Nostr
 * @param pubkey User's public key
 * @returns Array of portfolio events
 */
export async function getNostrPortfolio(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [30001],
			authors: [pubkey],
			'#t': ['portfolio']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr portfolio:', err);
		return [];
	}
}

/**
 * Fetches a user's profile images from Nostr
 * @param pubkey User's public key
 * @returns Array of image events
 */
export async function getNostrProfileImages(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['profile']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr profile images:', err);
		return [];
	}
}

/**
 * Fetches a user's portfolio images from Nostr
 * @param pubkey User's public key
 * @returns Array of image events
 */
export async function getNostrPortfolioImages(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['portfolio']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr portfolio images:', err);
		return [];
	}
}

/**
 * Fetches a user's certifications from Nostr
 * @param pubkey User's public key
 * @returns Array of certification events
 */
export async function getNostrCertifications(pubkey: string): Promise<NostrEvent[]> {
	try {
		return await pool.list([PUBLIC_NOSTR_RELAY_URL], [{
			kinds: [1063],
			authors: [pubkey],
			'#t': ['certification']
		}]);
	} catch (err) {
		console.error('Failed to fetch Nostr certifications:', err);
		return [];
	}
}

/**
 * Fetches all profile-related events for a user from Nostr
 * @param pubkey User's public key
 * @returns Object containing all profile-related events
 */
export async function getNostrProfileData(pubkey: string) {
	try {
		const [metadata, skills, portfolio, profileImages, portfolioImages, certifications] = await Promise.all([
			getNostrProfileMetadata(pubkey),
			getNostrSkills(pubkey),
			getNostrPortfolio(pubkey),
			getNostrProfileImages(pubkey),
			getNostrPortfolioImages(pubkey),
			getNostrCertifications(pubkey)
		]);

		return {
			metadata,
			skills,
			portfolio,
			profileImages,
			portfolioImages,
			certifications
		};
	} catch (err) {
		console.error('Failed to fetch Nostr profile data:', err);
		return {
			metadata: null,
			skills: [],
			portfolio: [],
			profileImages: [],
			portfolioImages: [],
			certifications: []
		};
	}
}

// Cleanup function to close pool
export function cleanupNostrPool() {
	pool.close([PUBLIC_NOSTR_RELAY_URL]);
}


/** ******************************************************************************************************************* */
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
                ['alt', image.alt || '']
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
        about: graphqlData?.about,
        pictures: graphqlData?.pictures,
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
                    about: nostrProfile.about || baseProfile.about,
                    pictures: nostrProfile.pictures || baseProfile.pictures,
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
            baseProfile.pictures = imageEvents.map(event => {
                const urlTag = event.tags.find(tag => tag[0] === 'url');
                return urlTag ? {
                    url: urlTag[1],
                    type: event.tags.find(tag => tag[0] === 'm')?.[1] || 'image/jpeg',
                    alt: event.tags.find(tag => tag[0] === 'alt')?.[1] || '',
                    key: event.tags.find(tag => tag[0] === 'x')?.[1] || ''
                } : null;
            }).filter(Boolean) as NostrProfileImage[];
        }
    }

    return baseProfile;
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