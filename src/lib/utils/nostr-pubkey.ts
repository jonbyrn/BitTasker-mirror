import { nip19 } from 'nostr-tools';

export function normalizeNostrPubkey(pubkey: string | null | undefined): string | null {
	if (!pubkey) {
		return null;
	}

	try {
		if (pubkey.startsWith('npub')) {
			const decoded = nip19.decode(pubkey);
			if (decoded.type === 'npub' && typeof decoded.data === 'string') {
				return decoded.data.toLowerCase();
			}
		}
	} catch {
		// Fall back to lowercase original input.
	}

	return pubkey.toLowerCase();
}

export function nostrPubkeysMatch(
	left: string | null | undefined,
	right: string | null | undefined
): boolean {
	const normalizedLeft = normalizeNostrPubkey(left);
	const normalizedRight = normalizeNostrPubkey(right);

	return normalizedLeft !== null && normalizedRight !== null && normalizedLeft === normalizedRight;
}

export function getNostrPubkeyQueryValues(pubkey: string | null | undefined): string[] {
	const values: string[] = [];
	const normalized = normalizeNostrPubkey(pubkey);

	if (normalized) {
		values.push(normalized);
	}

	if (pubkey && !values.includes(pubkey)) {
		values.push(pubkey);
	}

	return values;
}
