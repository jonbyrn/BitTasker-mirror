import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';
import { listingRelayUrls } from '$lib/nostr/listing-relays';

export type ProfileLookupKey = {
	cacheKey: string;
	hexPubkey: string;
};

function uniqueRelays(urls: string[]): string[] {
	const seen = new Set<string>();
	const list: string[] = [];
	for (const url of urls) {
		const key = url.replace(/\/$/, '');
		if (!key || seen.has(key)) continue;
		seen.add(key);
		list.push(key);
	}
	return list;
}

/** Kind 0 is read from the listing relay and the general relay. */
export function profileRelays(): string[] {
	return uniqueRelays([...(get(appStore)?.relays ?? []), ...listingRelayUrls()]);
}

/**
 * Canonical hex cache key for npub or hex pubkey inputs.
 */
export function normalizeProfileLookupKey(input: string): ProfileLookupKey {
	const trimmedInput = input.trim();
	if (!trimmedInput) {
		return { cacheKey: '', hexPubkey: '' };
	}

	if (/^[0-9a-fA-F]{64}$/.test(trimmedInput)) {
		const normalizedHex = trimmedInput.toLowerCase();
		return {
			cacheKey: normalizedHex,
			hexPubkey: normalizedHex
		};
	}

	if (trimmedInput.startsWith('npub')) {
		try {
			const decoded = nip19.decode(trimmedInput);
			if (decoded.type === 'npub') {
				const normalizedHex = (decoded.data as string).toLowerCase();
				return {
					cacheKey: normalizedHex,
					hexPubkey: normalizedHex
				};
			}
		} catch (error) {
			console.error('Failed to decode npub:', error);
		}
	}

	return { cacheKey: trimmedInput, hexPubkey: trimmedInput };
}
