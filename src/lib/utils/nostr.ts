import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { finalizeEvent, validateEvent } from 'nostr-tools/pure';

// Initialize a pool for relay connections
const pool = new SimplePool();

/**
 * Get a signed event using nostr-tools
 * @param metadata - The metadata for the event
 * @returns The signed event
 */
export async function getSignedEvent(metadata: Partial<NostrEvent>): Promise<NostrEvent> {
    const { npub, nsec } = await getNostrKeyPair();

    if (!npub || !nsec) {
        throw new Error('No pubkey or private key found');
    }

    // Create the event with required properties in correct order
    const event = {
        pubkey: npub,
        created_at: metadata.created_at || Math.floor(Date.now() / 1000),
        kind: metadata.kind!,
        tags: metadata.tags || [],
        content: metadata.content || ''
    };

    // Finalize the event (calculate id and sign)
    const signedEvent = finalizeEvent(event, nsec);

    // Validate the event
    if (!validateEvent(signedEvent)) {
        throw new Error('Invalid event');
    }

    return signedEvent;
}

/**
 * Publish an event to a relay
 * @param event - The event to publish
 * @param relayUrl - The URL of the relay to publish to
 */
export async function publishEvent(event: Partial<NostrEvent>, relayUrl: string = import.meta.env.VITE_NOSTR_RELAY_URL): Promise<void> {
    try {

        const signedEvent = await getSignedEvent(event);

        // Publish the event using the pool
        const pub = pool.publish([relayUrl], signedEvent);

        // Wait for the publish to complete
        await Promise.race([
            Promise.all(pub),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Publish timeout')), 5000))
        ]);
    } catch (error) {
        console.error('Failed to publish event:', error);
        throw error;
    }
}

/**
 * Subscribe to events from a relay
 * @param relayUrl - The URL of the relay to subscribe to
 * @param filters - The filters for the subscription
 * @param onEvent - The callback to handle the event
 * @returns The unsubscribe function
 */
export function subscribeToEvents(relayUrl: string, filters: Filter[], onEvent: (event: NostrEvent) => void): () => void {
    // Subscribe using the pool
    const sub = pool.subscribe([relayUrl], filters[0], {
        onevent: onEvent
    });

    // Return unsubscribe function
    return () => {
        sub.close();
    };
}