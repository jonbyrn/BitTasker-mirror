import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { NDKPrivateKeySigner } from '@nostr-dev-kit/ndk';
import NDKCacheDexie from '@nostr-dev-kit/cache-dexie';
import { createDebug } from '$lib/utils/debug';
import { appStore } from '$lib/stores/app.store';
import { resolveTaskRelayUrls } from '$lib/utils/relayUrls';
import { ndk, ndkCacheDbBaseName } from './ndkInstance';

const d = createDebug('ndk:signer');

let activeSignerPubkey: string | null = null;

function startUnpublishedEventsRetry(): void {
	if (!browser) return;
	void import('$lib/runes/unpublishedEventsRetry.svelte').then((m) => {
		m.unpublishedEventsRetry.start();
	});
}

/**
 * Apply `nsec` to the global NDK instance (cache adapter, signer, task relay, retry worker).
 * Idempotent when the same pubkey is already active.
 */
export async function applyNdkSignerFromNsec(nsec: Uint8Array): Promise<void> {
	if (!browser) return;
	if (!nsec?.length) return;

	d.log('applyNdkSignerFromNsec: starting, nsec length=%s', nsec.length);
	try {
		const newSigner = new NDKPrivateKeySigner(nsec);
		const newPubkey = newSigner.pubkey;

		if (activeSignerPubkey === newPubkey && ndk.signer) {
			d.log('applyNdkSignerFromNsec: signer already set for same pubkey, skipping');
			startUnpublishedEventsRetry();
			return;
		}

		const npub = newSigner.npub;
		const cacheDbName = ndkCacheDbBaseName(npub);

		ndk.cacheAdapter = new NDKCacheDexie({ dbName: cacheDbName });
		d.log('applyNdkSignerFromNsec: cache adapter configured, dbName=%s', cacheDbName);

		const currentSigner = ndk.signer;
		if (currentSigner && currentSigner instanceof NDKPrivateKeySigner) {
			const currentPubkey = currentSigner.pubkey;
			if (currentPubkey === newPubkey) {
				d.log('applyNdkSignerFromNsec: signer already set for same pubkey, skipping');
				activeSignerPubkey = newPubkey;
				startUnpublishedEventsRetry();
				return;
			}
			d.log('applyNdkSignerFromNsec: pubkey changed, updating signer');
		}

		ndk.signer = newSigner;
		activeSignerPubkey = newPubkey;
		d.log('applyNdkSignerFromNsec: signer assigned to ndk instance, npub=%s', newSigner.npub);
		try {
			const taskRelayUrls = resolveTaskRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);
			for (const url of taskRelayUrls) {
				ndk.addExplicitRelay(url);
			}
		} catch (err) {
			d.error('applyNdkSignerFromNsec failed to add relay: %o', err);
			throw err;
		}
		startUnpublishedEventsRetry();
	} catch (err) {
		d.error('applyNdkSignerFromNsec failed: %o', err);
		throw err;
	}
}

/**
 * If `appStore` already has `nsec`/`npub`, wire them into NDK without calling passkey again.
 */
export async function syncNdkSignerFromAppStore(): Promise<void> {
	if (!browser) return;
	if (ndk.$currentPubkey) return;

	const s = get(appStore);
	const nsec = s.nostrKeys.nsec;
	const npub = s.nostrKeys.npub;
	if (!nsec || !npub) return;

	await applyNdkSignerFromNsec(nsec);
}
