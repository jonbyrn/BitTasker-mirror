/**
 * Generate a public profile URL from an npub
 * @param npub - The npub (public key) in npub1... format or hex format
 * @returns The profile URL path
 */
export function getProfileUrl(npub: string): string {
	if (!npub) {
		console.warn('getProfileUrl: npub is missing');
		return '#';
	}
	return `/npub/${npub}`;
}

