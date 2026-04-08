// lib/ndk.ts
import { browser } from '$app/environment';
import { createNDK } from '@nostr-dev-kit/svelte';
import {
	NDKPrivateKeySigner,
	registerEventClass,
	NDKRelayAuthPolicies,
	NDKRelaySet
} from '@nostr-dev-kit/ndk';
import NDKCacheDexie from '@nostr-dev-kit/cache-dexie';
import { createDebug } from '$lib/utils/debug';
import { NDKBid } from './events/bid';
import { NDKTask } from './events/task';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NDKPaymentContract } from './events/contract';
import { NDKContractStatus } from './events/contractStatus';

const d = createDebug('ndk:signer');

/** IndexedDB base name for NDKCacheDexie — must match `setNDKSigner` (Dexie also uses `${name}_modules`). */
export function ndkCacheDbBaseName(npub: string): string {
	return `cache-${npub.slice(0, 8)}`;
}

function deleteIndexedDb(dbName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.deleteDatabase(dbName);
		req.onerror = (): void => {
			reject(req.error ?? new Error(`deleteDatabase failed: ${dbName}`));
		};
		req.onsuccess = (): void => resolve();
		req.onblocked = (): void => {
			d.warn('deleteIndexedDb: blocked for %s', dbName);
			resolve();
		};
	});
}

export const ndk = createNDK({
	explicitRelayUrls: [import.meta.env.VITE_NOSTR_RELAY_URL],
	// Enable sessions for wallet, follows, mutes, and WoT
	session: true,
	enableOutboxModel: false
});
/** NDK 3 typings expect sync `from`; our classes use async `from` (valid at runtime). */
registerEventClass(NDKBid as never);
registerEventClass(NDKTask as never);
registerEventClass(NDKPaymentContract as never);
registerEventClass(NDKContractStatus as never);
ndk.connect();

/**
 * Clears NDK identity and removes the per-user Dexie cache (IndexedDB).
 * Intended to run during app logout while `ndk.signer` / `ndk.activeUser` still reflect the session.
 */
export async function ndkLogout(): Promise<void> {
	if (!browser || typeof indexedDB === 'undefined') return;

	let npub: string | undefined;
	try {
		const signer = ndk.signer;
		if (signer instanceof NDKPrivateKeySigner) {
			npub = signer.npub;
		}
	} catch {
		// ignore
	}
	if (!npub) {
		npub = ndk.activeUser?.npub;
	}

	ndk.cacheAdapter = undefined;

	if (npub) {
		const base = ndkCacheDbBaseName(npub);
		try {
			await Promise.all([deleteIndexedDb(base), deleteIndexedDb(`${base}_modules`)]);
			d.log('ndkLogout: removed IndexedDB caches for %s', base);
		} catch (err) {
			d.error('ndkLogout: IndexedDB delete failed %o', err);
		}
	}

	try {
		ndk.$sessions?.logoutAll();
	} catch (err) {
		d.warn('ndkLogout: $sessions.logoutAll failed %o', err);
	}

	ndk.signer = undefined;
	ndk.activeUser = undefined;
}

/**
 * Set the NDK signer from the decrypted Nostr private key (nsec).
 * Skips update if signer is already set with the same key (compares pubkeys).
 * Enable debug in console with: localStorage.debug = 'btasker:ndk:signer*'
 * and set authentication policy for tasks relay
 * @param nsec - The Nostr private key as hex string or nsec1 format
 */
export async function setNDKSigner(): Promise<void> {
	if (!ndk.$currentPubkey) {
		const { nsec } = await getNostrKeyPair();
		d.log('setNDKSigner: starting, nsec length=%s', nsec?.length ?? 0);
		try {
			const newSigner = new NDKPrivateKeySigner(nsec);
			const currentSigner = ndk.signer;
			const npub = newSigner.npub;
			const cacheDbName = ndkCacheDbBaseName(npub);

			ndk.cacheAdapter = new NDKCacheDexie({ dbName: cacheDbName });
			d.log('setNDKSigner: cache adapter configured, dbName=%s', cacheDbName);

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
			try {
				ndk.addExplicitRelay(
					import.meta.env.VITE_NOSTR_TASK_RELAY_URL,
					NDKRelayAuthPolicies.signIn({ ndk })
				);
			} catch (err) {
				d.error('setNDKSigner failed to add relay: %o', err);
				throw err;
			}
		} catch (err) {
			d.error('setNDKSigner failed: %o', err);
			throw err;
		}
	}
}

export function getTaskRelay(): NDKRelaySet {
	return NDKRelaySet.fromRelayUrls([import.meta.env.VITE_NOSTR_TASK_RELAY_URL], ndk);
}
