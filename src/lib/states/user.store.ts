import { writable } from 'svelte/store';
import type { UserType, AuthState } from '$lib/types/user';

// Initial States
const initialProfile: UserType = {
    id: '',
    name: '',
    email: '',
    publicKey: '',
    createdAt: new Date(),
    updatedAt: new Date()
};

const initialAuthState: AuthState = {
    isAuthenticated: false,
    isLoading: false,
    error: null
};

const createUserStore = () => {
    const { subscribe, set, update } = writable<UserType>(initialProfile);

    return {
        subscribe,
        set,
        update,
        updateProfile: (profile: Partial<UserType>) => 
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
        login: (profile: UserType) =>
            update(state => ({ ...state, isAuthenticated: true, error: null })),
        logout: () => set(initialAuthState)
    };
};

export const user = createUserStore();
export const authState = createAuthStore();

// Helper Functions
export function isProfileComplete(profile: UserType): boolean {
    return Boolean(
        profile.id &&
        profile.name &&
        profile.email &&
        profile.publicKey
    );
}