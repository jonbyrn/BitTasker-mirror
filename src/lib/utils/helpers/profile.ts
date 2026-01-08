/**
 * Get the profile URL for a given npub
 * @param npub - The Nostr public key in npub format
 * @returns The profile URL path
 */
export function getProfileUrl(npub: string): string {
	if (!npub) {
		return '/taskees';
	}
	return `/npub/${npub}`;
}

