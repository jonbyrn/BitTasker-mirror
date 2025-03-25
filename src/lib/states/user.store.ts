import type { UserData, AuthState } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';

// Initial States
const initialProfile: UserData = {
    name: '',
    email: '',
    npub: '',
    createdAt: new Date(),
    updatedAt: new Date()
};

const initialAuthState: AuthState = {
    isAuthenticated: false,
    isLoading: false,
    error: null
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

const createAuthStore = () => {
    const { subscribe, set, update } = writable<AuthState>(initialAuthState);

    return {
        subscribe,
        setLoading: (loading: boolean) =>
            update(state => ({ ...state, isLoading: loading })),
        setError: (error: string | null) =>
            update(state => ({ ...state, error })),
        login: () =>
            update(state => ({ ...state, isAuthenticated: true, error: null })),
        logout: async () => {
            await Preferences.remove({ key: 'access_token' });
            user.reset();
            set(initialAuthState);
        }
    };
};

export const user = createUserStore();
export const authState = createAuthStore();

// Helper Functions
export function isProfileComplete(profile: UserData): boolean {
    return Boolean(
        profile.name &&
        profile.email
    );
}