import type { AuthState } from '$lib/types/auth';
import { writable } from 'svelte/store';
import { user } from './user.store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { TokenManager } from '$lib/utils/houdini/plugins/customAuthPlugin';
import { browser } from '$app/environment';

// Only import Capacitor modules in browser
let Preferences: any = null;
if (browser) {
	import('@capacitor/preferences').then(module => {
		Preferences = module.Preferences;
	});
}

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
		login: async () => {
			// Save token using TokenManager
			// await TokenManager.setToken(token);
			update((state) => ({ ...state, isAuthenticated: true, error: null }));
		},
		logout: async () => {
			// Clear token using TokenManager
			// await TokenManager.clearToken();
			// Also remove refresh token
			if (browser && Preferences) {
				await Preferences.remove({ key: StorageKeys.REFRESH_TOKEN });
			}
			user.reset();
			set(initialAuthState);
		}
	};
};

export const authState = createAuthStore();
