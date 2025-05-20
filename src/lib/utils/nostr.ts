import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, validateEvent } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils'
import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import { appStore } from '$lib/stores/app.store';
import { get } from 'svelte/store';
import { decryptNsecWithBiometrics } from './helpers/auth';

// Initialize a pool for relay connections
const pool = new SimplePool();

/**
 * Get a signed event using nostr-tools
 * @param metadata - The metadata for the event
 * @returns The signed event
 */
export async function getSignedEvent(metadata: Partial<NostrEvent>): Promise<NostrEvent> {
    const { biometricData } = get(appStore);

    let pubkey: string | null = null;
    let privateKey: Uint8Array | null = null;

    if (!biometricData) {
        const biometricData = await appStore.getBiometricData();
        if (!biometricData) {
            throw new Error('No biometric data found');
        }
        pubkey = biometricData.username;
        const sk = await decryptNsecWithBiometrics(biometricData.password);
        privateKey = hexToBytes(sk);
    } else {
        pubkey = biometricData.username;
        const sk = await decryptNsecWithBiometrics(biometricData.password);
        privateKey = hexToBytes(sk);
    }

    if (!pubkey || !privateKey) {
        throw new Error('No pubkey or private key found');
    }

    // Create the event
    const event = {
        kind: metadata.kind || 0,
        created_at: Math.floor(Date.now() / 1000),
        content: metadata.content || '',
        tags: metadata.tags || [],
        pubkey
    };

    // Finalize the event (calculate id and sign)
    const signedEvent = finalizeEvent(event, privateKey);

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
export async function publishEvent(event: Partial<NostrEvent>, relayUrl: string = PUBLIC_NOSTR_RELAY_URL): Promise<void> {
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
 * Fetch profile metadata
 * @param pubkey - The pubkey of the profile to fetch
 * @param relayUrl - The URL of the relay to fetch the profile from
 * @returns The profile metadata
 */
export function fetchProfileMetadata(pubkey: string, relayUrl: string): Promise<any> {
    return new Promise((resolve, reject) => {
        let timeout: NodeJS.Timeout;

        // Subscribe to profile metadata events
        const sub = pool.subscribe([relayUrl], {
            kinds: [0],
            authors: [pubkey]
        }, {
            onevent: (event: NostrEvent) => {
                try {
                    console.log('event', event);
                    const profile = JSON.parse(event.content);
                    clearTimeout(timeout);
                    sub.close();
                    resolve(profile);
                } catch (error) {
                    console.error('Failed to parse profile metadata:', error);
                    clearTimeout(timeout);
                    sub.close();
                    reject(new Error('Invalid profile metadata format'));
                }
            }
        });

        // Set timeout
        timeout = setTimeout(() => {
            sub.close();
            reject(new Error('Profile fetch timeout'));
        }, 5000);
    });
} 