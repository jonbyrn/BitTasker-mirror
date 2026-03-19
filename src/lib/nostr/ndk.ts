// lib/ndk.ts
import { createNDK } from '@nostr-dev-kit/svelte';
import { NDKPrivateKeySigner, registerEventClass } from '@nostr-dev-kit/ndk';
import NDKCacheDexie from '@nostr-dev-kit/cache-dexie';
import { createDebug } from '$lib/utils/debug';
import { NDKBid } from './events/bid';

const d = createDebug('ndk:signer');

export const ndk = createNDK({
	explicitRelayUrls: [import.meta.env.VITE_NOSTR_RELAY_URL],
	cacheAdapter: new NDKCacheDexie({ dbName: 'bittasker-ndk' }),
	// Enable sessions for wallet, follows, mutes, and WoT
	session: true,
	enableOutboxModel: false
});
registerEventClass(NDKBid);
ndk.connect();

/**
 * Set the NDK signer from the decrypted Nostr private key (nsec).
 * Skips update if signer is already set with the same key (compares pubkeys).
 * Enable debug in console with: localStorage.debug = 'btasker:ndk:signer*'
 *
 * @param nsec - The Nostr private key as hex string or nsec1 format
 */
export function setNDKSigner(nsec: string): void {
	d.log('setNDKSigner: starting, nsec length=%s', nsec?.length ?? 0);
	try {
		const newSigner = new NDKPrivateKeySigner(nsec);
		const currentSigner = ndk.signer;

		if (currentSigner && currentSigner instanceof NDKPrivateKeySigner) {
			const currentPubkey = currentSigner.pubkey;
			const newPubkey = newSigner.pubkey;
			if (currentPubkey === newPubkey) {
				d.log('setNDKSigner: signer already set for same pubkey, skipping');
				return;
			}
			d.log('setNDKSigner: pubkey changed, updating signer');
		}

		ndk.signer = newSigner;
		d.log('setNDKSigner: signer assigned to ndk instance, npub=%s', newSigner.npub);
	} catch (err) {
		d.error('setNDKSigner failed: %o', err);
		throw err;
	}
}
