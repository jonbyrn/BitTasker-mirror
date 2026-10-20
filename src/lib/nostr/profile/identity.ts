import type { NostrProfile } from '$lib/types/profile.d';
import {
	resolveDisplayNameFromProfileMetadataContent,
	sanitizeProfileDisplayName
} from '$lib/nostr/profile/metadata-wire';

/**
 * Visible name for a person.
 * Kind-0 display_name, then the legacy name field, then the account username.
 */
export function identityLabel(input: {
	displayName?: string | null;
	name?: string | null;
	username?: string | null;
}): string {
	const display =
		sanitizeProfileDisplayName(input.displayName) ?? sanitizeProfileDisplayName(input.name);
	if (display) return display;

	const username = input.username?.trim() ?? '';
	if (!username) return '';
	if (username.startsWith('npub') || /^[0-9a-fA-F]{64}$/.test(username)) return '';
	return username;
}

/** Kind-0 picture URL. Empty when the event has no picture. */
export function identityPicture(profile: { picture?: string | null } | null | undefined): string {
	const picture = profile?.picture?.trim() ?? '';
	return picture;
}

/** Map a kind-0 JSON object so `name` and `display_name` are the human label. */
export function normalizeKind0Profile(raw: Record<string, unknown>): NostrProfile {
	const label = resolveDisplayNameFromProfileMetadataContent(raw);
	const picture = typeof raw.picture === 'string' ? raw.picture.trim() : '';
	const profile: NostrProfile = { ...(raw as NostrProfile) };
	if (label) {
		profile.display_name = label;
		profile.name = label;
	}
	if (picture) {
		profile.picture = picture;
	}
	return profile;
}
