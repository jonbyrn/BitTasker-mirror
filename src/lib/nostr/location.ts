import type { Location } from '$lib/types/task';
import type { NostrEvent, Filter } from '$lib/types/nostr';
import { bytesToHex } from '@noble/hashes/utils';
import { getSignedEvent } from '$lib/utils/nostr';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { profileStore } from '$lib/stores/profile.store';
import nip44 from '$lib/nostr/nip44';
import KINDS from '$lib/utils/constants/kinds';

const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL];

/**
 * Publish encrypted location data to Nostr
 * @param location Location data to encrypt and publish
 * @param relays Optional array of relay URLs
 * @returns Promise resolving to the published event
 */
export async function publishLocation(location: Location, relays = RELAYS): Promise<NostrEvent> {
    try {
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
        profileStore.pool.publish(relays, signedEvent);

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
    relays = RELAYS
): Promise<() => void> {
    try {
        // Get nostr keypair
        const keyPair = await getNostrKeyPair();
        const nsec = bytesToHex(keyPair.nsec);
        const npub = keyPair.npub;

        // Get conversation key for decryption
        const conversationKey = await nip44.getConversationKey(nsec, npub);

        // Subscribe to location events
        const sub = profileStore.pool.subscribe(
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
    relays = RELAYS
): Promise<Location | null> {
    try {
        const keyPair = await getNostrKeyPair();
        const nsec = bytesToHex(keyPair.nsec);
        const npub = keyPair.npub;

        // Get conversation key for decryption
        const conversationKey = await nip44.getConversationKey(nsec, npub);

        // Get latest location event
        const event = await profileStore.pool.get(
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

        // Decrypt and return location data
        const decryptedContent = await nip44.decrypt(event.content, conversationKey);
        return JSON.parse(decryptedContent) as Location;
    } catch (error) {
        console.error('Failed to get latest location:', error);
        return null;
    }
} 