import type { UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { SimplePool } from 'nostr-tools';
import { getNpub } from '$lib/utils/nostrKeys';

// Define relay URLs with fallbacks
const RELAYS = [import.meta.env.VITE_NOSTR_RELAY_URL].filter(Boolean); // Remove any undefined values

// Initial States
const initialProfile: UserData = {
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

			const filter = {
				authors: [npub],
				kinds: [0]
			};

			const events = await pool.querySync(RELAYS, filter);
			events.forEach((event) => {
				if (event.kind === 0) {
					const content = JSON.parse(event.content);
					update((state) => ({
						...state,
						name: content.display_name || content.displayName || content.name || '',
						picture: content.picture || ''
					}));
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
