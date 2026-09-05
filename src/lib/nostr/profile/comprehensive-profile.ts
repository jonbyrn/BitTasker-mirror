import type { NostrProfile } from '$lib/types/profile.d';

/** Native profile aggregate used by Nostr service discovery. */
export type ComprehensiveProfile = NostrProfile & {
	services?: unknown[];
	reviews?: unknown[];
};
