import type { UserData } from '$lib/types/auth';
import type { NostrEvent } from 'nostr-tools';
import { writable, get } from 'svelte/store';
import { appStore } from './app.store';
import { getNpub } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';

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

	const relays = get(appStore)?.relays ?? [];
	const pool = get(appStore).pool;

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
				npub: npub
			}));

			// Check if we have any valid relays
			if (relays.length === 0) {
				throw new Error('No valid relay URLs available');
			}

			// Check cache first for metadata
			const cachedMetadata = getCachedEvent(KINDS.PROFILE_METADATA, npub);
			let metadataEvents: NostrEvent[] = [];

			if (cachedMetadata) {
				metadataEvents = [cachedMetadata];
			} else {
				// Fetch metadata (kind 0) if not cached
				const metadataFilter = {
					authors: [npub],
					kinds: [KINDS.PROFILE_METADATA],
					limit: 1
				};
				metadataEvents = await pool.querySync(relays, metadataFilter);

				// Cache the metadata event
				if (metadataEvents.length > 0) {
					cacheEvent(KINDS.PROFILE_METADATA, npub, metadataEvents[0]);
				}
			}

			// Process metadata events
			let hasPicture = false;
			metadataEvents.forEach((event) => {
				if (event.kind === KINDS.PROFILE_METADATA) {
					const content = JSON.parse(event.content);
					const picture = content.picture || '';
					hasPicture = !!picture;

					update((state) => ({
						...state,
						name: content.display_name || content.displayName || content.name || '',
						picture: picture
					}));
				}
			});

			// Only fetch images if picture is not in metadata
			if (!hasPicture) {
				// Check cache for images
				const cachedImages = getCachedEvent(KINDS.PROFILE_IMAGES, npub);
				let imageEvents: NostrEvent[] = [];

				if (cachedImages) {
					imageEvents = [cachedImages];
				} else {
					const imagesFilter = {
						authors: [npub],
						kinds: [KINDS.PROFILE_IMAGES],
						'#d': ['profile-images'],
						limit: 1
					};
					imageEvents = await pool.querySync(relays, imagesFilter);

					// Cache the images event
					if (imageEvents.length > 0) {
						cacheEvent(KINDS.PROFILE_IMAGES, npub, imageEvents[0]);
					}
				}

				// Process image events to get profile picture
				imageEvents.forEach((event) => {
					if (event.kind === KINDS.PROFILE_IMAGES) {
						try {
							const images = JSON.parse(event.content);
							if (Array.isArray(images) && images.length > 0) {
								// Use the first image as the profile picture
								const primaryImage = images[0];
								update((state) => ({
									...state,
									picture: primaryImage.url || state.picture
								}));
							}
						} catch (err) {
							console.error('Failed to parse image event content:', err);
						}
					}
				});
			}

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

// Helper Functions
export function isProfileComplete(profile: UserData): boolean {
	return Boolean(profile.name && profile.email);
}
