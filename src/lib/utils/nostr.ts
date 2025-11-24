import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { finalizeEvent, getPublicKey, validateEvent } from 'nostr-tools/pure';
import { Preferences } from '@capacitor/preferences';
import { StorageKeys } from './constants/storage';

// Initialize a pool for relay connections
const pool = new SimplePool();

/**
 * Get a signed event using nostr-tools
 * @param metadata - The metadata for the event
 * @returns The signed event
 */
export async function getSignedEvent(metadata: Partial<NostrEvent>): Promise<NostrEvent> {
    const initialEvent = {
        created_at: metadata.created_at || Math.floor(Date.now() / 1000),
        kind: metadata.kind!,
        tags: [...(metadata.tags || []), ['v', __APP_VERSION__]],
        content: metadata.content || ''
    };

    const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });

    // TODO: To be improved by getting auth method from the server
    if (authMethod === 'alby') {
        if (!window || !window.nostr) {
            throw new Error('Nostr extension not available');
        }

        let { value: npub } = await Preferences.get({ key: StorageKeys.NPUB });

        if (!npub) {
            const pubkey = await window.nostr.getPublicKey();
            if (!pubkey) {
                throw new Error('No public key returned from Nostr extension');
            }
            npub = pubkey;
        }

        const signedEvent = await window.nostr.signEvent({
            ...initialEvent,
            pubkey: npub
        });
        return signedEvent;
    } else {
        const keyPair = await getNostrKeyPair();
        if (!keyPair) {
            throw new Error('Authentication cancelled');
        }
        const { npub, nsec } = keyPair;

        if (!npub || !nsec) {
            throw new Error('No pubkey or private key found');
        }

        // Create the event with required properties in correct order
        const event = {
            ...initialEvent,
            pubkey: npub
        };

        // Finalize the event (calculate id and sign)
        const signedEvent = finalizeEvent(event, nsec);

        // Validate the event
        if (!validateEvent(signedEvent)) {
            throw new Error('Invalid event');
        }

        return signedEvent;
    }
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

/**
 * Get the npub from an encoded nsec
 * When the nsec is encoded, it's in bech32 format (nsec1...), so we need to decode it first
 * @param encodedNsec 
 * @returns 
 */
export function getNpubFromEncodedNsec(encodedNsec: string): string {
    const { nip19 } = require('nostr-tools');
    const { getPublicKey } = require('nostr-tools/pure');
    // Decode the nsec
    const { data: privateKeyHex } = nip19.decode(encodedNsec);

    // Convert hex to bytes and then get public key
    const publicKeyHex = getPublicKey(privateKeyHex as Uint8Array);

    // Encode as npub
    const encodedNpub = nip19.npubEncode(publicKeyHex);

    return encodedNpub;
}