import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools/pure';
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { nostrPool } from './nostr-pool';
import { getNostrKeyPair } from './nostrKeys';

/**
 * Get a signed event using nostr-tools
 */
export async function getSignedEvent(metadata: Partial<NostrEvent>): Promise<NostrEvent> {
    const { npub, nsec } = await getNostrKeyPair();

    if (!npub || !nsec) {
        throw new Error('No pubkey or private key found');
    }

    // Create the event
    const event = {
        kind: metadata.kind || 0,
        created_at: Math.floor(Date.now() / 1000),
        content: metadata.content || '',
        tags: metadata.tags || [],
        pubkey: npub
    };

    // Finalize the event (calculate id and sign)
    return finalizeEvent(event, nsec);
}

/**
 * Publish an event to a relay
 */
export async function publishEvent(event: Partial<NostrEvent>, relayUrl: string = PUBLIC_NOSTR_RELAY_URL): Promise<void> {
    try {
        const signedEvent = await getSignedEvent(event);
        await nostrPool.publish(signedEvent, relayUrl);
    } catch (error) {
        console.error('Failed to publish event:', error);
        throw error;
    }
}

/**
 * Subscribe to events from a relay
 */
export function subscribeToEvents(
    relayUrl: string,
    filters: Filter,
    onEvent: (event: NostrEvent) => void,
    onClose?: () => void
): () => void {
    const sub = nostrPool.subscribe(relayUrl, filters, {
        onevent: onEvent,
        onclose: onClose
    });

    return () => sub.close();
}

/**
 * Query events from a relay
 */
export async function queryEvents(relayUrl: string, filter: Filter): Promise<NostrEvent[]> {
    try {
        return await nostrPool.querySync(relayUrl, filter);
    } catch (error) {
        console.error('Failed to query events:', error);
        return [];
    }
}

/**
 * Fetches a user's profile metadata from Nostr
 */
export async function getNostrProfileMetadata(pubkey: string): Promise<NostrEvent | null> {
    try {
        const events = await queryEvents(PUBLIC_NOSTR_RELAY_URL, {
            kinds: [0],
            authors: [pubkey]
        });

        return events[0] || null;
    } catch (err) {
        console.error('Failed to fetch Nostr profile:', err);
        return null;
    }
}

/**
 * Fetches a user's skills from Nostr
 */
export async function getNostrSkills(pubkey: string): Promise<NostrEvent[]> {
    try {
        return await queryEvents(PUBLIC_NOSTR_RELAY_URL, {
            kinds: [30000],
            authors: [pubkey],
            '#t': ['skill']
        });
    } catch (err) {
        console.error('Failed to fetch Nostr skills:', err);
        return [];
    }
}

/**
 * Fetches a user's portfolio items from Nostr
 */
export async function getNostrPortfolio(pubkey: string): Promise<NostrEvent[]> {
    try {
        return await queryEvents(PUBLIC_NOSTR_RELAY_URL, {
            kinds: [30001],
            authors: [pubkey],
            '#t': ['portfolio']
        });
    } catch (err) {
        console.error('Failed to fetch Nostr portfolio:', err);
        return [];
    }
}

/**
 * Subscribe to portfolio updates
 */
export function subscribeToPortfolioUpdates(
    pubkey: string,
    onUpdate: (event: NostrEvent) => void,
    relayUrl: string = PUBLIC_NOSTR_RELAY_URL
): () => void {
    const filter: Filter = {
        kinds: [30001],
        authors: [pubkey],
        '#t': ['portfolio']
    };

    return subscribeToEvents(relayUrl, filter, onUpdate);
}

/**
 * Subscribe to skills updates
 */
export function subscribeToSkillsUpdates(
    pubkey: string,
    onUpdate: (event: NostrEvent) => void,
    relayUrl: string = PUBLIC_NOSTR_RELAY_URL
): () => void {
    const filter: Filter = {
        kinds: [30000],
        authors: [pubkey],
        '#t': ['skill']
    };

    return subscribeToEvents(relayUrl, filter, onUpdate);
}

/**
 * Cleanup function to close all connections
 */
export function cleanupNostrPool() {
    nostrPool.close([PUBLIC_NOSTR_RELAY_URL]);
} 