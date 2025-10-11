import type { UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { SimplePool } from 'nostr-tools';
import { getNpub } from '$lib/utils/nostrKeys';
import KINDS from '$lib/utils/constants/kinds';

// Define relay URLs with fallbacks
const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

// Initial States
const initialProfile: UserData = {
	id: 0,
	name: '',
	email: '',
	npub: '',
	picture: '',
	createdAt: new Date(),
	updatedAt: new Date()
};

const createUserStore = () => {
	const { subscribe, set, update } = writable<UserData>(initialProfile);
	const pool = new SimplePool();

	return {
		subscribe,
		set,
		update,
		getUserData: async () => {
			const npub = await getNpub();

			if (!npub) {
				throw new Error('No public key found');
			}

			update((state) => ({
				...state,
				npub: npub
			}));

			// Check if we have any valid relays
			if (RELAYS.length === 0) {
				throw new Error('No valid relay URLs available');
			}

			// Fetch both metadata (kind 0) and images (kind 30063)
			const metadataFilter = {
				authors: [npub],
				kinds: [KINDS.PROFILE_METADATA]
			};

			const imagesFilter = {
				authors: [npub],
				kinds: [KINDS.PROFILE_IMAGES],
				'#d': ['profile-images']
			};

			const [metadataEvents, imageEvents] = await Promise.all([
				pool.querySync(RELAYS, metadataFilter),
				pool.querySync(RELAYS, imagesFilter)
			]);

			// Process metadata events
			metadataEvents.forEach((event) => {
				if (event.kind === KINDS.PROFILE_METADATA) {
					const content = JSON.parse(event.content);
					update((state) => ({
						...state,
						name: content.display_name || content.displayName || content.name || '',
						picture: content.picture || '' // This might be empty if using new image system
					}));
				}
			});

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
		},
		updateProfile: (profile: Partial<UserData>) =>
			update((state) => ({
				...state,
				...profile,
				updatedAt: new Date()
			})),
		reset: () => set(initialProfile)
	};
};

export const user = createUserStore();

// Helper Functions
export function isProfileComplete(profile: UserData): boolean {
	return Boolean(profile.name && profile.email);
}
