import { browser } from '$app/environment';
import { NDKPrivateKeySigner, NDKRelaySet } from '@nostr-dev-kit/ndk';
import { bytesToHex } from '@noble/hashes/utils';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { createDebug } from '$lib/utils/debug';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';

export { ndk, ndkCacheDbBaseName } from './ndkInstance';
import { ndk, ndkCacheDbBaseName } from './ndkInstance';

const d = createDebug('ndk:signer');

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

/**
 * Clears NDK identity and removes the per-user Dexie cache (IndexedDB).
 * Intended to run during app logout while `ndk.signer` / `ndk.activeUser` still reflect the session.
 */
export async function ndkLogout(): Promise<void> {
	if (!browser || typeof indexedDB === 'undefined') return;

	await stopUnpublishedEventsRetry();

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
 * Ensure NDK has a signer: loads keys via {@link getNostrKeyPair} (passkey when needed).
 * Successful unlocks also call {@link syncNdkSignerFromAppStore} from inside `nostrKeys`.
 */
export async function setNDKSigner(): Promise<void> {
	if (ndk.$currentPubkey) return;
	await getNostrKeyPair();
}

/** Apply a decrypted Nostr private key to the active NDK instance. */
export async function applyNdkSignerFromNsec(nsec: Uint8Array): Promise<void> {
	const signer = new NDKPrivateKeySigner(bytesToHex(nsec));
	ndk.signer = signer;
	ndk.activeUser = await signer.user();
}

/** Synchronize NDK with keys already decrypted into appStore. */
export async function syncNdkSignerFromAppStore(): Promise<void> {
	const keys = get(appStore).nostrKeys;
	if (!keys.nsec) return;
	await applyNdkSignerFromNsec(keys.nsec);
}

async function stopUnpublishedEventsRetry(): Promise<void> {
	if (!browser) return;
	const m = await import('$lib/runes/unpublishedEventsRetry.svelte');
	m.unpublishedEventsRetry.stop();
}

export function getTaskRelay(): NDKRelaySet {
	const urls = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);

	if (urls.length === 0) {
		d.warn(
			'getTaskRelay: VITE_NOSTR_TASK_RELAY_URL is undefined or empty, falling back to explicit relays'
		);
		return NDKRelaySet.fromRelayUrls(Array.from(ndk.explicitRelayUrls || []), ndk);
	}

	return NDKRelaySet.fromRelayUrls(urls, ndk);
}
