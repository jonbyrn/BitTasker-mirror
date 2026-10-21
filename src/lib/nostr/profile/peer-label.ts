import { nip19 } from 'nostr-tools';
import { resolveDisplayNameFromProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';

/**
 * Kind 0 label for a conversation.
 * Display name first, then username, then a NIP-05 handle.
 */
export function peerLabelFromMetadata(raw: Record<string, unknown> | null | undefined): string {
	if (!raw) return '';
	const display = resolveDisplayNameFromProfileMetadataContent(raw);
	if (display) return display;
	const nip05 = typeof raw.nip05 === 'string' ? raw.nip05.trim() : '';
	if (!nip05 || nip05.startsWith('npub') || /^[0-9a-fA-F]{64}$/.test(nip05)) return '';
	return nip05;
}

/** Short npub used when a person has not published a name. */
export function shortenedPeerNpub(pubkey: string): string {
	const trimmed = pubkey.trim();
	if (!trimmed) return '';
	try {
		const npub = trimmed.startsWith('npub1') ? trimmed : nip19.npubEncode(trimmed);
		if (npub.length <= 18) return npub;
		return `${npub.slice(0, 12)}…${npub.slice(-4)}`;
	} catch {
		return trimmed.length <= 14 ? trimmed : `${trimmed.slice(0, 8)}…${trimmed.slice(-4)}`;
	}
}

/** Name, NIP-05, username, or a shortened npub. */
export function conversationPeerLabel(
	profile: { name?: string | null } | null | undefined,
	pubkey: string
): string {
	const name = profile?.name?.trim() ?? '';
	if (name) return name;
	return shortenedPeerNpub(pubkey);
}
