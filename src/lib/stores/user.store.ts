import { PUBLIC_NOSTR_RELAY_URL } from '$env/static/public';
import type { UserData } from '$lib/types/auth';
import { getNpub } from '$lib/utils/nostrKeys';
import { SimplePool } from 'nostr-tools';
import { get, writable } from 'svelte/store';

// Initial States
const initialProfile: UserData = {
	name: '',
	email: '',
	npub: '',
	avatar: '',
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

			const filter = {
				authors: [npub],
				kinds: [0, 30063],
			};

			const events = await pool.querySync([PUBLIC_NOSTR_RELAY_URL], filter);
			events.forEach((event) => {
				if (event.kind === 0) {
					const content = JSON.parse(event.content);
					update((state) => ({
						...state,
						name: content.displayName,
					}));
				}
				if (event.kind === 30063 && event.tags.find((t) => t[0] === 'd' && t[1] === 'profile-images')) {
					const content = JSON.parse(event.content);
					update((state) => ({
						...state,
						avatar: content[0].url
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
