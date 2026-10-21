import type { Event, Filter } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import { lookupChatProfile } from '$lib/nostr/direct-messages';
import { profileRelays } from '$lib/nostr/profile/profile-keys';
import { resolveDisplayNameFromProfileMetadataContent } from '$lib/nostr/profile/metadata-wire';
import { messageRelayUrls, queryRelaysDetailed } from '$lib/nostr/relaySession';

/** Public directory that indexes kind 0 profiles, including ones published to nos.lol. */
const DIRECTORY_RELAYS = ['wss://relay.nostr.band'];

export interface ChatProfileHit {
	pubkey: string;
	name: string;
	picture?: string;
}

function unique(urls: string[]): string[] {
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

export function profileSearchRelays(): string[] {
	return unique([...messageRelayUrls(), ...profileRelays(), ...DIRECTORY_RELAYS]);
}

/** Hex pubkey for a pasted npub or 64-char hex key. Null for a name. */
export function recipientPubkey(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (/^[a-fA-F0-9]{64}$/.test(trimmed)) return trimmed.toLowerCase();
	if (!trimmed.toLowerCase().startsWith('npub1')) return null;
	try {
		const decoded = nip19.decode(trimmed);
		if (decoded.type !== 'npub' || typeof decoded.data !== 'string') return null;
		return decoded.data.toLowerCase();
	} catch {
		return null;
	}
}

function fold(value: string): string {
	return value
		.toLowerCase()
		.replace(/[_./]+/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Names a kind 0 document can be found by: display name, username, and nip05. */
export function profileSearchLabels(raw: Record<string, unknown>): string[] {
	const labels: string[] = [];
	for (const key of ['display_name', 'name', 'username', 'displayName']) {
		const value = raw[key];
		if (typeof value === 'string' && value.trim()) labels.push(value.trim());
	}
	const nip05 = raw.nip05;
	if (typeof nip05 === 'string' && nip05.trim()) {
		labels.push(nip05.trim());
		const local = nip05.split('@')[0]?.trim();
		if (local) labels.push(local);
	}
	return labels;
}

export function profileMatchesQuery(raw: Record<string, unknown>, query: string): boolean {
	const needle = fold(query);
	if (needle.length < 2) return false;
	return profileSearchLabels(raw).some((label) => fold(label).includes(needle));
}

export function profileHitFromEvent(event: Event, query: string): ChatProfileHit | null {
	if (!/^[a-fA-F0-9]{64}$/.test(event.pubkey)) return null;
	let raw: Record<string, unknown>;
	try {
		const parsed: unknown = JSON.parse(event.content);
		if (!parsed || typeof parsed !== 'object') return null;
		raw = parsed as Record<string, unknown>;
	} catch {
		return null;
	}
	if (!profileMatchesQuery(raw, query)) return null;
	const name =
		resolveDisplayNameFromProfileMetadataContent(raw) ?? profileSearchLabels(raw)[0] ?? '';
	const picture =
		typeof raw.picture === 'string' && raw.picture.trim() ? raw.picture.trim() : undefined;
	return { pubkey: event.pubkey.toLowerCase(), name, picture };
}

export function hitsFromProfileEvents(events: Event[], query: string, limit = 8): ChatProfileHit[] {
	const hits: ChatProfileHit[] = [];
	const seen = new Set<string>();
	const ordered = [...events].sort((left, right) => right.created_at - left.created_at);
	for (const event of ordered) {
		const hit = profileHitFromEvent(event, query);
		if (!hit || seen.has(hit.pubkey)) continue;
		seen.add(hit.pubkey);
		hits.push(hit);
		if (hits.length >= limit) break;
	}
	return hits;
}

/**
 * Find people by username or display name, or accept a pasted npub.
 * A valid npub is a recipient even when no profile is published.
 */
export async function searchChatProfiles(query: string): Promise<ChatProfileHit[]> {
	const trimmed = query.trim();
	const direct = recipientPubkey(trimmed);
	if (direct) {
		let name = '';
		let picture: string | undefined;
		try {
			const profile = await lookupChatProfile(direct);
			name = profile.name ?? '';
			picture = profile.picture;
		} catch {
			name = '';
		}
		return [{ pubkey: direct, name, picture }];
	}
	if (fold(trimmed).length < 2) return [];

	const relays = profileSearchRelays();
	if (relays.length === 0) return [];
	const filter = { kinds: [0], limit: 40, search: trimmed } as Filter;
	try {
		const report = await queryRelaysDetailed(relays, [filter], 4000);
		return hitsFromProfileEvents(report.events, trimmed);
	} catch (error: unknown) {
		console.warn(
			'[messages] profile search failed',
			error instanceof Error ? error.message : error
		);
		return [];
	}
}
