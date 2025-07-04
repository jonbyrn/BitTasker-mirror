import type { AuthState } from '$lib/types/auth';
import { user } from './user.store';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';

const initialAuthState: AuthState = {
	isAuthenticated: false,
	isLoading: false,
	error: null
};

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(initialAuthState);

	const logout = async () => {
		await Preferences.remove({ key: StorageKeys.ACCESS_TOKEN });
		await Preferences.remove({ key: StorageKeys.NPUB });
		await Preferences.remove({ key: StorageKeys.AUTH_METHOD });
		user.reset();
		set(initialAuthState);
	}

	return {
		subscribe,
		set,
		setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
		setError: (error: string | null) => update((state) => ({ ...state, error })),
		login: async () => {
			update((state) => ({ ...state, isAuthenticated: true, error: null }));
		},
		logout
	};
};

export const authState = createAuthStore();
export const isCaptchaVerified = writable(false);
