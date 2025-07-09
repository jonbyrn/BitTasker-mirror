import type { AuthState, Credentials } from '$lib/types/auth';
import { user } from './user.store';
import { writable } from 'svelte/store';
import { StorageKeys } from '$lib/utils/constants/storage';
import { Preferences } from '@capacitor/preferences';
import { goto } from '$app/navigation';
import { appStore } from './app.store';

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
		appStore.update((state) => ({ ...state, biometricData: null }));
		user.reset();
		set(initialAuthState);
	}

	const setupAuthData = async (accessToken: string, authMethod: string, npub: string, user: any, biometricData?: Credentials) => {
		await Preferences.set({
			key: StorageKeys.ACCESS_TOKEN,
			value: accessToken
		});
		// TODO: To be removed after getting auth method from the server
		await Preferences.set({
			key: StorageKeys.AUTH_METHOD,
			value: authMethod
		});
		await Preferences.set({
			key: StorageKeys.NPUB,
			value: npub
		});
		if (user) {
			user.updateProfile(user);
		}
		authState.login();
		if (biometricData) {
			appStore.update((state) => ({ ...state, biometricData }));
		}
		goto('/dashboard/find-tasks');
	}

	return {
		subscribe,
		set,
		setLoading: (loading: boolean) => update((state) => ({ ...state, isLoading: loading })),
		setError: (error: string | null) => update((state) => ({ ...state, error })),
		login: async () => {
			update((state) => ({ ...state, isAuthenticated: true, error: null }));
		},
		logout,
		setupAuthData
	};
};

export const authState = createAuthStore();
export const isCaptchaVerified = writable(false);
