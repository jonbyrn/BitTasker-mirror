import type { UserData } from '$lib/types/auth';
import type { NostrEvent } from 'nostr-tools';
import { writable } from 'svelte/store';
import { getNpub } from '$lib/utils/nostrKeys';
import { identityLabel, identityPicture } from '$lib/nostr/profile/identity';
import { fetchProfileMetadata } from '$lib/nostr/profile/display-profile';

// Cache for Nostr events to prevent redundant fetching
export const nostrEventCache = new Map<string, { event: NostrEvent; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

// Helper to check if cache is valid
function isCacheValid(timestamp: number): boolean {
	return Date.now() - timestamp < CACHE_TTL;
}

// Helper to get cached event
export function getCachedEvent(kind: number, npub: string): NostrEvent | null {
	const cacheKey = `${kind}:${npub}`;
	const cached = nostrEventCache.get(cacheKey);
	if (cached && isCacheValid(cached.timestamp)) {
		return cached.event;
	}
	return null;
}

// Helper to cache event
export function cacheEvent(kind: number, npub: string, event: NostrEvent): void {
	const cacheKey = `${kind}:${npub}`;
	nostrEventCache.set(cacheKey, { event, timestamp: Date.now() });
}

// Initial States
const initialProfile: UserData = {
	id: 0,
	name: '',
	email: '',
	npub: '',
	picture: ''
};

const createUserStore = () => {
	const { subscribe, set, update } = writable<UserData>(initialProfile);

	// Track whether user data has been loaded in this session
	let isDataLoaded = false;

	return {
		subscribe,
		set,
		update,
		getUserData: async () => {
			// Skip if data is already loaded in this session
			if (isDataLoaded) return;
			const npub = await getNpub();

			if (!npub) {
				throw new Error('No public key found');
			}

			update((state) => ({
				...state,
				npub
			}));

			const profile = await fetchProfileMetadata(npub);
			const label = identityLabel({
				displayName: profile.display_name,
				name: profile.name
			});
			const picture = identityPicture(profile);
			update((state) => ({
				...state,
				name: label || state.name,
				picture: picture || state.picture
			}));

			// Mark data as loaded after successful fetch
			isDataLoaded = true;
		},
		updateProfile: (data: Partial<UserData>) =>
			update((state) => ({
				...state,
				...data
			})),
		reset: () => {
			isDataLoaded = false;
			set(initialProfile);
		}
	};
};

export const user = createUserStore();
