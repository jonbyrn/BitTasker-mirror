import { nip19 } from 'nostr-tools';
import { get } from 'svelte/store';
import { appStore } from '$lib/stores/app.store';

export type ProfileLookupKey = {
	cacheKey: string;
	hexPubkey: string;
};

export function profileRelays(): string[] {
	return get(appStore)?.relays ?? [];
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
