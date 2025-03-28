import type { UserData } from '$lib/types/auth';
import { writable } from 'svelte/store';

// Initial States
const initialProfile: UserData = {
    name: '',
    email: '',
    npub: '',
    createdAt: new Date(),
    updatedAt: new Date()
};

const createUserStore = () => {
    const { subscribe, set, update } = writable<UserData>(initialProfile);

    return {
        subscribe,
        set,
        update,
        updateProfile: (profile: Partial<UserData>) =>
            update(state => ({
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
    return Boolean(
        profile.name &&
        profile.email
    );
}