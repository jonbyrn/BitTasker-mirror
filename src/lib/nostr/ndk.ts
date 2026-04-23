// lib/ndk.ts
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { createNDK } from '@nostr-dev-kit/svelte';
import {
	NDKPrivateKeySigner,
	registerEventClass,
	NDKRelayAuthPolicies,
	NDKRelaySet
} from '@nostr-dev-kit/ndk';
import NDKCacheDexie from '@nostr-dev-kit/cache-dexie';
import { createDebug } from '$lib/utils/debug';
import { appStore } from '$lib/stores/app.store';
import { NDKBid } from './events/bid';
import { NDKTask } from './events/task';
import { getNostrKeyPair } from '$lib/utils/nostrKeys';
import { NDKPaymentContract } from './events/contract';
import { NDKContractStatus } from './events/contractStatus';

const d = createDebug('ndk:signer');

/**
 * Ensures a relay URL is valid for NDK:
 * 1. Trims whitespace
 * 2. Ensures it starts with ws:// or wss://
 * 3. Handles potentially multiple URLs (comma separated)
 */
function sanitizeRelayUrls(input: string | string[] | undefined): string[] {
	if (!input) return [];

	const rawUrls = Array.isArray(input) ? input : input.split(',');

	return rawUrls
		.map((url) => url.trim())
		.filter((url) => {
			const isValid =
				Boolean(url) &&
				url.length > 0 &&
				url !== 'undefined' &&
				url !== 'null' &&
				url !== '[object Object]';
			if (!isValid && url.length > 0) {
				d.warn('sanitizeRelayUrls: removing invalid relay URL candidate: "%s"', url);
			}
			return isValid;
		})
		.map((url) => {
			let normalized = url;
			if (!url.startsWith('ws://') && !url.startsWith('wss://')) {
				d.warn('sanitizeRelayUrls: URL missing protocol, assuming wss:// for "%s"', url);
				normalized = `wss://${url}`;
			}
			d.log('sanitizeRelayUrls: sanitized URL: "%s"', normalized);
			return normalized;
		});
}

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
	explicitRelayUrls: sanitizeRelayUrls(import.meta.env.VITE_NOSTR_RELAY_URL),
	// Enable sessions for wallet, follows, mutes, and WoT
	session: true,
	enableOutboxModel: false
});
/** NDK 3 typings expect sync `from`; our classes use async `from` (valid at runtime). */
registerEventClass(NDKBid as never);
registerEventClass(NDKTask as never);
registerEventClass(NDKPaymentContract as never);
registerEventClass(NDKContractStatus as never);

// Connect only if we have relays configured
if (ndk.explicitRelayUrls && ndk.explicitRelayUrls.length > 0) {
	try {
		ndk.connect().catch((err) => {
			d.error('ndk.connect failed: %o', err);
		});
	} catch (err) {
		d.error('ndk.connect sync error: %o', err);
	}
} else {
	d.warn('ndk initialization: no explicit relay URLs provided, NDK may not be fully functional');
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
 * Apply `nsec` to the global NDK instance (cache adapter, signer, task relay, retry worker).
 * Idempotent when the same pubkey is already active.
 */
export async function applyNdkSignerFromNsec(nsec: Uint8Array): Promise<void> {
	if (!browser) return;
	if (!nsec?.length) return;

	d.log('applyNdkSignerFromNsec: starting, nsec length=%s', nsec.length);
	try {
		const newSigner = new NDKPrivateKeySigner(nsec);
		const currentSigner = ndk.signer;
		const npub = newSigner.npub;
		const cacheDbName = ndkCacheDbBaseName(npub);

		ndk.cacheAdapter = new NDKCacheDexie({ dbName: cacheDbName });
		d.log('applyNdkSignerFromNsec: cache adapter configured, dbName=%s', cacheDbName);

		if (currentSigner && currentSigner instanceof NDKPrivateKeySigner) {
			const currentPubkey = currentSigner.pubkey;
			const newPubkey = newSigner.pubkey;
			if (currentPubkey === newPubkey) {
				d.log('applyNdkSignerFromNsec: signer already set for same pubkey, skipping');
				startUnpublishedEventsRetry();
				return;
			}
			d.log('applyNdkSignerFromNsec: pubkey changed, updating signer');
		}

		ndk.signer = newSigner;
		d.log('applyNdkSignerFromNsec: signer assigned to ndk instance, npub=%s', newSigner.npub);
		try {
			const taskRelayUrls = sanitizeRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);
			for (const url of taskRelayUrls) {
				ndk.addExplicitRelay(url, NDKRelayAuthPolicies.signIn({ ndk }));
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
 * If `appStore` already has `nsec`/`npub` (e.g. wallet or another flow just unlocked keys),
 * wire them into NDK without calling passkey again.
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

/**
 * Ensure NDK has a signer: loads keys via {@link getNostrKeyPair} (passkey when needed).
 * Successful unlocks also call {@link syncNdkSignerFromAppStore} from inside `nostrKeys`.
 */
export async function setNDKSigner(): Promise<void> {
	if (ndk.$currentPubkey) return;
	await getNostrKeyPair();
}

function startUnpublishedEventsRetry(): void {
	if (!browser) return;
	void import('$lib/runes/unpublishedEventsRetry.svelte').then((m) => {
		m.unpublishedEventsRetry.start();
	});
}

async function stopUnpublishedEventsRetry(): Promise<void> {
	if (!browser) return;
	const m = await import('$lib/runes/unpublishedEventsRetry.svelte');
	m.unpublishedEventsRetry.stop();
}

export function getTaskRelay(): NDKRelaySet {
	const urls = sanitizeRelayUrls(import.meta.env.VITE_NOSTR_TASK_RELAY_URL);

	if (urls.length === 0) {
		d.warn(
			'getTaskRelay: VITE_NOSTR_TASK_RELAY_URL is undefined or empty, falling back to explicit relays'
		);
		return NDKRelaySet.fromRelayUrls(Array.from(ndk.explicitRelayUrls || []), ndk);
	}

	return NDKRelaySet.fromRelayUrls(urls, ndk);
}
