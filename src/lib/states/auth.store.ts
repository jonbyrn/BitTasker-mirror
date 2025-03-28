import type { AuthState } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { Preferences } from '@capacitor/preferences';
import { user } from './user.store';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);

	return {
		subscribe,
		set,
		setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
		setError: (error: string | null) => update((state) => ({ ...state, error })),
		login: () => update((state) => ({ ...state, isAuthenticated: true, error: null })),
		logout: async () => {
			await Preferences.remove({ key: 'access_token' });
			user.reset();
			set(initialAuthState);
		}
	};
};

export const authState = createAuthStore();
