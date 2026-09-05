import type { NostrProfile } from '$lib/types/profile.d';
import { fetchProfileMetadata as fetchProfile } from '$lib/nostr/profile';

export async function fetchProfileMetadata(pubkey: string): Promise<NostrProfile> {
	return fetchProfile(pubkey);
}