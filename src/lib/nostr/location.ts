import type { Location } from '$lib/types/task';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { bytesToHex } from '@noble/hashes/utils';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNostrKeyPair, getNpub } from '$lib/utils/nostrKeys';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';

/**
 * Publish encrypted location data to Nostr
 * @param location Location data to encrypt and publish
 * @param relays Optional array of relay URLs
 * @returns Promise resolving to the published event
 */
export async function publishLocation(location: Location, relays = get(appStore).relays): Promise<NostrEvent> {
    try {
        const pool = get(appStore).pool;

        // Get own public key
        const keyPair = await getNostrKeyPair();
        const nsec = bytesToHex(keyPair.nsec);
        const npub = keyPair.npub;

        // Create conversation key with self (for self-encryption)
        const conversationKey = await nip44.getConversationKey(nsec, npub);

        // Generate random nonce
        const nonce = crypto.getRandomValues(new Uint8Array(32));

        // Encrypt location data
        const encryptedContent = await nip44.encrypt(JSON.stringify(location), conversationKey, nonce);

        // Create event
        const event = {
            kind: KINDS.PROFILE_LOCATION,
            created_at: Math.floor(Date.now() / 1000),
            tags: [
                ['d', 'location'], // Identifier for this replaceable event
                ['client', 'bittasker'], // Client identifier
                ['type', 'encrypted'] // Indicate this is an encrypted event
            ],
            content: encryptedContent
        };

        // Sign and publish event
        const signedEvent = await getSignedEvent(event);
        pool.publish(relays, signedEvent);

        return signedEvent;
    } catch (error) {
        console.error('Failed to publish location:', error);
        throw error;
    }
}

/**
 * Subscribe to location updates
 * @param callback Function to call when location is updated
 * @param relays Optional array of relay URLs
 * @returns Cleanup function
 */
export async function subscribeToLocation(
    callback: (location: Location) => void,
    relays = get(appStore).relays
): Promise<() => void> {
    try {
        const pool = get(appStore).pool;

        // Get nostr keypair
        const keyPair = await getNostrKeyPair();
        const nsec = bytesToHex(keyPair.nsec);
        const npub = keyPair.npub;

        // Get conversation key for decryption
        const conversationKey = await nip44.getConversationKey(nsec, npub);

        // Subscribe to location events
        const sub = pool.subscribe(
            relays,
            {
                authors: [npub],
                kinds: [KINDS.PROFILE_LOCATION],
                '#d': ['location']
            } as Filter,
            {
                onevent: async (event: NostrEvent) => {
                    try {
                        // Decrypt location data
                        const decryptedContent = await nip44.decrypt(event.content, conversationKey);
                        const location = JSON.parse(decryptedContent) as Location;
                        callback(location);
                    } catch (err) {
                        console.error('Failed to decrypt location:', err);
                    }
                }
            }
        );

        // Return cleanup function
        return () => {
            sub.close();
        };
    } catch (error) {
        console.error('Failed to subscribe to location:', error);
        return () => { };
    }
}

/**
 * Get the latest location data
 * @param relays Optional array of relay URLs
 * @returns Promise resolving to the location data or null if not found
 */
export async function getLatestLocation(
    relays = get(appStore).relays
): Promise<Location | null> {
    try {
        const pool = get(appStore).pool;

        // Get authentication method to determine decryption approach
        const { Preferences } = await import('@capacitor/preferences');
        const { StorageKeys } = await import('$lib/utils/constants/storage');
        const { value: authMethod } = await Preferences.get({ key: StorageKeys.AUTH_METHOD });

        let npub: string;
        let decryptedContent: string;

        if (authMethod === 'alby') {
            npub = await getNpub();

            // Get latest location event
            const event = await pool.get(
                relays,
                {
                    authors: [npub],
                    kinds: [KINDS.PROFILE_LOCATION],
                    '#d': ['location'],
                    limit: 1
                } as Filter
            );

            if (!event) return null;

            // Use Alby's NIP-44 decryption if available
            if (window.nostr?.nip44?.decrypt) {
                decryptedContent = await window.nostr.nip44.decrypt(npub, event.content);
                console.log('decryptedContent', decryptedContent);
            } else {
                throw new Error('NIP-44 decryption not supported by Nostr extension');
            }
        } else {
            // For passkeys, use the existing logic with getNostrKeyPair
            const keyPair = await getNostrKeyPair();
            const nsec = bytesToHex(keyPair.nsec);
            npub = keyPair.npub;

            // Get conversation key for decryption
            const conversationKey = await nip44.getConversationKey(nsec, npub);

            // Get latest location event
            const event = await pool.get(
                relays,
                {
                    authors: [npub],
                    kinds: [KINDS.PROFILE_LOCATION],
                    '#d': ['location'],
                    limit: 1
                } as Filter
            );

            if (!event) {
                return null;
            }

            // Decrypt using the custom NIP-44 implementation
            decryptedContent = await nip44.decrypt(event.content, conversationKey);
        }

        return JSON.parse(decryptedContent) as Location;
    } catch (error) {
        console.error('Failed to get latest location:', error);
        return null;
    }
} 